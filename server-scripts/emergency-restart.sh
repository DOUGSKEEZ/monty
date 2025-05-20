#!/bin/bash

# Emergency restart script - enhanced version to fix server issues

echo "=== EMERGENCY RESTART ==="
echo "This script will kill all Node.js processes and restart both servers"
echo 

# Kill all existing node processes forcefully
echo "Forcefully stopping all Node.js processes..."
pkill -9 -f "node.*server.js" || true
pkill -9 -f "react-scripts start" || true
pkill -9 -f nodemon || true
sleep 2

# Make sure everything is completely stopped
echo "Double-checking for any remaining processes..."
pkill -9 -f node || true
sleep 1

# Release ports if still in use
echo "Checking for processes on ports 3000 and 3001..."
PORT_3000_PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PORT_3000_PID" ]; then
    echo "Killing process on port 3000: $PORT_3000_PID"
    kill -9 $PORT_3000_PID 2>/dev/null || true
fi

PORT_3001_PID=$(lsof -t -i:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
    echo "Killing process on port 3001: $PORT_3001_PID"
    kill -9 $PORT_3001_PID 2>/dev/null || true
fi

# Ensure directories exist
echo "Creating required directories..."
mkdir -p /home/monty/monty/backend/logs
mkdir -p /home/monty/monty/data/cache

# Update environment files
echo "Updating backend environment configuration..."
cat > /home/monty/monty/backend/.env << EOF
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
DEBUG=true
HOST=0.0.0.0

# OpenWeatherMap API
OPENWEATHERMAP_API_KEY=a74a99c2f899ce8e0261bbbe3d4f2996

# Pianobar Configuration
PIANOBAR_CONFIG_DIR=/home/monty/.config/pianobar

# Bluetooth Speaker
BLUETOOTH_SPEAKER_MAC=54:B7:E5:87:7B:73

# Shade Controller
SHADE_CONTROLLER_PATH=/home/monty/shades/control_shades.py
EOF

# Create a minimal frontend environment file
echo "Updating frontend configuration..."
cat > /home/monty/monty/frontend/.env.local << EOF
REACT_APP_API_BASE_URL=http://192.168.0.15:3001/api
EOF

# First try using npm run dev which uses nodemon
echo "Starting backend with npm run dev..."
cd /home/monty/monty/backend

# Redirect output to log file for troubleshooting
npm run dev > /home/monty/monty/backend/logs/startup.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting with npm run dev, PID: $BACKEND_PID"
sleep 5

# Verify backend is listening
if lsof -i :3001 > /dev/null 2>&1; then
    echo "✅ Backend server is listening on port 3001"
    if pgrep -f nodemon > /dev/null; then
        echo "✅ Nodemon is running"
    else
        echo "⚠️ Server running but nodemon might not be active"
    fi
else
    echo "❌ Backend server not listening on port 3001 - something is wrong"
    kill $BACKEND_PID 2>/dev/null || true
    echo "Trying with direct server instead..."
    cd /home/monty/monty/backend
    node direct-server.js > /home/monty/monty/backend/logs/direct-server.log 2>&1 &
    BACKEND_PID=$!
    echo "Direct backend starting with PID: $BACKEND_PID"
    sleep 3
    
    if lsof -i :3001 > /dev/null 2>&1; then
        echo "✅ Backend server is listening on port 3001"
        echo "❌ NOT running with nodemon"
    else
        echo "❌ Direct server failed too. Trying regular server..."
        kill $BACKEND_PID 2>/dev/null || true
        cd /home/monty/monty/backend
        HOST=0.0.0.0 node src/server.js > /home/monty/monty/backend/logs/server-direct.log 2>&1 &
        BACKEND_PID=$!
        echo "Regular backend starting with PID: $BACKEND_PID"
        sleep 3
    fi
fi

# Start frontend
echo "Starting frontend server..."
cd /home/monty/monty/frontend
npm start > /home/monty/monty/frontend/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend starting with PID: $FRONTEND_PID"
sleep 5

# Verify services are running
echo "Verifying servers are running..."
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend server process is running (PID: $BACKEND_PID)"
    if pgrep -f nodemon > /dev/null; then
        echo "✅ Nodemon is running"
    else
        echo "❌ Nodemon is NOT running"
    fi
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
echo "  - Backend: /home/monty/monty/backend/logs/combined.log"
echo "  - Startup: /home/monty/monty/backend/logs/startup.log"
echo "  - Frontend: /home/monty/monty/frontend/frontend.log"
echo
echo "If servers are not responding, check logs for errors."