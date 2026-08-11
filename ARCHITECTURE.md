# Architecture Note — Order Supervisor AI

## Overview

The system is a long-running AI supervisor that oversees an e-commerce order from placement to resolution. One Temporal workflow runs per order and remains alive until a terminal event arrives or the user manually terminates it.

---

## Core Design Decisions

### 1. One Workflow Per Order
Each order maps to a single `OrderSupervisorWorkflow` Temporal execution with ID `order-supervisor-{order_id}`. This gives us Temporal's built-in durability, signal routing, and timer management for free — the workflow survives server restarts, crashes, and deployments without any custom recovery logic.

### 2. Two-Engine Agent Architecture
Running a large LLM on every incoming event would be wasteful and slow. Instead, the system uses two components:

- **Lightweight Classifier** (`classifier.py`) — A fast, low-token Groq call that receives each incoming event and the current wake-up guidance, then returns `should_wake: true/false` with a reason. This runs in under 2 seconds.
- **Main Agent** (`runtime.py`) — The full reasoning agent. It reads the order history, executes business actions, updates the compact memory summary, writes new wake-up guidance for the classifier, and sets its next sleep duration.

The main agent only runs when the classifier says an event is critical, or when the scheduled timer fires. Most routine events are silently logged and the agent stays asleep.

### 3. Agent-Generated Wake-Up Guidance
After each main agent reasoning step, the agent updates the classifier's guidance string — effectively teaching the classifier what to look for in the *next* events for this specific order. This is stored in workflow state and passed to the classifier on every subsequent event.

### 4. Three Wake Triggers
```
workflow_start      → agent runs immediately on start
signal (event/instruction) → classifier decides → agent may run
timer expiry        → agent always runs on scheduled wake-up
```
This mirrors the assignment's requirement precisely while keeping the agent from running in a tight loop.

### 5. Persistence Layer
A single `activities` table stores everything in a unified timeline:
- Incoming system events
- Classifier decisions (wake/sleep)
- Agent reasoning steps
- Tool executions (business actions)
- Manual human instructions
- Status changes

Each run also stores a `memory_summary` string (the agent's rolling compact state) and a `final_summary` JSON object (produced at workflow end).

### 6. Workflow Completion Rules
The workflow does **not** end because the agent decides to end it. It ends when:
- A terminal event (`delivered`, `refund_requested`) is received as a signal
- The user explicitly terminates from the UI (sends `signal_terminate`)

The agent may log a recommendation to close, but the workflow lifecycle is controlled entirely by these explicit rules.

### 7. `continue_as_new` for Long Histories
Temporal stores the full execution history in memory. For very long-running orders, this can grow unboundedly. After **100 loop iterations** (≈500 Temporal history events), the workflow calls `continue_as_new`, restarting with a fresh history while carrying forward:
- `memory_summary`
- `wake_up_guidance`
- `loop_iteration_count`

The DB run record and timeline are completely untouched — only Temporal's internal event history is truncated, which is the entire point of `continue_as_new`.

### 8. State-Locked Deletion
The API rejects `DELETE /api/runs/{id}` with `400 Bad Request` if the run is `active` or `paused`. The workflow must first be terminated or reach completion before the DB record can be removed. The frontend enforces this with a lock icon and tooltip.

---

## Data Flow — Signal Path

```
User injects event in UI
    → POST /api/runs/{id}/events
        → handle.signal(signal_event, args=[name, payload])
            → Temporal delivers signal to running workflow
                → event appended to _events_queue
                    → wait_condition unblocks
                        → Classifier activity runs (fast LLM call, ~2s)
                            → if should_wake = True:
                                → Main Agent activity runs (~5–10s)
                                    → Business actions logged to DB
                                    → memory_summary updated in workflow state
                                    → New wake-up guidance written
                                    → Next sleep timer set
```

---

## Technology Choices

| Component | Choice | Reason |
|-----------|--------|--------|
| Orchestration | Temporal Python SDK | Durable execution, signal handling, built-in timers — exactly what long-running workflows need |
| LLM | Groq (llama-3.3-70b-versatile) | Fast inference, JSON mode, free tier |
| Backend | FastAPI | Async-native, clean OpenAPI, pairs naturally with Temporal's async SDK |
| Database | PostgreSQL via SQLAlchemy | Reliable, straightforward schema, excellent ORM support |
| Frontend | Next.js 16 + App Router | Modern React patterns, fast to iterate |
