import asyncio
from datetime import timedelta
from typing import Optional
from temporalio import workflow

# Import activities for type references
with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import (
        db_create_run_activity,
        db_log_activity_activity,
        db_update_run_status_activity,
        classify_event_activity,
        run_agent_step_activity,
        generate_final_summary_activity
    )

@workflow.defn
class OrderSupervisorWorkflow:
    def __init__(self) -> None:
        self.run_id = ""
        self._events_queue = []
        self._instructions_queue = []
        self._terminal_event_received = False
        self._manual_terminated = False
        self._wake_up_time = None
        self._is_paused = False
        self._memory_summary = "Initializing workflow."
        self._wake_up_guidance = "Wake up on any critical problems."
        self._status = "active"
        self._loop_iteration_count = 0

    @workflow.signal
    def signal_event(self, name: str, payload: dict) -> None:
        self._events_queue.append({"name": name, "payload": payload})

    @workflow.signal
    def signal_instruction(self, text: str) -> None:
        self._instructions_queue.append(text)

    @workflow.signal
    def signal_pause(self) -> None:
        self._is_paused = True
        self._status = "paused"

    @workflow.signal
    def signal_resume(self) -> None:
        self._is_paused = False
        self._status = "active"

    @workflow.signal
    def signal_terminate(self) -> None:
        self._manual_terminated = True
        self._status = "terminated"

    @workflow.query
    def get_status(self) -> str:
        return self._status

    @workflow.query
    def get_memory_summary(self) -> str:
        return self._memory_summary

    @workflow.query
    def get_next_wakeup(self) -> str:
        return self._wake_up_time.isoformat() if self._wake_up_time else None

    @workflow.run
    async def run(
        self,
        order_id: str,
        supervisor_id: str,
        # Carry-forward state passed from a previous continue_as_new execution.
        # All three are None / 0 on the very first workflow start.
        carried_memory_summary: Optional[str] = None,
        carried_wake_up_guidance: Optional[str] = None,
        carried_loop_iteration_count: int = 0,
    ) -> dict:
        self.run_id = workflow.info().workflow_id

        # Detect whether this is a fresh start or a continued execution
        is_continued = carried_memory_summary is not None
        if is_continued:
            self._memory_summary = carried_memory_summary
            self._wake_up_guidance = carried_wake_up_guidance
            self._loop_iteration_count = carried_loop_iteration_count

        # Trigger continue_as_new after this many loop iterations.
        # Each iteration = one complete wake-up cycle (signal or timer).
        # At ~5 Temporal history events per iteration, 100 iterations ≈ ~500 history events,
        # well below Temporal's 50k-event default limit.
        CONTINUE_AS_NEW_THRESHOLD = 100

        # 1. Initialize Run in Database — only on the very first start, not on continued runs.
        if not is_continued:
            await workflow.execute_activity(
                db_create_run_activity,
                args=[self.run_id, supervisor_id, order_id],
                start_to_close_timeout=timedelta(seconds=15)
            )

            await workflow.execute_activity(
                db_log_activity_activity,
                args=[self.run_id, "status_change", "supervisor_started", {"message": "Workflow created and monitoring initialized."}],
                start_to_close_timeout=timedelta(seconds=10)
            )

            # 2. Run first Main Agent reasoning step (Wake-on-start)
            agent_res = await workflow.execute_activity(
                run_agent_step_activity,
                args=[self.run_id, "workflow_start"],
                start_to_close_timeout=timedelta(seconds=150)
            )
            self._memory_summary = agent_res.get("memory_summary", self._memory_summary)
            self._wake_up_guidance = agent_res.get("wake_up_guidance", self._wake_up_guidance)
            sleep_duration = agent_res.get("sleep_duration_seconds", 3600)
            self._wake_up_time = workflow.now() + timedelta(seconds=sleep_duration) if sleep_duration > 0 else None

        # 3. Main Event Loop
        while not self._terminal_event_received and not self._manual_terminated:

            # ── continue_as_new guard ──────────────────────────────────────────
            # When the loop iteration count hits the threshold, atomically restart
            # the workflow with a clean history while passing all live state forward.
            # The DB run record, timeline, and memory are untouched — only Temporal's
            # internal event history is truncated, which is the entire point.
            if self._loop_iteration_count >= CONTINUE_AS_NEW_THRESHOLD:
                workflow.continue_as_new(
                    args=[
                        order_id,
                        supervisor_id,
                        self._memory_summary,       # carry forward memory
                        self._wake_up_guidance,     # carry forward classifier guidance
                        self._loop_iteration_count, # carry forward count (keeps growing)
                    ]
                )
            # ──────────────────────────────────────────────────────────────────

            # Handle Paused State
            if self._is_paused:
                await workflow.execute_activity(
                    db_update_run_status_activity,
                    args=[self.run_id, "paused"],
                    start_to_close_timeout=timedelta(seconds=10)
                )
                await workflow.wait_condition(lambda: not self._is_paused)
                await workflow.execute_activity(
                    db_update_run_status_activity,
                    args=[self.run_id, "active"],
                    start_to_close_timeout=timedelta(seconds=10)
                )

            if self._manual_terminated:
                break

            # Calculate timer interval
            now = workflow.now()
            sleep_interval = None
            if self._wake_up_time:
                sleep_interval = (self._wake_up_time - now).total_seconds()

            woken_by_signal = False
            if sleep_interval and sleep_interval > 0:
                try:
                    await workflow.wait_condition(
                        lambda: len(self._events_queue) > 0 or len(self._instructions_queue) > 0 or self._manual_terminated or self._is_paused,
                        timeout=sleep_interval
                    )
                    woken_by_signal = True
                except asyncio.TimeoutError:
                    woken_by_signal = False
            else:
                await workflow.wait_condition(
                    lambda: len(self._events_queue) > 0 or len(self._instructions_queue) > 0 or self._manual_terminated or self._is_paused
                )
                woken_by_signal = True

            if self._manual_terminated or self._is_paused:
                continue

            if woken_by_signal:
                # Process Manual instructions first (these always wake the main agent)
                if len(self._instructions_queue) > 0:
                    while len(self._instructions_queue) > 0:
                        instr = self._instructions_queue.pop(0)
                        await workflow.execute_activity(
                            db_log_activity_activity,
                            args=[self.run_id, "manual_instruction", "instruction_added", {"text": instr}],
                            start_to_close_timeout=timedelta(seconds=10)
                        )

                    agent_res = await workflow.execute_activity(
                        run_agent_step_activity,
                        args=[self.run_id, "manual_instruction"],
                        start_to_close_timeout=timedelta(seconds=150)
                    )
                    self._memory_summary = agent_res.get("memory_summary", self._memory_summary)
                    self._wake_up_guidance = agent_res.get("wake_up_guidance", self._wake_up_guidance)
                    sleep_duration = agent_res.get("sleep_duration_seconds", 3600)
                    self._wake_up_time = workflow.now() + timedelta(seconds=sleep_duration) if sleep_duration > 0 else None

                # Process system events
                if len(self._events_queue) > 0:
                    should_wake_main_agent = False
                    trigger_reason = ""

                    while len(self._events_queue) > 0:
                        event = self._events_queue.pop(0)
                        event_name = event["name"]
                        event_payload = event["payload"]

                        await workflow.execute_activity(
                            db_log_activity_activity,
                            args=[self.run_id, "system_event", event_name, event_payload],
                            start_to_close_timeout=timedelta(seconds=10)
                        )

                        # Lifecycle terminal state rules
                        if event_name in ["delivered", "refund_requested"]:
                            self._terminal_event_received = True

                        classifier_res = await workflow.execute_activity(
                            classify_event_activity,
                            args=[event_name, event_payload, self._memory_summary, self._wake_up_guidance],
                            start_to_close_timeout=timedelta(seconds=20)
                        )

                        should_wake = classifier_res.get("should_wake", True)
                        classifier_reason = classifier_res.get("reasoning", "Routing decision.")

                        await workflow.execute_activity(
                            db_log_activity_activity,
                            args=[self.run_id, "classifier_decision", event_name, {"should_wake": should_wake, "reasoning": classifier_reason}],
                            start_to_close_timeout=timedelta(seconds=10)
                        )

                        if should_wake or self._terminal_event_received:
                            should_wake_main_agent = True
                            trigger_reason = f"event: {event_name}"

                    if should_wake_main_agent:
                        agent_res = await workflow.execute_activity(
                            run_agent_step_activity,
                            args=[self.run_id, trigger_reason],
                            start_to_close_timeout=timedelta(seconds=150)
                        )
                        self._memory_summary = agent_res.get("memory_summary", self._memory_summary)
                        self._wake_up_guidance = agent_res.get("wake_up_guidance", self._wake_up_guidance)
                        sleep_duration = agent_res.get("sleep_duration_seconds", 3600)
                        self._wake_up_time = workflow.now() + timedelta(seconds=sleep_duration) if sleep_duration > 0 else None
            else:
                # Woken by scheduled timer
                await workflow.execute_activity(
                    db_log_activity_activity,
                    args=[self.run_id, "status_change", "scheduled_wakeup", {"message": "Scheduled check-in timer expired."}],
                    start_to_close_timeout=timedelta(seconds=10)
                )

                agent_res = await workflow.execute_activity(
                    run_agent_step_activity,
                    args=[self.run_id, "scheduled_wakeup"],
                    start_to_close_timeout=timedelta(seconds=150)
                )
                self._memory_summary = agent_res.get("memory_summary", self._memory_summary)
                self._wake_up_guidance = agent_res.get("wake_up_guidance", self._wake_up_guidance)
                sleep_duration = agent_res.get("sleep_duration_seconds", 3600)
                self._wake_up_time = workflow.now() + timedelta(seconds=sleep_duration) if sleep_duration > 0 else None

            # Increment after each complete wake cycle
            self._loop_iteration_count += 1

        # 4. Final summary, learnings, and completion report
        new_status = "terminated" if self._manual_terminated else "completed"
        await workflow.execute_activity(
            db_update_run_status_activity,
            args=[self.run_id, new_status],
            start_to_close_timeout=timedelta(seconds=10)
        )

        final_summary = await workflow.execute_activity(
            generate_final_summary_activity,
            args=[self.run_id],
            start_to_close_timeout=timedelta(seconds=150)
        )

        return final_summary
