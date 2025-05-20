#!/bin/bash

# Enhanced Network Diagnostic Script for Monty Application

echo "======= MONTY NETWORK DIAGNOSTICS ======="
echo "Running comprehensive diagnostics to help resolve connectivity issues"
echo

# Get network information
echo "=== NETWORK INTERFACES ==="
ip addr show | grep -E 'inet |state UP'
echo "Primary IP: $(hostname -I | awk '{print $1}')"
echo

# Check running processes
echo "=== PROCESS STATUS ==="
echo "Backend process: "
ps aux | grep "node.*server.js" | grep -v grep && echo "✅ Running" || echo "❌ NOT running"
echo
echo "Frontend process: "
ps aux | grep "react-scripts start" | grep -v grep && echo "✅ Running" || echo "❌ NOT running"
echo
echo "Nodemon process: "
ps aux | grep "nodemon" | grep -v grep && echo "✅ Running" || echo "❌ NOT running"
echo

# Check port status
echo "=== PORT STATUS ==="
echo "Checking listening ports:"
if command -v lsof >/dev/null 2>&1; then
  echo "Backend port 3001:"
  lsof -i :3001 || echo "❌ Port 3001 is not listening"
  echo
  echo "Frontend port 3000:"
  lsof -i :3000 || echo "❌ Port 3000 is not listening"
else 
  echo "Port check (netstat):"
  netstat -tulpn 2>/dev/null | grep -E ':(3000|3001)' || echo "❌ Ports 3000/3001 not found"
fi
echo

# Test API endpoints
echo "=== API CONNECTIVITY TESTS ==="
echo "1. Testing local API health endpoint:"
curl -s -m 2 http://localhost:3001/api/health 2>/dev/null && echo "✅ Success" || echo "❌ Failed to connect to localhost:3001"
echo

echo "2. Testing network IP API health endpoint:"
LOCAL_IP=$(hostname -I | awk '{print $1}')
curl -s -m 2 http://${LOCAL_IP}:3001/api/health 2>/dev/null && echo "✅ Success" || echo "❌ Failed to connect to ${LOCAL_IP}:3001"
echo

# Check config files
echo "=== CONFIGURATION CHECK ==="
echo "Backend .env file:"
cat /home/monty/monty/backend/.env 2>/dev/null | grep -E 'PORT|NODE_ENV|LOG_LEVEL' || echo "❌ Backend .env file not found"
echo

echo "Frontend environment:"
cat /home/monty/monty/frontend/.env.local 2>/dev/null | grep -E 'API_BASE_URL' || echo "❌ Frontend .env.local not found"
echo

# Check Bluetooth status
echo "=== BLUETOOTH STATUS ==="
echo "Connected devices:"
bluetoothctl devices Connected 2>/dev/null || echo "No connected devices or bluetoothctl failed"
echo
echo "Speaker information:"
bluetoothctl info 54:B7:E5:87:7B:73 2>/dev/null | grep -E 'Connected|Name|Paired|Trusted' || echo "❌ Cannot get device info"
echo

# Check logs
echo "=== LOG FILES STATUS ==="
COMBINED_LOG="/home/monty/monty/backend/logs/combined.log"
if [ -f "$COMBINED_LOG" ]; then
  echo "✅ Combined log exists"
  echo "Recent log entries:"
  tail -n 10 "$COMBINED_LOG"
else
  echo "❌ Combined log file not found"
fi
echo

echo "=== RECOMMENDATIONS ==="
if ! ps aux | grep "node.*server.js" | grep -v grep > /dev/null; then
  echo "➡️ Backend server is not running. Restart with: ./emergency-restart.sh"
fi

if ! curl -s -m 2 http://localhost:3001/api/health 2>/dev/null > /dev/null; then
  echo "➡️ API is not accessible. Check backend logs and restart server"
fi

if ! ps aux | grep "react-scripts start" | grep -v grep > /dev/null; then
  echo "➡️ Frontend server is not running. Restart with: ./emergency-restart.sh"
fi

echo
echo "To restart all services: ./emergency-restart.sh"
echo "To view backend logs: tail -f /home/monty/monty/backend/logs/combined.log"
echo "To test API manually: curl http://localhost:3001/api/health"
echo
echo "======= END OF DIAGNOSTICS ======="