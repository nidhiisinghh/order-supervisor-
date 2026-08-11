# Order Supervisor AI

A long-running AI supervisor that oversees a single order from creation to completion using Temporal, FastAPI and Next.js.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│  Dashboard · Event Simulator · Timeline · Memory · Controls │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP (REST)
┌────────────────────────────▼────────────────────────────────┐
│                    FastAPI Backend                          │
│  /api/supervisors  /api/runs  /api/runs/{id}/events  ...   │
└──────────────┬──────────────────────────┬───────────────────┘
               │ Temporal SDK             │ SQLAlchemy ORM
┌──────────────▼──────────┐   ┌───────────▼───────────────────┐
│   Temporal Server       │   │     PostgreSQL Database       │
│   (Docker, port 7233)   │   │   supervisors · runs ·        │
│                         │   │   activities (timeline)       │
│  OrderSupervisorWorkflow│   └───────────────────────────────┘
│  ├─ signal_event        │
│  ├─ signal_instruction  │   ┌───────────────────────────────┐
│  ├─ signal_pause/resume │   │      Groq LLM API             │
│  └─ signal_terminate    │   │  llama-3.3-70b-versatile      │
│                         │◄──│  Main Agent + Classifier      │
│  Temporal Worker        │   └───────────────────────────────┘
│  ├─ Event Classifier    │
│  └─ Main Agent Runtime  │
└─────────────────────────┘
```

---

## Prerequisites

- **Docker & Docker Compose** — for PostgreSQL and Temporal
- **Python 3.9+**
- **Node.js 18+**
- **Groq API key** — [get one free at console.groq.com](https://console.groq.com)

---

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd sagepilot
```

### 2. Start infrastructure (PostgreSQL + Temporal)

```bash
docker-compose up -d
```

Wait ~15 seconds for Temporal to fully initialise before starting the backend.

### 3. Configure the backend

```bash
cd backend
```

Create a `.env` file:

```env
DATABASE_URL=postgresql://postgres:postgrespassword@127.0.0.1:5435/sagepilot
TEMPORAL_HOST=localhost:7233
GROQ_API_KEY=your_groq_api_key_here
PORT=8000
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

### 4. Start the backend (FastAPI + Temporal Worker)

```bash
./run.sh
```

This single script starts:
- The **Temporal Worker** (polls `order-supervisor-task-queue`)
- The **FastAPI server** on `http://localhost:8000`

On first start, the database tables are auto-created and 5 supervisor templates are seeded.

### 5. Start the frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Usage

### Quick Demo via Script

Run a full end-to-end simulation without touching the UI:

```bash
cd backend
python3 test_flow.py
```

This fires the full order lifecycle: start → payment confirmed → shipment delayed → custom instruction → delivered → final summary.

### Using the UI

1. **Templates tab** — view or create supervisor configurations with custom base instructions, model choice, and aggressiveness level.
2. **Start a Run** — select a template, enter an Order ID, optionally add initial instructions.
3. **Dashboard** — select any active run to see:
   - Live timeline (events, classifier decisions, agent reasoning, tool executions)
   - Compact memory summary and sleep state
   - Event simulator panel (inject any of 9 event types)
   - Human directive input (add live instructions to the running workflow)
4. **Controls** — Interrupt / Resume / Terminate from the top bar. Delete completed/terminated runs via the `⋯` menu.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/supervisors` | Create a supervisor template |
| `GET` | `/api/supervisors` | List all templates |
| `GET` | `/api/supervisors/{id}` | Get a template |
| `POST` | `/api/runs` | Start a new order run |
| `GET` | `/api/runs` | List all runs |
| `GET` | `/api/runs/{id}` | Get run details |
| `GET` | `/api/runs/{id}/timeline` | Get full activity timeline |
| `POST` | `/api/runs/{id}/events` | Inject an event signal |
| `POST` | `/api/runs/{id}/instructions` | Add a live instruction |
| `POST` | `/api/runs/{id}/interrupt` | Pause the workflow |
| `POST` | `/api/runs/{id}/resume` | Resume the workflow |
| `POST` | `/api/runs/{id}/terminate` | Terminate the workflow |
| `DELETE` | `/api/runs/{id}` | Delete a completed/terminated run |

---

## Project Structure

```
sagepilot/
├── docker-compose.yml          # PostgreSQL + Temporal
├── backend/
│   ├── run.sh                  # Starts worker + FastAPI server
│   ├── test_flow.py            # End-to-end simulation script
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app + all API routes
│       ├── database.py         # SQLAlchemy models (Supervisor, Run, Activity)
│       ├── schemas.py          # Pydantic request/response schemas
│       ├── config.py           # Environment variable loading
│       ├── agent/
│       │   ├── runtime.py      # Main LLM reasoning agent (Groq)
│       │   └── classifier.py   # Lightweight event classifier (Groq)
│       └── temporal/
│           ├── worker.py       # Temporal worker registration
│           ├── workflows.py    # OrderSupervisorWorkflow definition
│           └── activities.py   # All Temporal activities
└── frontend/
    └── src/app/
        ├── page.tsx            # Main dashboard
        └── templates/page.tsx  # Supervisor template management
```

---

## Design Notes

- **One workflow per order** — each order gets its own `OrderSupervisorWorkflow` Temporal execution, identified by `order-supervisor-{order_id}`.
- **Three wake triggers** — workflow start, incoming signal, scheduled timer.
- **Two-engine architecture** — a lightweight **Classifier** (fast, cheap) decides if the full **Main Agent** (expensive, powerful) needs to wake up. Most routine events don't wake the main agent.
- **Agent-generated guidance** — after each main agent reasoning step, it updates the classifier's wake-up guidance, teaching it which future events matter for this specific order.
- **`continue_as_new`** — after 100 wake cycles, the workflow transparently restarts with a fresh Temporal history while carrying all state forward, preventing unbounded history growth.
- **State-locked deletion** — the API rejects deletion of active or paused runs at the backend level. The frontend enforces this with a lock icon and tooltip.
