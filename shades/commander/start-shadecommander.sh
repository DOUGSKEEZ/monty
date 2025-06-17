#!/bin/bash
# ShadeCommander startup script

cd "$(dirname "$0")"

echo "🫡 Starting ShadeCommander with monitoring..."

# Activate virtual environment
source venv/bin/activate

# Set Python path for absolute imports
export PYTHONPATH="/home/monty/monty/shades:$PYTHONPATH"

# Set New Relic config
export NEW_RELIC_CONFIG_FILE=newrelic.ini

# Start FastAPI server
# Use --reload for development, remove for production
newrelic-admin run-program uvicorn main:app --host 0.0.0.0 --port 8000
