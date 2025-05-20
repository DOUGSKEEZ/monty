#!/bin/bash

# Script to carefully restart just the frontend server

echo "=== FRONTEND RESTART ==="
echo "Restarting the frontend React server while preserving the backend"
echo 

# Find and stop just the frontend processes
PS_LIST=$(ps ax | grep 'react-scripts' | grep -v grep)
if [ ! -z "$PS_LIST" ]; then
  echo "Current frontend processes:"
  echo "$PS_LIST"
  echo

  echo "Stopping frontend processes..."
  pkill -f 'react-scripts' || true
  sleep 2
fi

# Ensure port is free
PORT_3000_PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PORT_3000_PID" ]; then
    echo "Releasing port 3000 (PID: $PORT_3000_PID)..."
    kill -9 $PORT_3000_PID 2>/dev/null || true
    sleep 1
fi

# Update environment file
echo "Updating frontend configuration..."
cat > /home/monty/monty/frontend/.env.local << EOF
REACT_APP_API_BASE_URL=http://192.168.0.15:3001/api
EOF

# Start frontend
echo "Starting frontend server..."
cd /home/monty/monty/frontend
mkdir -p /home/monty/monty/frontend/logs
npm start > /home/monty/monty/frontend/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend starting with PID: $FRONTEND_PID"

# Wait for server to start
MAX_WAIT=15
COUNTER=0
echo "Waiting for frontend to start (up to $MAX_WAIT seconds)..."

while [ $COUNTER -lt $MAX_WAIT ]; do
  sleep 1
  COUNTER=$((COUNTER+1))
  
  # Check if port is listening
  if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ Frontend listening on port 3000 after $COUNTER seconds"
    break
  fi
  
  echo -n "."
  
  # Check if process died
  if ! ps -p $FRONTEND_PID > /dev/null; then
    echo "❌ Process died before starting to listen"
    tail -20 /home/monty/monty/frontend/logs/frontend.log
    exit 1
  fi
done

echo

# Final check
if lsof -i :3000 > /dev/null 2>&1; then
  echo "✅ Frontend is listening on port 3000"
else
  echo "❌ Frontend did not start listening within $MAX_WAIT seconds"
  echo "Recent logs:"
  tail -20 /home/monty/monty/frontend/logs/frontend.log
  exit 1
fi

echo
echo "=== FRONTEND RESTART COMPLETE ==="
echo "Frontend:"
echo "  - Local: http://localhost:3000"
echo "  - Network: http://192.168.0.15:3000"
echo
echo "API Test:"
echo "  - http://localhost:3000/test-api.html"