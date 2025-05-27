#!/bin/bash
# ShadeCommander kill script

echo "🛑 Stopping ShadeCommander..."

# Kill any uvicorn processes running on port 8000
echo "Killing uvicorn processes..."
pkill -f "uvicorn main:app.*--port 8000"

# Kill any Python processes running main.py in this directory
echo "Killing Python main.py processes..."
pkill -f "python.*main.py"
pkill -f "python -m uvicorn main:app"

# Kill any processes using port 8000
echo "Killing processes using port 8000..."
lsof -ti:8000 | xargs -r kill -9

# Give it a moment to clean up
sleep 2

# Check if anything is still running
if lsof -i:8000 >/dev/null 2>&1; then
    echo "⚠️  Warning: Something is still using port 8000"
    echo "Processes using port 8000:"
    lsof -i:8000
else
    echo "✅ ShadeCommander stopped successfully"
fi

echo "You can now restart with: ./start-shadecommander.sh"