#!/bin/bash

# Fix Backend Service Script
# This script gracefully restarts just the backend service

echo "=== BACKEND SERVICE FIX ==="
echo "Gracefully restarting backend service..."
echo 

# Find and stop only the specific server processes
if pgrep -f 'node.*server.js' > /dev/null; then
  echo "Stopping existing backend processes..."
  pkill -f 'node.*server.js' || true
  sleep 2
fi

echo "Starting backend with API key and rate limit fix..."
cd /home/monty/monty/backend

# Make sure logs directory exists
mkdir -p logs

# Start backend in foreground with verbose output
echo "Starting backend with verbose output. Press Ctrl+C when you see the server listening message."
echo "Then type: 'cd /home/monty/monty/backend && nohup npm run dev > logs/combined.log 2>&1 &' to restart in background."

# Start server with all output visible
NODE_ENV=development node src/server.js