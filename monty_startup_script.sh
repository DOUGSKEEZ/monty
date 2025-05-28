#!/bin/bash

# Monty Home Automation - Master Startup Script
# Place this in /home/monty/monty/start-monty.sh

echo "🏠 Starting Monty Home Automation System..."

# Kill any existing processes first
echo "🛑 Stopping any existing services..."
pkill -f "npm run dev"
pkill -f "npm start"
pkill -f "uvicorn.*commander"
sleep 2

# Create logs directory if it doesn't exist
mkdir -p ~/monty/logs

# Start Backend (Node.js)
echo "🚀 Starting Backend (Node.js)..."
cd ~/monty/backend
nohup npm run dev > ~/monty/logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend started with PID: $BACKEND_PID"

# Wait a moment for backend to initialize
sleep 3

# Start ShadeCommander (FastAPI)
echo "🫡 Starting ShadeCommander (FastAPI)..."
cd ~/monty/shades/commander
nohup ./start-shadecommander.sh > ~/monty/logs/shadecommander.log 2>&1 &
COMMANDER_PID=$!
echo "   ShadeCommander started with PID: $COMMANDER_PID"

# Wait a moment for commander to initialize
sleep 3

# Start Frontend (React)
echo "⚛️  Starting Frontend (React)..."
cd ~/monty/frontend
nohup npm start > ~/monty/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend started with PID: $FRONTEND_PID"

# Save PIDs for easy stopping later
echo $BACKEND_PID > ~/monty/logs/backend.pid
echo $COMMANDER_PID > ~/monty/logs/commander.pid
echo $FRONTEND_PID > ~/monty/logs/frontend.pid

echo ""
echo "✅ All services started successfully!"
echo ""
echo "📊 Service URLs:"
echo "   Frontend:        http://localhost:3000"
echo "   Backend:         http://localhost:3001"
echo "   ShadeCommander:  http://localhost:8000"
echo ""
echo "📝 Logs are being written to:"
echo "   Backend:         ~/monty/logs/backend.log"
echo "   ShadeCommander:  ~/monty/logs/shadecommander.log"
echo "   Frontend:        ~/monty/logs/frontend.log"
echo ""
echo "🛑 To stop all services, run: ~/monty/stop-monty.sh"
echo ""
echo "🔍 To view logs in real-time:"
echo "   Backend:         tail -f ~/monty/logs/backend.log"
echo "   ShadeCommander:  tail -f ~/monty/logs/shadecommander.log"
echo "   Frontend:        tail -f ~/monty/logs/frontend.log"