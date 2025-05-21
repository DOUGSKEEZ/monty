#!/bin/bash
# Cleanup script for backend directory
# This script removes or archives unused files and temporary debugging scripts

# Make archive directory if it doesn't exist
mkdir -p /home/monty/monty/backend/archive

echo "Creating archive directory..."

# Move legacy/superseded files to archive
echo "Archiving outdated server files..."
# Server files that have been superseded by modular-server.js
mv /home/monty/monty/backend/src/server-debug.js /home/monty/monty/backend/archive/
mv /home/monty/monty/backend/src/minimal-server.js /home/monty/monty/backend/archive/
mv /home/monty/monty/backend/src/simplified-server.js /home/monty/monty/backend/archive/
mv /home/monty/monty/backend/direct-server.js /home/monty/monty/backend/archive/
mv /home/monty/monty/backend/start-direct.js /home/monty/monty/backend/archive/

# Services that have been refactored and improved
echo "Archiving outdated service versions..."
mkdir -p /home/monty/monty/backend/archive/services
mv /home/monty/monty/backend/src/services/musicService.js.bak /home/monty/monty/backend/archive/services/
mv /home/monty/monty/backend/src/services/musicService.js.updated /home/monty/monty/backend/archive/services/
mv /home/monty/monty/backend/src/services/ServiceRegistry.js /home/monty/monty/backend/archive/services/
# Note: We're keeping weatherService.js and schedulerService.js as they're the default implementations
# The .fixed and .di versions are enhanced alternatives

# Clean up duplicate service registry (now in utils)
echo "Removing duplicate files..."
# ServiceRegistry moved to utils, so the services one is redundant
rm -f /home/monty/monty/backend/src/services/ServiceRegistry.js 

# Remove any log files from the root directory (they should be in logs/)
echo "Moving log files to logs directory..."
mkdir -p /home/monty/monty/backend/logs
mv /home/monty/monty/backend/*.log /home/monty/monty/backend/logs/ 2>/dev/null

# Move test-related files to tests directory
echo "Organizing test files..."
mkdir -p /home/monty/monty/backend/tests
mv /home/monty/monty/backend/test-self-healing.js /home/monty/monty/backend/tests/

echo "Cleanup complete!"