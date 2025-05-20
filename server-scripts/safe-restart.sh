#!/bin/bash

# Safe Restart Script for Monty Services
# This script carefully stops and restarts the backend and frontend

echo "=== MONTY SAFE RESTART ==="
echo "Restarting services safely..."
echo 

# Find and stop just the backend and frontend servers
PS_LIST=$(ps ax | grep -E 'node.*(server.js|react-scripts)' | grep -v grep)
if [ ! -z "$PS_LIST" ]; then
  echo "Current Node.js processes:"
  echo "$PS_LIST"
  echo

  # Kill server.js processes
  if ps ax | grep 'node.*server.js' | grep -v grep > /dev/null; then
    echo "Stopping backend processes..."
    pkill -f 'node.*server.js' || true
  fi
  
  # Kill react-scripts processes
  if ps ax | grep 'react-scripts' | grep -v grep > /dev/null; then
    echo "Stopping frontend processes..."
    pkill -f 'react-scripts' || true
  fi
  
  sleep 3
fi

# Ensure ports are free
PORT_3001_PID=$(lsof -t -i:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
    echo "Releasing port 3001 (PID: $PORT_3001_PID)..."
    kill -9 $PORT_3001_PID 2>/dev/null || true
    sleep 1
fi

PORT_3000_PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PORT_3000_PID" ]; then
    echo "Releasing port 3000 (PID: $PORT_3000_PID)..."
    kill -9 $PORT_3000_PID 2>/dev/null || true
    sleep 1
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

# Start backend with nodemon if available
echo "Starting backend server with nodemon..."
cd /home/monty/monty/backend
export NODE_ENV=development
export DEBUG=true
export HOST=0.0.0.0

npm run dev > /home/monty/monty/backend/logs/startup.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting with PID: $BACKEND_PID"
sleep 5

# Check if backend is running
if lsof -i :3001 > /dev/null 2>&1; then
  echo "✅ Backend is listening on port 3001"
  
  # Check if nodemon is running
  if pgrep -f nodemon > /dev/null; then
    echo "✅ Using nodemon for hot reloading"
  else
    echo "⚠️ Backend running but not with nodemon"
  fi
  
  echo "Recent backend logs:"
  tail -5 /home/monty/monty/backend/logs/startup.log
else
  echo "❌ Backend not listening on port 3001 - trying direct server mode"
  kill $BACKEND_PID 2>/dev/null || true
  
  # Fallback to direct server mode
  cd /home/monty/monty/backend
  node direct-server.js > /home/monty/monty/backend/logs/direct-server.log 2>&1 &
  BACKEND_PID=$!
  echo "Direct backend starting with PID: $BACKEND_PID"
  sleep 3
  
  if lsof -i :3001 > /dev/null 2>&1; then
    echo "✅ Direct backend server is listening on port 3001"
  else
    echo "❌ Direct server failed too - trying regular server"
    kill $BACKEND_PID 2>/dev/null || true
    
    cd /home/monty/monty/backend
    HOST=0.0.0.0 node src/server.js > /home/monty/monty/backend/logs/server.log 2>&1 &
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

# Check if frontend is running
if ps -p $FRONTEND_PID > /dev/null; then
  echo "✅ Frontend process is running"
  if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ Frontend is listening on port 3000"
  else
    echo "⚠️ Frontend process running but not listening on port 3000 yet"
  fi
else
  echo "❌ Frontend process failed to start"
fi

# Try to curl the backend API
echo "Testing backend API connectivity..."
CURL_RESULT=$(curl -s http://localhost:3001/api/health)
if [ $? -eq 0 ]; then
  echo "✅ Backend API is accessible!"
  echo "$CURL_RESULT"
else
  echo "❌ Backend API is not responding (this may be normal if it's still starting up)"
  echo "Try again in a few seconds with: curl http://localhost:3001/api/health"
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