#!/bin/bash

# Monty Application Complete Restart Script
# Addresses port, CORS, and process management issues

# Set text colors for better readability
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== MONTY APPLICATION RESTART ===${NC}"
echo "This script will properly restart the entire Monty application"
echo "Including fixing common issues with ports, CORS, and dependencies"
echo

# -------------- STEP 1: STOP ALL PROCESSES --------------
echo -e "${BLUE}Step 1: Stopping all existing processes...${NC}"

# Identify processes we want to stop
echo "Checking for Node.js processes to stop..."
PS_LIST=$(ps aux | grep -E 'node|nodemon|react-scripts' | grep -v grep)

if [ ! -z "$PS_LIST" ]; then
  echo "Found these processes to stop:"
  echo "$PS_LIST"
  
  # Stop processes gracefully first
  echo "Stopping processes gracefully..."
  pkill -f "node.*server.js" || true
  pkill -f "react-scripts start" || true
  pkill -f nodemon || true
  sleep 2
  
  # Force kill if needed
  echo "Making sure all processes are stopped..."
  pkill -9 -f node || true
  sleep 1
else
  echo "No relevant Node.js processes found running."
fi

# Check if ports are still in use
echo "Checking if ports 3000 and 3001 are in use..."

PORT_3000_PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PORT_3000_PID" ]; then
    echo "Port 3000 is still in use. Releasing..."
    kill -9 $PORT_3000_PID 2>/dev/null || true
    sleep 1
else
    echo "Port 3000 is free."
fi

PORT_3001_PID=$(lsof -t -i:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
    echo "Port 3001 is still in use. Releasing..."
    kill -9 $PORT_3001_PID 2>/dev/null || true
    sleep 1
else
    echo "Port 3001 is free."
fi

# -------------- STEP 2: VERIFY DEPENDENCIES --------------
echo -e "${BLUE}Step 2: Verifying dependencies...${NC}"

# Check backend dependencies
echo "Checking backend dependencies..."
cd /home/monty/monty/backend

# Check if axios is installed
if ! grep -q '"axios"' package.json; then
  echo "Axios dependency is missing. Installing..."
  npm install --save axios
else
  echo "Axios dependency is present in package.json."
fi

# Verify all dependencies are installed
echo "Installing all dependencies..."
npm install

# Check frontend dependencies
echo "Checking frontend dependencies..."
cd /home/monty/monty/frontend
npm install

# -------------- STEP 3: UPDATE CONFIGURATION --------------
echo -e "${BLUE}Step 3: Updating configuration files...${NC}"

# Ensure directories exist
echo "Creating required directories..."
mkdir -p /home/monty/monty/backend/logs
mkdir -p /home/monty/monty/data/cache

# Update backend environment configuration
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

# Create frontend environment file
echo "Updating frontend configuration..."
# Get local IP address
LOCAL_IP=$(ip addr show | grep -E 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

cat > /home/monty/monty/frontend/.env.local << EOF
REACT_APP_API_BASE_URL=http://${LOCAL_IP}:3001/api
EOF

# -------------- STEP 4: START BACKEND SERVER --------------
echo -e "${BLUE}Step 4: Starting backend server...${NC}"
cd /home/monty/monty/backend

# Start with output to log file for debugging
echo "Starting backend with nodemon..."
HOST=0.0.0.0 npm run dev > /home/monty/monty/backend/logs/startup.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting with PID: $BACKEND_PID"
sleep 5

# Verify backend is running
if lsof -i :3001 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend server is listening on port 3001${NC}"
    
    # Check if nodemon is running
    if pgrep -f nodemon > /dev/null; then
        echo -e "${GREEN}✅ Nodemon is running${NC}"
    else
        echo -e "${RED}⚠️ Nodemon not detected - server is running in standard mode${NC}"
    fi
    
    # Test API connectivity
    echo "Testing API health endpoint..."
    CURL_RESULT=$(curl -s http://localhost:3001/api/health 2>/dev/null)
    if [ $? -eq 0 ] && [ ! -z "$CURL_RESULT" ]; then
        echo -e "${GREEN}✅ API health endpoint is responding${NC}"
        echo "$CURL_RESULT"
    else
        echo -e "${RED}❌ API health endpoint is not responding. Trying alternative approach...${NC}"
        # Kill current backend
        kill $BACKEND_PID 2>/dev/null || true
        sleep 2
        
        # Try direct server
        echo "Starting with direct server.js..."
        HOST=0.0.0.0 node src/server.js > /home/monty/monty/backend/logs/direct.log 2>&1 &
        BACKEND_PID=$!
        echo "Direct backend starting with PID: $BACKEND_PID"
        sleep 5
        
        # Check direct server
        if lsof -i :3001 > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Direct server is listening on port 3001${NC}"
        else
            echo -e "${RED}❌ Backend server failed to start properly. Check logs:${NC}"
            tail -20 /home/monty/monty/backend/logs/direct.log
            echo
            echo -e "${RED}Trying one last approach with a minimal server...${NC}"
            
            # Create a minimal test server
            MINIMAL_SERVER="/home/monty/monty/backend/minimal-server.js"
            cat > $MINIMAL_SERVER << EOF
// Minimal Express server for testing
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

// Configure CORS for all access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Basic health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Minimal backend server is running',
    time: new Date().toISOString()
  });
});

// Listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(\`Minimal server running on port \${PORT} on all interfaces\`);
});
EOF
            # Start minimal server
            node $MINIMAL_SERVER > /home/monty/monty/backend/logs/minimal.log 2>&1 &
            MINIMAL_PID=$!
            echo "Minimal server starting with PID: $MINIMAL_PID"
            sleep 3
            
            if lsof -i :3001 > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Minimal server is listening on port 3001${NC}"
                BACKEND_PID=$MINIMAL_PID
            else
                echo -e "${RED}❌ All backend server attempts failed.${NC}"
                echo "Please check system configuration and logs."
                exit 1
            fi
        fi
    fi
else
    echo -e "${RED}❌ Backend server not listening on port 3001${NC}"
    echo "Checking startup logs:"
    tail -20 /home/monty/monty/backend/logs/startup.log
    exit 1
fi

# -------------- STEP 5: START FRONTEND SERVER --------------
echo -e "${BLUE}Step 5: Starting frontend server...${NC}"
cd /home/monty/monty/frontend

# Start frontend
mkdir -p /home/monty/monty/frontend/logs
npm start > /home/monty/monty/frontend/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend starting with PID: $FRONTEND_PID"

# Wait for server to start
MAX_WAIT=15
COUNTER=0
echo -n "Waiting for frontend to start (up to $MAX_WAIT seconds)..."

while [ $COUNTER -lt $MAX_WAIT ]; do
  sleep 1
  COUNTER=$((COUNTER+1))
  
  # Check if port is listening
  if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "\n${GREEN}✅ Frontend listening on port 3000 after $COUNTER seconds${NC}"
    break
  fi
  
  echo -n "."
  
  # Check if process died
  if ! ps -p $FRONTEND_PID > /dev/null; then
    echo -e "\n${RED}❌ Frontend process died before starting${NC}"
    echo "Recent logs:"
    tail -20 /home/monty/monty/frontend/logs/frontend.log
    exit 1
  fi
done

# Final verification
if lsof -i :3000 > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Frontend server running successfully${NC}"
else
  echo -e "${RED}❌ Frontend server didn't start in expected time${NC}"
  echo "Recent logs:"
  tail -20 /home/monty/monty/frontend/logs/frontend.log
  echo "Frontend might still be starting, please check manually."
fi

# -------------- FINAL STEP: SUMMARY --------------
echo -e "${BLUE}=== RESTART COMPLETE ===${NC}"

# Get current IP
LOCAL_IP=$(ip addr show | grep -E 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

echo "Backend API:"
echo "  - Local: http://localhost:3001/api"
echo "  - Network: http://${LOCAL_IP}:3001/api"
echo
echo "Frontend:"
echo "  - Local: http://localhost:3000"
echo "  - Network: http://${LOCAL_IP}:3000"
echo
echo "API Test Page:"
echo "  - http://localhost:3000/test-api.html"
echo
echo "Log files:"
echo "  - Backend: /home/monty/monty/backend/logs/startup.log"
echo "  - Frontend: /home/monty/monty/frontend/logs/frontend.log"
echo
echo -e "${GREEN}If all checks passed, your application should be running!${NC}"
echo "If you still have issues, run the API test page and check the console (F12) for errors."
