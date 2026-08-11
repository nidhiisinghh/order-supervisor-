import asyncio
import sys
import os

# Ensure the root folder is on the python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from temporalio.client import Client
from temporalio.worker import Worker
from app.config import TEMPORAL_HOST
from app.temporal.workflows import OrderSupervisorWorkflow
from app.temporal.activities import (
    db_create_run_activity,
    db_log_activity_activity,
    db_update_run_status_activity,
    classify_event_activity,
    run_agent_step_activity,
    generate_final_summary_activity
)

async def main():
    print(f"Connecting Temporal worker to: {TEMPORAL_HOST}...")
    try:
        client = await Client.connect(TEMPORAL_HOST)
        print("Connected to Temporal server successfully.")
    except Exception as e:
        print(f"ERROR: Failed to connect to Temporal server at {TEMPORAL_HOST}: {e}")
        sys.exit(1)

    worker = Worker(
        client,
        task_queue="order-supervisor-task-queue",
        workflows=[OrderSupervisorWorkflow],
        activities=[
            db_create_run_activity,
            db_log_activity_activity,
            db_update_run_status_activity,
            classify_event_activity,
            run_agent_step_activity,
            generate_final_summary_activity
        ]
    )
    
    print("Temporal Worker is now running. Polling queue: 'order-supervisor-task-queue'...")
    await worker.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Worker stopped by user.")
