import json
import uuid
from datetime import datetime, timedelta
from temporalio import activity
from app.database import SessionLocal, Run, Activity as DBActivity, Supervisor
from app.agent.classifier import classify_event_sync
from app.agent.runtime import run_agent_step_sync
from groq import Groq
from app.config import GROQ_API_KEY

@activity.defn
async def db_create_run_activity(run_id: str, supervisor_id: str, order_id: str) -> None:
    db = SessionLocal()
    try:
        # Check if run already exists
        existing = db.query(Run).filter(Run.id == run_id).first()
        if not existing:
            new_run = Run(
                id=run_id,
                supervisor_id=uuid.UUID(supervisor_id),
                order_id=order_id,
                status="active",
                memory_summary="Supervisor started."
            )
            db.add(new_run)
            db.commit()
    finally:
        db.close()

@activity.defn
async def db_log_activity_activity(run_id: str, activity_type: str, name: str, payload: dict) -> None:
    db = SessionLocal()
    try:
        new_activity = DBActivity(
            run_id=run_id,
            type=activity_type,
            name=name,
            payload=payload,
            timestamp=datetime.utcnow()
        )
        db.add(new_activity)
        db.commit()
    finally:
        db.close()

@activity.defn
async def db_update_run_status_activity(run_id: str, status: str) -> None:
    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if run:
            run.status = status
            db.commit()
    finally:
        db.close()

@activity.defn
async def classify_event_activity(event_name: str, event_payload: dict, memory_summary: str, wake_up_guidance: str) -> dict:
    should_wake, reasoning = classify_event_sync(event_name, event_payload, memory_summary, wake_up_guidance)
    return {"should_wake": should_wake, "reasoning": reasoning}

@activity.defn
async def run_agent_step_activity(run_id: str, context: str) -> dict:
    db = SessionLocal()
    try:
        # 1. Fetch Run details
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            return {"error": "Run not found"}
        
        # 2. Fetch Supervisor Template details
        supervisor = db.query(Supervisor).filter(Supervisor.id == run.supervisor_id).first()
        if not supervisor:
            return {"error": "Supervisor template not found"}
        
        # 3. Fetch all run-specific instructions logged as activities
        instruction_records = db.query(DBActivity).filter(
            DBActivity.run_id == run_id,
            DBActivity.type == "manual_instruction"
        ).order_by(DBActivity.timestamp.asc()).all()
        run_instructions = [rec.payload.get("text", "") for rec in instruction_records if rec.payload]

        # 4. Fetch recent activity timeline
        activity_records = db.query(DBActivity).filter(
            DBActivity.run_id == run_id
        ).order_by(DBActivity.timestamp.asc()).all()
        
        recent_activities = []
        for rec in activity_records:
            recent_activities.append({
                "timestamp": rec.timestamp.isoformat(),
                "type": rec.type,
                "name": rec.name,
                "payload": rec.payload
            })

        # Parse actions/tools available (for this POC, all 5 actions are available)
        available_actions = [
            "message_fulfillment_team",
            "message_payments_team",
            "message_logistics_team",
            "message_customer",
            "create_internal_note"
        ]

        # 5. Call LLM agent step
        result = run_agent_step_sync(
            model_choice=supervisor.model_choice,
            base_instruction=supervisor.base_instruction,
            run_instructions=run_instructions,
            memory_summary=run.memory_summary,
            recent_activities=recent_activities,
            available_actions=available_actions
        )

        # 6. Process agent decisions
        reasoning = result.get("reasoning", "")
        actions = result.get("actions", [])
        new_memory = result.get("new_memory_summary", run.memory_summary)
        sleep_seconds = result.get("sleep_duration_seconds", 3600)
        new_wake_up_guidance = result.get("new_wake_up_guidance", "")

        # Log reasoning to timeline
        reasoning_act = DBActivity(
            run_id=run_id,
            type="agent_reasoning",
            name="agent_thought",
            payload={"reasoning": reasoning, "context": context},
            timestamp=datetime.utcnow()
        )
        db.add(reasoning_act)

        # Log and execute business actions (mocked as DB records)
        for act in actions:
            action_name = act.get("name")
            action_args = act.get("args", {})
            action_log = DBActivity(
                run_id=run_id,
                type="tool_execution",
                name=action_name,
                payload=action_args,
                timestamp=datetime.utcnow()
            )
            db.add(action_log)

        # Update run model in DB
        next_wakeup = datetime.utcnow() + timedelta(seconds=sleep_seconds) if sleep_seconds > 0 else None
        
        run.memory_summary = new_memory
        run.next_wakeup_time = next_wakeup
        
        db.commit()

        # Return parameters to workflow
        return {
            "sleep_duration_seconds": sleep_seconds,
            "wake_up_guidance": new_wake_up_guidance,
            "memory_summary": new_memory
        }

    finally:
        db.close()

@activity.defn
async def generate_final_summary_activity(run_id: str) -> dict:
    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            return {"error": "Run not found"}

        # Fetch entire activity log for context
        activity_records = db.query(DBActivity).filter(
            DBActivity.run_id == run_id
        ).order_by(DBActivity.timestamp.asc()).all()
        
        formatted_activities = ""
        for rec in activity_records:
            payload_str = json.dumps(rec.payload) if rec.payload else ""
            formatted_activities += f"[{rec.timestamp}] {rec.type.upper()} - {rec.name}: {payload_str[:300]}\n"

        if not GROQ_API_KEY:
            summary_output = {
                "summary": "Order workflow complete. Groq API Key missing, summary generated with defaults.",
                "actions_taken": "Logged lifecycle steps.",
                "learnings": "Needs API integration.",
                "recommendations": "Provide Groq key."
            }
            run.final_summary = summary_output
            run.status = "completed"
            db.commit()
            return summary_output

        client = Groq(api_key=GROQ_API_KEY)

        system_prompt = (
            "You are the final review agent for an Order Supervisor AI system. "
            "Your task is to compile a complete end-of-run summary of the order. "
            "All currency, price, and money values throughout the summary must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
            "You must output ONLY a valid JSON object matching this structure:\n"
            "{\n"
            '  "summary": "A comprehensive summary of the order lifecycle and final resolution.",\n'
            '  "actions_taken": "A bulleted or text description of all actions taken during the run.",\n'
            '  "learnings": "Key learnings and insights gained from watching this order.",\n'
            '  "recommendations": "Actionable feedback or process recommendations for future orders."\n'
            "}"
        )

        user_prompt = f"""Review the entire activity timeline of the order run and compile the final summary and report.

---
ORDER ID: {run.order_id}
RUN ID: {run_id}

COMPLETE TIMELINE:
{formatted_activities}
---

Generate the required JSON output now.
"""

        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=800
        )
        
        summary_output = json.loads(response.choices[0].message.content)
        
        run.final_summary = summary_output
        run.status = "completed"
        db.commit()

        # Log completion event to activity table
        completion_log = DBActivity(
            run_id=run_id,
            type="status_change",
            name="workflow_completed",
            payload={"summary": summary_output.get("summary")},
            timestamp=datetime.utcnow()
        )
        db.add(completion_log)
        db.commit()

        return summary_output
    except Exception as e:
        print(f"Error generating final summary: {e}")
        fallback = {
            "summary": f"Workflow completed with errors: {str(e)}",
            "actions_taken": "Actions logged in timeline.",
            "learnings": "Error occurred during final summarization.",
            "recommendations": "Review error log."
        }
        run.final_summary = fallback
        run.status = "completed"
        db.commit()
        return fallback
    finally:
        db.close()
