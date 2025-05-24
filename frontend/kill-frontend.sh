#!/bin/bash

echo "Killing all frontend processes..."

# Kill specific frontend processes (adjust these patterns based on your frontend setup)
pkill -f "node.*:3000" 2>/dev/null || true
pkill -f "npm.*start" 2>/dev/null || true
pkill -f "yarn.*start" 2>/dev/null || true
pkill -f "webpack-dev-server" 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "next.*dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Find and kill anything using port 3000
PORT_PIDS=$(lsof -ti :3000 2>/dev/null)
if [ ! -z "$PORT_PIDS" ]; then
    echo "Killing processes using port 3000: $PORT_PIDS"
    kill -9 $PORT_PIDS 2>/dev/null || true
fi

# Wait a moment for processes to die
sleep 1

# Verify port is free
if lsof -i :3000 2>/dev/null | grep -q LISTEN; then
    echo "Warning: Port 3000 still in use"
    lsof -i :3000
else
    echo "Port 3000 is now free"
fi

echo "Frontend cleanup complete"
