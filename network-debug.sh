#!/bin/bash

# Network Diagnostic Script for Monty Application

echo "======= MONTY NETWORK DIAGNOSTICS ======="
echo "Running diagnostics to help resolve API connectivity issues"
echo

# Get network information
echo "=== NETWORK INTERFACES ==="
ip addr show | grep -E 'inet '
echo

# Check if backend port is listening
echo "=== PORT STATUS ==="
echo "Checking if backend port 3001 is listening:"
ps aux | grep "node.*server.js" | grep -v grep && echo "Backend process is running" || echo "Backend process is NOT running"

if command -v lsof >/dev/null 2>&1; then
  lsof -i :3001 || echo "Port 3001 is not listening (lsof)"
else 
  echo "Note: lsof not available, cannot check ports directly"
fi
echo

# Test API connectivity locally
echo "=== API CONNECTIVITY TESTS ==="
echo "Testing API health endpoint:"
curl -s http://localhost:3001/api/health | head -n 20
echo
echo

echo "Testing API shades endpoint:"
curl -s http://localhost:3001/api/shades/config | head -n 20
echo
echo

# Get the local IP address
LOCAL_IP=$(ip addr show | grep -E 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

echo "=== CONNECTION INSTRUCTIONS ==="
echo "Your system IP address appears to be: $LOCAL_IP"
echo
echo "To connect to the API from other devices:"
echo "1. Backend API URL: http://$LOCAL_IP:3001/api"
echo "2. Frontend URL: http://$LOCAL_IP:3000"
echo
echo "Test the connection from this machine to verify the IP works:"
echo "curl http://$LOCAL_IP:3001/api/health"
echo

# Try a test request with the IP
echo "Testing API via IP address:"
curl -s http://$LOCAL_IP:3001/api/health || echo "Failed to connect via IP"
echo
echo

echo "=== FRONTEND SETTINGS ==="
echo "Current frontend API configuration:"
grep -r "API_BASE_URL" /home/monty/monty/frontend/src --include="*.js"
echo
echo "Proxy setting in package.json:"
grep -A 1 "\"proxy\"" /home/monty/monty/frontend/package.json || echo "No proxy setting found"
echo

echo "=== RECOMMENDATIONS ==="
echo "If you're seeing connection errors when accessing via IP ($LOCAL_IP):"
echo
echo "1. Make sure the backend .env file has PORT=3001"
echo "2. Update frontend API URL in /home/monty/monty/frontend/src/utils/api.js:"
echo "   const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://$LOCAL_IP:3001/api';"
echo
echo "3. Restart both servers using the restart script:"
echo "   /home/monty/monty/restart.sh"
echo

echo "======= END OF DIAGNOSTICS ======="