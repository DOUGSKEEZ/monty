#!/bin/bash

echo "Killing all backend server processes..."

# Kill specific server processes
pkill -f "node.*src/server.js" 2>/dev/null || true
pkill -f "nodemon.*src/server.js" 2>/dev/null || true

# Find and kill anything using port 3001
PORT_PIDS=$(lsof -ti :3001 2>/dev/null)
if [ ! -z "$PORT_PIDS" ]; then
    echo "Killing processes using port 3001: $PORT_PIDS"
    kill -9 $PORT_PIDS 2>/dev/null || true
fi

# Wait a moment for processes to die
sleep 1

# Verify port is free
if lsof -i :3001 2>/dev/null | grep -q LISTEN; then
    echo "Warning: Port 3001 still in use"
    lsof -i :3001
else
    echo "Port 3001 is now free"
fi

echo "Server cleanup complete"