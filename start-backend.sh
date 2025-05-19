#!/bin/bash

# Direct script to start backend and show output

echo "Starting backend server..."
cd /home/monty/monty/backend

# Make sure logs directory exists
mkdir -p /home/monty/monty/backend/logs

# Create output log file
LOG_FILE="/home/monty/monty/backend/logs/startup.log"
echo "Starting backend at $(date)" > $LOG_FILE

# Show current environment settings
echo "Environment settings:" >> $LOG_FILE
cat .env >> $LOG_FILE
echo "" >> $LOG_FILE

# Start backend with output capture
node src/server.js 2>&1 | tee -a $LOG_FILE

# Note: This script will not return until the server is stopped