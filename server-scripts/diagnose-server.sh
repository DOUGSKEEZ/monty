#!/bin/bash

# Diagnose server issues by checking logs and running troubleshooting tests
echo "=== SERVER DIAGNOSTICS ==="
echo "This script will diagnose server issues"
echo

# 1. Check for running processes
echo "--- PROCESS CHECK ---"
echo "Node processes:"
ps aux | grep node | grep -v grep

echo
echo "Listening ports (3000, 3001):"
lsof -i :3000 -i :3001 || echo "No processes listening on these ports"

# 2. Check Node.js version 
echo
echo "--- NODE VERSION ---"
node --version

# 3. Check for disk space issues
echo
echo "--- DISK SPACE ---"
df -h | grep -E '^Filesystem|/home'

# 4. Memory usage
echo
echo "--- MEMORY USAGE ---"
free -m

# 5. Check for error patterns in logs
echo
echo "--- LOG ANALYSIS ---"
echo "Checking backend logs for error patterns..."

if [ -f /home/monty/monty/backend/logs/server.log ]; then
  echo "Recent server.log entries:"
  tail -20 /home/monty/monty/backend/logs/server.log
  
  echo
  echo "Errors/warnings in server.log:"
  grep -i "error\|warning\|fail" /home/monty/monty/backend/logs/server.log | tail -10 || echo "No errors found"
else
  echo "server.log not found"
fi

echo
if [ -f /home/monty/monty/backend/logs/startup.log ]; then
  echo "Recent startup.log entries:"
  tail -20 /home/monty/monty/backend/logs/startup.log
  
  echo
  echo "Errors/warnings in startup.log:"
  grep -i "error\|warning\|fail" /home/monty/monty/backend/logs/startup.log | tail -10 || echo "No errors found"
else
  echo "startup.log not found"
fi

echo
echo "--- NODE DEPENDENCIES ---"
echo "Checking backend dependencies..."
cd /home/monty/monty/backend
echo "Express version:"
grep "express" package.json

echo
echo "--- PORT BINDING TEST ---"
# Create a simple test server to check port binding
cat > /tmp/test-server.js << EOF
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Test server is working\n');
});

server.listen(3001, '0.0.0.0', () => {
  console.log('Test server listening on 0.0.0.0:3001');
});
EOF

echo "Starting a minimal test server..."
node /tmp/test-server.js > /tmp/test-server.log 2>&1 &
TEST_PID=$!
echo "Test server PID: $TEST_PID"
sleep 3

# Check if test server is listening
if lsof -i :3001 > /dev/null 2>&1; then
  echo "✅ Test server is successfully binding to port 3001"
  echo "This suggests the issue is with the server.js code, not with port binding"
  curl -s http://localhost:3001/ || echo "Could not connect to test server"
else
  echo "❌ Test server also failed to bind to port 3001"
  echo "This suggests a system-level issue with port binding"
  cat /tmp/test-server.log
fi

# Cleanup
kill $TEST_PID 2>/dev/null || true
rm /tmp/test-server.js

echo
echo "=== DIAGNOSTICS COMPLETE ==="
echo "Please review the output above for clues about server issues"