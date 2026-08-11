#!/bin/bash
set -e

# Navigate to backend directory
cd "$(dirname "$0")"

echo "============================================="
echo " Starting Sagepilot Order Supervisor Backend "
echo "============================================="

# Function to clean up background jobs on exit
cleanup() {
    echo ""
    echo "Shutting down worker and server..."
    if [ -n "$WORKER_PID" ]; then
        kill "$WORKER_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup INT TERM EXIT

# Start Temporal Worker in background
echo "-> Starting Temporal Worker..."
python3 app/temporal/worker.py &
WORKER_PID=$!

# Wait briefly for worker setup
sleep 2

# Start FastAPI server in foreground
echo "-> Starting FastAPI App Server..."
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
