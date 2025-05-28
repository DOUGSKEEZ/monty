#!/bin/bash

# Monty Home Automation - Stop All Services Script
# Place this in /home/monty/monty/stop-monty.sh

echo "🛑 Stopping Monty Home Automation System..."

# Stop services using saved PIDs (graceful)
if [ -f ~/monty/logs/backend.pid ]; then
    BACKEND_PID=$(cat ~/monty/logs/backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "   Stopping Backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
    fi
    rm -f ~/monty/logs/backend.pid
fi

if [ -f ~/monty/logs/commander.pid ]; then
    COMMANDER_PID=$(cat ~/monty/logs/commander.pid)
    if kill -0 $COMMANDER_PID 2>/dev/null; then
        echo "   Stopping ShadeCommander (PID: $COMMANDER_PID)..."
        kill $COMMANDER_PID
    fi
    rm -f ~/monty/logs/commander.pid
fi

if [ -f ~/monty/logs/frontend.pid ]; then
    FRONTEND_PID=$(cat ~/monty/logs/frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "   Stopping Frontend (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
    fi
    rm -f ~/monty/logs/frontend.pid
fi

# Force kill any remaining processes (backup)
echo "   Cleaning up any remaining processes..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true
pkill -f "uvicorn.*commander" 2>/dev/null || true

echo "✅ All Monty services stopped!"
echo ""
echo "📝 Logs preserved in ~/monty/logs/ for review"