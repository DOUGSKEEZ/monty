#!/bin/bash

# Monty Home Automation - Master Startup Script (Improved)
# Place this in /home/monty/monty/start-monty.sh

echo "🏠 Starting Monty Home Automation System..."

# ======================
# AGGRESSIVE CLEANUP FIRST
# ======================
echo "🧹 Cleaning up any existing processes first..."

# Use the aggressive stop script if it exists, otherwise do cleanup inline
if [ -f ~/monty/stop-monty.sh ]; then
    ~/monty/stop-monty.sh
else
    # Inline aggressive cleanup
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "npm start" 2>/dev/null || true
    pkill -f "uvicorn.*commander" 2>/dev/null || true
    pkill -f "node.*server" 2>/dev/null || true
    pkill -f "react-scripts" 2>/dev/null || true
    
    # Kill by ports
    for port in 3000 3001 8000; do
        PORT_PIDS=$(lsof -ti :$port 2>/dev/null)
        if [ ! -z "$PORT_PIDS" ]; then
            echo "   Killing processes on port $port: $PORT_PIDS"
            kill -9 $PORT_PIDS 2>/dev/null || true
        fi
    done
    
    sleep 2
fi

# ======================
# CREATE LOGS DIRECTORY
# ======================
mkdir -p ~/monty/logs

# ======================
# START SERVICES
# ======================

# Start Backend (Node.js)
echo "🚀 Starting Backend (Node.js)..."
cd ~/monty/backend
nohup npm run dev > ~/monty/logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend started with PID: $BACKEND_PID"

# Wait for backend to initialize
echo "   Waiting for backend to initialize..."
sleep 5

# Verify backend is responding
if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "   ✅ Backend is responding on port 3001"
else
    echo "   ⚠️  Backend may not be fully ready yet"
fi

# Start ShadeCommander (FastAPI)
echo "🫡 Starting ShadeCommander (FastAPI)..."
cd ~/monty/shades/commander
nohup ./start-shadecommander.sh > ~/monty/logs/shadecommander.log 2>&1 &
COMMANDER_PID=$!
echo "   ShadeCommander started with PID: $COMMANDER_PID"

# Wait for commander to initialize
echo "   Waiting for ShadeCommander to initialize..."
sleep 5

# Verify commander is responding
if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    echo "   ✅ ShadeCommander is responding on port 8000"
else
    echo "   ⚠️  ShadeCommander may not be fully ready yet"
fi

# Start Frontend (React)
echo "⚛️  Starting Frontend (React)..."
cd ~/monty/frontend
nohup npm start > ~/monty/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend started with PID: $FRONTEND_PID"

# Wait for frontend to initialize
echo "   Waiting for frontend to initialize..."
sleep 8

# Verify frontend is responding (React takes longer to start)
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "   ✅ Frontend is responding on port 3000"
else
    echo "   ⚠️  Frontend may still be starting up..."
fi

# ======================
# SAVE PIDS FOR LATER
# ======================
echo $BACKEND_PID > ~/monty/logs/backend.pid
echo $COMMANDER_PID > ~/monty/logs/commander.pid
echo $FRONTEND_PID > ~/monty/logs/frontend.pid

# ======================
# FINAL STATUS CHECK
# ======================
echo ""
echo "🔍 Final service verification..."
sleep 3

BACKEND_STATUS="❌"
COMMANDER_STATUS="❌"  
FRONTEND_STATUS="❌"

if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
    BACKEND_STATUS="✅"
fi

if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    COMMANDER_STATUS="✅"
fi

if curl -s http://localhost:3000 >/dev/null 2>&1; then
    FRONTEND_STATUS="✅"
fi

echo ""
echo "📊 SERVICE STATUS:"
echo "   Backend (3001):        $BACKEND_STATUS"
echo "   ShadeCommander (8000): $COMMANDER_STATUS"
echo "   Frontend (3000):       $FRONTEND_STATUS"
echo ""

if [[ "$BACKEND_STATUS" == "✅" && "$COMMANDER_STATUS" == "✅" && "$FRONTEND_STATUS" == "✅" ]]; then
    echo "🎉 ALL SERVICES STARTED SUCCESSFULLY!"
else
    echo "⚠️  Some services may need more time to start. Check logs if issues persist."
fi

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
echo "🛑 To stop all services: ~/monty/stop-monty.sh"
echo "🔍 To check status: ~/monty/monitor-monty.sh"
