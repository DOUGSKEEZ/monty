#!/bin/bash
# Test all monitoring integrations
echo "🧪 Testing monitoring integrations..."

# Load environment
source ./load-monitoring-env.sh

# Start the server in background for testing
echo "Starting server for testing..."
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test monitoring endpoints
echo "Testing monitoring endpoints..."
curl -s http://localhost:3001/api/monitoring/status | jq '.' || echo "Failed to get monitoring status"
curl -s -X POST http://localhost:3001/api/monitoring/test-metric | jq '.' || echo "Failed to send test metric"
curl -s -X POST http://localhost:3001/api/monitoring/test-event | jq '.' || echo "Failed to send test event"

# Stop the server
kill $SERVER_PID 2>/dev/null

echo "✅ Monitoring test complete"
