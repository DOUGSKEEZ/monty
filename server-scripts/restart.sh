#!/bin/bash

# Script to restart the Monty application with the latest configuration

echo "=== Monty Application Restart ==="
echo "This script will restart the backend and frontend servers"
echo

# Stop any existing servers
echo "Stopping existing servers..."
pkill -f "node.*server.js" || true
pkill -f "react-scripts start" || true
sleep 2

# Ensure necessary directories exist
echo "Creating required directories..."
mkdir -p /home/monty/monty/data 
mkdir -p /home/monty/monty/logs 
mkdir -p /home/monty/monty/backend/logs

# Start backend server
echo "Starting backend server..."
cd /home/monty/monty/backend

# Get local IP address
LOCAL_IP=$(ip addr show | grep -E 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

echo "Backend starting on port 3001, listening on all interfaces"
echo "Backend will be accessible at:"
echo "  - http://localhost:3001/api (local access)"
echo "  - http://$LOCAL_IP:3001/api (network access)"

npm run dev &
sleep 5

# Start frontend server
echo "Starting frontend server..."
cd /home/monty/monty/frontend

# Update the frontend API URL for consistent access via IP
LOCAL_IP=$(ip addr show | grep -E 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

cat > .env.local << EOF
REACT_APP_API_BASE_URL=http://$LOCAL_IP:3001/api
EOF

echo "Frontend starting on port 3000"
echo "Frontend will be accessible at:"
echo "  - http://localhost:3000 (local access)"
echo "  - http://$LOCAL_IP:3000 (network access)"

npm start &
sleep 5

echo
echo "=== Startup Complete ==="

# Get the local IP address again to be sure
LOCAL_IP=$(ip addr show | grep -E 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

echo "Backend API:"
echo "  - Local: http://localhost:3001/api"
echo "  - Network: http://$LOCAL_IP:3001/api"
echo
echo "Frontend:"
echo "  - Local: http://localhost:3000"
echo "  - Network: http://$LOCAL_IP:3000"
echo
echo "API Test Pages:"
echo "  - Local: http://localhost:3000/test-api.html"
echo "  - Network: http://$LOCAL_IP:3000/test-api.html"

echo
echo "NOTE: If accessing via IP address, the application is configured to use:"
echo "  $LOCAL_IP as the API address"
echo
echo "To view logs:"
echo "  - Backend: tail -f /home/monty/monty/backend/logs/combined.log"
echo "  - Frontend: Check browser console (F12)"
echo
echo "To stop servers:"
echo "  - Use Ctrl+C in this terminal"
echo "  - Or run: pkill -f \"node.*server.js\"; pkill -f \"react-scripts start\""
echo

# Keep the script running so we can Ctrl+C to stop all processes
echo "Press Ctrl+C to stop all servers"
wait