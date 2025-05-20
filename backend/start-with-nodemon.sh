#!/bin/bash

# Start backend with nodemon and verify it's working correctly

echo "Starting backend with nodemon..."
cd /home/monty/monty/backend
export NODE_ENV=development
export DEBUG=true
export HOST=0.0.0.0

# Clean up any existing log files
> /home/monty/monty/backend/logs/startup.log

# Start nodemon in the background
npm run dev > /home/monty/monty/backend/logs/startup.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting with PID: $BACKEND_PID"

# Wait for up to 15 seconds for the server to start listening
MAX_WAIT=15
COUNTER=0
echo "Waiting for server to start (up to $MAX_WAIT seconds)..."

while [ $COUNTER -lt $MAX_WAIT ]; do
  sleep 1
  COUNTER=$((COUNTER+1))
  
  # Check if port is listening
  if lsof -i :3001 > /dev/null 2>&1; then
    echo "✅ Server listening on port 3001 after $COUNTER seconds"
    break
  fi
  
  # Show progress
  if [ $((COUNTER % 3)) -eq 0 ]; then
    echo "Still waiting... ($COUNTER seconds)"
  fi
  
  # Check if process died
  if ! ps -p $BACKEND_PID > /dev/null; then
    echo "❌ Process died before starting to listen"
    cat /home/monty/monty/backend/logs/startup.log
    exit 1
  fi
done

# Final check
if lsof -i :3001 > /dev/null 2>&1; then
  echo "✅ Backend is listening on port 3001"
  
  # Check if nodemon is running
  if pgrep -f nodemon > /dev/null; then
    echo "✅ Using nodemon for hot reloading"
  else
    echo "⚠️ Server running but not with nodemon"
  fi
  
  echo "Recent backend logs:"
  tail -10 /home/monty/monty/backend/logs/startup.log
  
  # Test API connection
  echo "Testing backend API connectivity..."
  CURL_RESULT=$(curl -s http://localhost:3001/api/health)
  if [ $? -eq 0 ]; then
    echo "✅ Backend API is accessible!"
    echo "$CURL_RESULT"
  else
    echo "❌ Backend API is not responding"
    echo "Check logs for more details"
  fi
  
  exit 0
else
  echo "❌ Server did not start listening within $MAX_WAIT seconds"
  echo "Recent logs:"
  tail -20 /home/monty/monty/backend/logs/startup.log
  
  # Kill the failed process
  kill $BACKEND_PID 2>/dev/null || true
  exit 1
fi