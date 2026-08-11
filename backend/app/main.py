import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

from app.config import TEMPORAL_HOST
from app.database import init_db, get_db, Supervisor, Run, Activity as DBActivity
from app.schemas import (
    SupervisorCreate, SupervisorResponse,
    RunCreate, RunResponse,
    ActivityResponse, EventInput, InstructionInput
)
from app.temporal.workflows import OrderSupervisorWorkflow

# Async context manager for lifespan (FastAPI >= 0.93.0)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    init_db()
    
    # Seed default supervisor templates if they don't exist
    db = next(get_db())
    try:
        templates_to_seed = [
            {
                "name": "Premium Express Order Supervisor",
                "base_instruction": (
                    "You are supervising high-value orders. "
                    "All money and price values must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
                    "1. When payment is confirmed, message the fulfillment team immediately to prioritize packing.\n"
                    "2. If payment fails, alert the customer immediately and create an internal note for billing support.\n"
                    "3. If shipment is delayed, message the logistics team for updates, then message the customer with an apology and a discount code.\n"
                    "4. If shipment is delivered, message the customer thanking them and asking for a review.\n"
                    "5. Keep notes of all team contact in internal notes."
                ),
                "default_wakeup_behavior": "Sleep 2 hours, wake on delay or message.",
                "model_choice": "llama-3.1-70b-versatile",
                "aggressiveness": "high"
            },
            {
                "name": "Cold-Chain Logistics Supervisor",
                "base_instruction": (
                    "You are supervising high-priority cold-chain pharmaceutical/perishable deliveries.\n"
                    "All money and price values must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
                    "1. If temperature sensor alerts show temp > 4°C, immediately notify the courier to verify refrigeration status and write an internal alert.\n"
                    "2. If delivery is delayed by more than 2 hours, message logistics to prepare emergency dry ice swap.\n"
                    "3. If successfully delivered within compliance window, thank customer and record compliance log."
                ),
                "default_wakeup_behavior": "Wake every 30 minutes, or instantly on temp sensor trigger.",
                "model_choice": "llama-3.1-70b-versatile",
                "aggressiveness": "high"
            },
            {
                "name": "High-Value Fraud Detection Supervisor",
                "base_instruction": (
                    "You are supervising luxury items and high-value orders.\n"
                    "All money and price values must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
                    "1. For any order exceeding ₹1,00,000, trigger manual verification protocol and message compliance team.\n"
                    "2. If shipping address differs from billing address, flag as high-risk and email fraud desk.\n"
                    "3. If credit score check fails, automatically pause order and email customer requesting ID verification.\n"
                    "4. If cleared by fraud team, immediately release order to warehouse."
                ),
                "default_wakeup_behavior": "Wake on new order or risk scoring update.",
                "model_choice": "llama-3.1-70b-versatile",
                "aggressiveness": "medium"
            },
            {
                "name": "Subscription Auto-Renewal Supervisor",
                "base_instruction": (
                    "You are supervising recurring monthly replenishment boxes.\n"
                    "All money and price values must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
                    "1. If payment failure occurs, email customer billing link, wait 24 hours, and retry payment.\n"
                    "2. If three consecutive payment retries fail, change subscription status to suspended, notify retention agent, and cancel warehouse dispatch.\n"
                    "3. If customer updates card info, immediately re-bill and dispatch warehouse ticket."
                ),
                "default_wakeup_behavior": "Wake daily, or on card updates.",
                "model_choice": "llama-3.1-70b-versatile",
                "aggressiveness": "low"
            },
            {
                "name": "International Customs Clearance Supervisor",
                "base_instruction": (
                    "You are supervising cross-border shipments.\n"
                    "All money and price values must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
                    "1. Verify HS Tariff Codes are present on invoice.\n"
                    "2. If stuck in customs for more than 48 hours, contact regional customs broker and request inspection status.\n"
                    "3. If import tax duties are unpaid, email customer import duty link with a 48-hour deadline.\n"
                    "4. If cleared customs, notify final-mile courier to prioritize delivery."
                ),
                "default_wakeup_behavior": "Wake every 4 hours, or on customs status update.",
                "model_choice": "llama-3.1-70b-versatile",
                "aggressiveness": "medium"
            }
        ]
        
        for t in templates_to_seed:
            existing = db.query(Supervisor).filter(Supervisor.name == t["name"]).first()
            if not existing:
                new_template = Supervisor(
                    id=uuid.uuid4(),
                    name=t["name"],
                    base_instruction=t["base_instruction"],
                    default_wakeup_behavior=t["default_wakeup_behavior"],
                    model_choice=t["model_choice"],
                    aggressiveness=t["aggressiveness"]
                )
                db.add(new_template)
            else:
                existing.base_instruction = t["base_instruction"]
                existing.default_wakeup_behavior = t["default_wakeup_behavior"]
                existing.model_choice = t["model_choice"]
                existing.aggressiveness = t["aggressiveness"]
        db.commit()
        print("Seeded and synchronized default supervisor templates.")
    finally:
        db.close()
    
    yield

app = FastAPI(title="Order Supervisor AI API", lifespan=lifespan)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_temporal_client() -> Client:
    try:
        return await Client.connect(TEMPORAL_HOST)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to connect to Temporal server at {TEMPORAL_HOST}: {e}"
        )

# ----------------- Supervisor Template API -----------------

@app.post("/api/supervisors", response_model=SupervisorResponse)
def create_supervisor(payload: SupervisorCreate, db: Session = Depends(get_db)):
    db_supervisor = Supervisor(
        name=payload.name,
        base_instruction=payload.base_instruction,
        default_wakeup_behavior=payload.default_wakeup_behavior,
        model_choice=payload.model_choice,
        aggressiveness=payload.aggressiveness
    )
    db.add(db_supervisor)
    db.commit()
    db.refresh(db_supervisor)
    return db_supervisor

@app.get("/api/supervisors", response_model=list[SupervisorResponse])
def list_supervisors(db: Session = Depends(get_db)):
    return db.query(Supervisor).order_by(Supervisor.created_at.desc()).all()

@app.get("/api/supervisors/{id}", response_model=SupervisorResponse)
def get_supervisor(id: uuid.UUID, db: Session = Depends(get_db)):
    supervisor = db.query(Supervisor).filter(Supervisor.id == id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor template not found")
    return supervisor

# ----------------- Runs API -----------------

@app.post("/api/runs", response_model=RunResponse)
async def start_run(payload: RunCreate, db: Session = Depends(get_db), client: Client = Depends(get_temporal_client)):
    # Verify supervisor template exists
    supervisor = db.query(Supervisor).filter(Supervisor.id == payload.supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor template not found")

    workflow_id = f"order-supervisor-{payload.order_id}"
    
    try:
        # Start Temporal Workflow
        await client.start_workflow(
            OrderSupervisorWorkflow.run,
            args=[payload.order_id, str(payload.supervisor_id)],
            id=workflow_id,
            task_queue="order-supervisor-task-queue"
        )
    except WorkflowAlreadyStartedError:
        raise HTTPException(
            status_code=400,
            detail=f"Supervisor is already active for Order ID: {payload.order_id} (Workflow ID: {workflow_id})"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start Temporal workflow: {e}"
        )

    # Note: The database Run entry is created inside the workflow's first activity (db_create_run_activity).
    # Since we want to return the response immediately, we can insert a placeholder run if needed,
    # or wait a brief moment for the activity to create it, or fetch/return a mock object here.
    # It is cleaner to return what we expect. Let's create it or fetch it.
    
    # We will poll the database for up to 3 seconds until the run is created by the workflow.
    import time
    for _ in range(30):
        run = db.query(Run).filter(Run.id == workflow_id).first()
        if run:
            # If initial instructions were provided, inject them immediately as a signal
            if payload.initial_instructions:
                try:
                    handle = client.get_workflow_handle(workflow_id)
                    await handle.signal(OrderSupervisorWorkflow.signal_instruction, payload.initial_instructions)
                except Exception as e:
                    print(f"Warning: Failed to signal initial instructions: {e}")
            return run
        time.sleep(0.1)
        db.expire_all()

    # Fallback response if the database write is slow
    raise HTTPException(
        status_code=202,
        detail="Workflow started successfully, database record initialization pending."
    )

@app.get("/api/runs", response_model=list[RunResponse])
def list_runs(db: Session = Depends(get_db)):
    return db.query(Run).order_by(Run.created_at.desc()).all()

@app.get("/api/runs/{run_id}", response_model=RunResponse)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Supervisor run not found")
    return run

@app.get("/api/runs/{run_id}/timeline", response_model=list[ActivityResponse])
def get_run_timeline(run_id: str, db: Session = Depends(get_db)):
    # Verify run exists
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Return all activities ordered chronologically
    return db.query(DBActivity).filter(DBActivity.run_id == run_id).order_by(DBActivity.timestamp.asc()).all()

# ----------------- Workflow Controls & Signals -----------------

@app.post("/api/runs/{run_id}/events")
async def inject_event(run_id: str, event: EventInput, client: Client = Depends(get_temporal_client)):
    try:
        handle = client.get_workflow_handle(run_id)
        await handle.signal(OrderSupervisorWorkflow.signal_event, args=[event.name, event.payload])
        return {"status": "success", "message": f"Signal '{event.name}' successfully sent to run {run_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to signal Temporal workflow: {e}"
        )

@app.post("/api/runs/{run_id}/instructions")
async def add_instruction(run_id: str, instruction: InstructionInput, client: Client = Depends(get_temporal_client)):
    try:
        handle = client.get_workflow_handle(run_id)
        await handle.signal(OrderSupervisorWorkflow.signal_instruction, instruction.text)
        return {"status": "success", "message": f"Instruction signal sent to run {run_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send instruction signal: {e}"
        )

@app.post("/api/runs/{run_id}/interrupt")
async def interrupt_run(run_id: str, client: Client = Depends(get_temporal_client)):
    try:
        handle = client.get_workflow_handle(run_id)
        await handle.signal(OrderSupervisorWorkflow.signal_pause)
        return {"status": "success", "message": f"Interrupt signal (pause) sent to run {run_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to pause run: {e}"
        )

@app.post("/api/runs/{run_id}/resume")
async def resume_run(run_id: str, client: Client = Depends(get_temporal_client)):
    try:
        handle = client.get_workflow_handle(run_id)
        await handle.signal(OrderSupervisorWorkflow.signal_resume)
        return {"status": "success", "message": f"Resume signal sent to run {run_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to resume run: {e}"
        )

@app.post("/api/runs/{run_id}/terminate")
async def terminate_run(run_id: str, client: Client = Depends(get_temporal_client)):
    try:
        handle = client.get_workflow_handle(run_id)
        await handle.signal(OrderSupervisorWorkflow.signal_terminate)
        return {"status": "success", "message": f"Graceful termination signal sent to run {run_id}."}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to terminate run gracefully: {e}"
        )

@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.status in ["active", "paused"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete an active or paused run. The workflow must first be completed or terminated."
        )
            
    try:
        db.delete(run)
        db.commit()
        return {"status": "success", "message": f"Run {run_id} and its timeline history successfully deleted."}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete run database records: {e}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

