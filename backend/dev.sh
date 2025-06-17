#!/bin/bash
# Development startup script with monitoring

# Load monitoring environment
source .env.monitoring

# Export for nodemon
export NEW_RELIC_NO_CONFIG_FILE=true
export NEW_RELIC_LICENSE_KEY=$NEW_RELIC_LICENSE_KEY
export NEW_RELIC_APP_NAME=monty-core

# Start dev server
npm run dev
