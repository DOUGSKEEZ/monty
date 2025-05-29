#!/bin/bash

# Monty Home Automation - AGGRESSIVE Stop All Services Script
# This version uses your thorough kill approach

echo "🛑 AGGRESSIVELY stopping Monty Home Automation System..."

# ======================
# BACKEND CLEANUP (Port 3001)
# ======================
echo "🔥 Killing all backend server processes..."

# Kill specific server processes
pkill -f "node.*src/server.js" 2>/dev/null || true
pkill -f "nodemon.*src/server.js" 2>/dev/null || true
pkill -f "npm.*run.*dev" 2>/dev/null || true
pkill -f "node.*server" 2>/dev/null || true

# Find and kill anything using port 3001
PORT_PIDS=$(lsof -ti :3001 2>/dev/null)
if [ ! -z "$PORT_PIDS" ]; then
    echo "   Killing processes using port 3001: $PORT_PIDS"
    kill -9 $PORT_PIDS 2>/dev/null || true
fi

# ======================
# FRONTEND CLEANUP (Port 3000)
# ======================
echo "🔥 Killing all frontend processes..."

# Kill specific frontend processes
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
    echo "   Killing processes using port 3000: $PORT_PIDS"
    kill -9 $PORT_PIDS 2>/dev/null || true
fi

# ======================
# SHADECOMMANDER CLEANUP (Port 8000)
# ======================
echo "🔥 Killing all ShadeCommander processes..."

# Kill ShadeCommander processes
pkill -f "uvicorn.*commander" 2>/dev/null || true
pkill -f "python.*main.py" 2>/dev/null || true
pkill -f "fastapi" 2>/dev/null || true

# Find and kill anything using port 8000
PORT_PIDS=$(lsof -ti :8000 2>/dev/null)
if [ ! -z "$PORT_PIDS" ]; then
    echo "   Killing processes using port 8000: $PORT_PIDS"
    kill -9 $PORT_PIDS 2>/dev/null || true
fi

# ======================
# CLEANUP PID FILES
# ======================
echo "🧹 Cleaning up PID files..."
rm -f ~/monty/logs/backend.pid 2>/dev/null || true
rm -f ~/monty/logs/commander.pid 2>/dev/null || true
rm -f ~/monty/logs/frontend.pid 2>/dev/null || true

# ======================
# VERIFICATION
# ======================
echo "🔍 Verifying all ports are free..."

# Wait a moment for processes to die
sleep 2

# Check each port
for port in 3000 3001 8000; do
    if lsof -i :$port 2>/dev/null | grep -q LISTEN; then
        echo "⚠️  Warning: Port $port still in use"
        lsof -i :$port
    else
        echo "✅ Port $port is free"
    fi
done

echo ""
echo "🎯 FINAL CLEANUP - Nuclear option for any remaining Node/Python processes..."

# Nuclear option - kill any remaining suspicious processes (be careful!)
pkill -f "node.*monty" 2>/dev/null || true
pkill -f "npm.*monty" 2>/dev/null || true
pkill -f "python.*shade" 2>/dev/null || true

echo ""
echo "💥 AGGRESSIVE CLEANUP COMPLETE!"
echo ""
echo "📊 Current port status:"
echo "   Port 3000 (Frontend):     $(lsof -i :3000 2>/dev/null | grep LISTEN | wc -l) processes"
echo "   Port 3001 (Backend):      $(lsof -i :3001 2>/dev/null | grep LISTEN | wc -l) processes" 
echo "   Port 8000 (ShadeCommander): $(lsof -i :8000 2>/dev/null | grep LISTEN | wc -l) processes"
echo ""
