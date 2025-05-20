#!/bin/bash

# Script to carefully restart just the backend server

echo "=== BACKEND RESTART ==="
echo "Restarting the backend server while preserving the frontend"
echo 

# Find and stop just the backend server processes
PS_LIST=$(ps ax | grep 'node.*server.js' | grep -v grep)
if [ ! -z "$PS_LIST" ]; then
  echo "Current backend processes:"
  echo "$PS_LIST"
  echo

  echo "Stopping backend processes..."
  pkill -f 'node.*server.js' || true
  pkill -f 'nodemon.*server.js' || true
  sleep 2
fi

# Ensure port is free
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

# Start backend server in development mode
echo "Starting backend server..."
cd /home/monty/monty/backend
export HOST=0.0.0.0
export NODE_ENV=development

# Start direct server which is more reliable
echo "Starting direct server (for minimal API access)..."
node direct-server.js > /home/monty/monty/backend/logs/direct-server.log 2>&1 &
DIRECT_PID=$!
echo "Direct server starting with PID: $DIRECT_PID"
sleep 3

# Check if direct server is listening
if lsof -i :3001 > /dev/null 2>&1; then
  echo "✅ Direct server is listening on port 3001"
  
  echo "Testing API connectivity with direct server..."
  CURL_RESULT=$(curl -s http://localhost:3001/api/health)
  if [ $? -eq 0 ]; then
    echo "✅ Direct API is accessible!"
    echo "$CURL_RESULT"
  else
    echo "❌ Direct API is not responding"
    echo "Check logs for more details"
    exit 1
  fi
  
  echo "Direct server is running successfully. The minimal API is available."
  echo "For full server functionality, the issues with the main server need to be fixed."
  
  echo
  echo "=== BACKEND RESTART COMPLETE ==="
  echo "Backend API (minimal):"
  echo "  - Local: http://localhost:3001/api"
  echo "  - Network: http://192.168.0.15:3001/api"
  echo
  echo "Health endpoint:"
  echo "  - http://localhost:3001/api/health"
  
  exit 0
else
  echo "❌ Direct server failed to start, something is seriously wrong"
  echo "Check port conflicts or other issues"
  exit 1
fi