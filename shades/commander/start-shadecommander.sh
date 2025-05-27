#!/bin/bash
# ShadeCommander startup script

cd "$(dirname "$0")"

echo "🫡 Starting ShadeCommander..."

# Activate virtual environment
source venv/bin/activate

# Set Python path for absolute imports
export PYTHONPATH="/home/monty/monty/shades:$PYTHONPATH"

# Start FastAPI server
# Use --reload for development, remove for production
python -m uvicorn main:app --host 0.0.0.0 --port 8000