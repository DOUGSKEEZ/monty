#!/bin/bash

# Monty Services Startup Script
# Safely starts backend and frontend services without killing other node processes

echo "=== MONTY SERVICES STARTUP ==="
echo "Starting services gracefully..."
echo 

# Check if already running
BACKEND_RUNNING=$(ps aux | grep "node.*server.js" | grep -v grep)
FRONTEND_RUNNING=$(ps aux | grep "react-scripts start" | grep -v grep)

# Only stop the specific services if they're running
if [ ! -z "$BACKEND_RUNNING" ]; then
  echo "Backend is already running. Stopping it gracefully..."
  pkill -f "node.*server.js" || true
  sleep 2
fi

if [ ! -z "$FRONTEND_RUNNING" ]; then
  echo "Frontend is already running. Stopping it gracefully..."
  pkill -f "react-scripts start" || true
  sleep 2
fi

# Ensure directories exist
echo "Creating required directories..."
mkdir -p /home/monty/monty/backend/logs
mkdir -p /home/monty/monty/data/cache

# Get API key from user if not properly set
CURRENT_API_KEY=$(grep OPENWEATHERMAP_API_KEY /home/monty/monty/backend/.env | cut -d= -f2)
if [[ "$CURRENT_API_KEY" == "YOUR_API_KEY_HERE" ]]; then
  echo "OpenWeatherMap API key is not properly configured."
  echo -n "Please enter your OpenWeatherMap API key: "
  read API_KEY
  
  if [[ -z "$API_KEY" ]]; then
    echo "No API key provided. Weather services will not function correctly."
    echo "You can add your API key later by editing the backend/.env file."
  else
    # Update just the API key line in the .env file
    sed -i "s/OPENWEATHERMAP_API_KEY=.*/OPENWEATHERMAP_API_KEY=$API_KEY/" /home/monty/monty/backend/.env
    echo "API key has been updated."
  fi
fi

# Start backend with nodemon
echo "Starting backend server with nodemon..."
cd /home/monty/monty/backend
export NODE_ENV=development
export DEBUG=true
nohup npm run dev > /home/monty/monty/backend/logs/combined.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting with PID: $BACKEND_PID"
sleep 5

# Start frontend
echo "Starting frontend server..."
cd /home/monty/monty/frontend
nohup npm start > /dev/null 2>&1 &
FRONTEND_PID=$!
echo "Frontend starting with PID: $FRONTEND_PID"
sleep 5

# Verify services are running
echo "Verifying servers are running..."
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
echo "=== STARTUP COMPLETE ==="
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
echo "  - Frontend: Check browser console"
echo
echo "To check system status: ./network-debug.sh"