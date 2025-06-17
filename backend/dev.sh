#!/bin/bash
# Development startup script with monitoring

echo "🚀 Starting Monty Backend with Monitoring..."
cd "$(dirname "$0")"

# Load monitoring environment
source .env.monitoring

echo "✅ NEW_RELIC_LICENSE_KEY loaded: ${NEW_RELIC_LICENSE_KEY:0:10}..."
echo "📡 Starting server with New Relic monitoring..."

# DON'T use -r newrelic, let the monitoring module handle it
HOST=0.0.0.0 npx nodemon --ignore data/ --ignore '../data/' --exec 'node -r ./src/monitoring/index.js' src/server.js
