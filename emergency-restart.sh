#!/bin/bash

# Emergency restart script - simplified version to get things working

echo "=== EMERGENCY RESTART ==="
echo "This script will kill all Node.js processes and restart the backend"
echo 

# Kill all existing node processes
echo "Stopping all Node.js processes..."
pkill -f node || true
sleep 2

# Ensure logs directory exists
mkdir -p /home/monty/monty/backend/logs
mkdir -p /home/monty/monty/data

# Update backend environment file to ensure correct port and host settings
echo "Updating backend environment configuration..."
cat > /home/monty/monty/backend/.env << EOF
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
DEBUG=true

# OpenWeatherMap API
OPENWEATHERMAP_API_KEY=YOUR_API_KEY_HERE

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

# Start backend
echo "Starting backend server..."
cd /home/monty/monty/backend
echo "Backend starting on port 3001 and will listen on all interfaces (0.0.0.0)..."
node src/server.js > /home/monty/monty/backend/logs/stdout.log 2> /home/monty/monty/backend/logs/stderr.log &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"
sleep 3

# Verify backend is running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend is running"
    echo "Backend logs are available at:"
    echo "  - /home/monty/monty/backend/logs/stdout.log"
    echo "  - /home/monty/monty/backend/logs/stderr.log"
else
    echo "❌ Backend failed to start"
    echo "Check logs for errors:"
    echo "  - /home/monty/monty/backend/logs/stderr.log"
    exit 1
fi

echo
echo "=== NEXT STEPS ==="
echo "1. Start the frontend manually:"
echo "   cd /home/monty/monty/frontend && npm start"
echo
echo "2. Test API connectivity:"
echo "   curl http://192.168.0.15:3001/api/health"
echo
echo "3. Access the application at:"
echo "   http://192.168.0.15:3000"
echo
echo "4. If issues persist, check backend logs:"
echo "   tail -f /home/monty/monty/backend/logs/stderr.log"