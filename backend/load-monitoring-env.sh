#!/bin/bash
# Load monitoring environment variables
if [ -f ".env.monitoring" ]; then
    set -a
    source .env.monitoring
    set +a
    echo "✅ Monitoring environment loaded"
else
    echo "⚠️  .env.monitoring not found"
fi
