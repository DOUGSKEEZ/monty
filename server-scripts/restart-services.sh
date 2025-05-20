#!/bin/bash

# Monty Services Restart Script - Fixed version
# This script properly stops and restarts both the backend and frontend

echo "=== MONTY SERVICES RESTART ==="
echo "Restarting services with improved error handling..."
echo 

# Kill existing processes
echo "Stopping existing processes..."
pkill -f "node.*server.js" || true
pkill -f "react-scripts start" || true
sleep 3

# Make extra sure port 3001 is free
PORT_3001_PID=$(lsof -t -i:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
    echo "Releasing port 3001 (PID: $PORT_3001_PID)..."
    kill -9 $PORT_3001_PID 2>/dev/null || true
    sleep 1
fi

# Ensure directories exist
echo "Creating required directories..."
mkdir -p /home/monty/monty/backend/logs
mkdir -p /home/monty/monty/data/cache

# Start backend
echo "Starting backend server..."
cd /home/monty/monty/backend
export NODE_ENV=development
export DEBUG=true

# Start with verbose initial output to verify it's running
echo "Starting backend with visible output..."
node src/server.js > /tmp/backend-start.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting with PID: $BACKEND_PID"

# Wait a moment for server to initialize
echo "Waiting for backend to initialize..."
sleep 10

# Check if server is running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend process is running"
    
    # Check if server is listening
    if grep -q "Server running on port" /tmp/backend-start.log; then
        echo "✅ Backend server successfully started on port 3001"
        cat /tmp/backend-start.log
    else
        echo "❌ Backend might be running but not listening properly"
        echo "Check the startup log:"
        cat /tmp/backend-start.log
        echo
        echo "Try manually with: cd /home/monty/monty/backend && node src/server.js"
        exit 1
    fi
else
    echo "❌ Backend process failed to start"
    echo "Startup log:"
    cat /tmp/backend-start.log
    echo
    echo "Try manually with: cd /home/monty/monty/backend && node src/server.js"
    exit 1
fi

# Start frontend
echo "Starting frontend server..."
cd /home/monty/monty/frontend
nohup npm start > /dev/null 2>&1 &
FRONTEND_PID=$!
echo "Frontend starting with PID: $FRONTEND_PID"
sleep 5

# Verify services are running
echo "Verifying services are running..."
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend server process is running (PID: $BACKEND_PID)"
else
    echo "❌ Backend process no longer running - check logs"
fi

if ps -p $FRONTEND_PID > /dev/null; then
    echo "✅ Frontend server process is running (PID: $FRONTEND_PID)"
else
    echo "❌ Frontend process no longer running - check for errors"
fi

echo
echo "=== RESTART COMPLETE ==="
echo "Backend API:"
echo "  - Local: http://localhost:3001/api"
echo "  - Network: http://192.168.0.15:3001/api"
echo
echo "Frontend:"
echo "  - Local: http://localhost:3000"
echo "  - Network: http://192.168.0.15:3000"
echo
echo "API Test:"
echo "  - http://localhost:3000/test-api.html"
echo
echo "Check logs at:"
echo "  - Backend: /tmp/backend-start.log"
echo "  - Frontend: Check browser console"
echo
echo "To check system status: ./network-debug.sh"