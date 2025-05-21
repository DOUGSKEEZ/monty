#!/bin/bash
# Comprehensive cleanup script for backend directory
# This script removes or archives unused files and temporary debugging scripts

# Create archive directories
mkdir -p /home/monty/monty/backend/archive
mkdir -p /home/monty/monty/backend/archive/services
mkdir -p /home/monty/monty/backend/archive/scripts
mkdir -p /home/monty/monty/backend/archive/server
mkdir -p /home/monty/monty/backend/logs
mkdir -p /home/monty/monty/backend/tests

echo "=== Starting comprehensive cleanup ==="

# Archive deprecated server files
echo "Archiving outdated server files..."
[[ -f /home/monty/monty/backend/src/server-debug.js ]] && mv /home/monty/monty/backend/src/server-debug.js /home/monty/monty/backend/archive/server/
[[ -f /home/monty/monty/backend/src/minimal-server.js ]] && mv /home/monty/monty/backend/src/minimal-server.js /home/monty/monty/backend/archive/server/
[[ -f /home/monty/monty/backend/src/simplified-server.js ]] && mv /home/monty/monty/backend/src/simplified-server.js /home/monty/monty/backend/archive/server/
[[ -f /home/monty/monty/backend/direct-server.js ]] && mv /home/monty/monty/backend/direct-server.js /home/monty/monty/backend/archive/server/
[[ -f /home/monty/monty/backend/start-direct.js ]] && mv /home/monty/monty/backend/start-direct.js /home/monty/monty/backend/archive/scripts/
[[ -f /home/monty/monty/backend/start-fixed.js ]] && mv /home/monty/monty/backend/start-fixed.js /home/monty/monty/backend/archive/scripts/

# Archive old service files
echo "Archiving outdated service versions..."
[[ -f /home/monty/monty/backend/src/services/musicService.js.bak ]] && mv /home/monty/monty/backend/src/services/musicService.js.bak /home/monty/monty/backend/archive/services/
[[ -f /home/monty/monty/backend/src/services/musicService.js.updated ]] && mv /home/monty/monty/backend/src/services/musicService.js.updated /home/monty/monty/backend/archive/services/
[[ -f /home/monty/monty/backend/src/services/ServiceRegistry.js ]] && mv /home/monty/monty/backend/src/services/ServiceRegistry.js /home/monty/monty/backend/archive/services/

# Archive old shell scripts that are no longer needed
echo "Archiving old shell scripts..."
[[ -f /home/monty/monty/backend/start-with-nodemon.sh ]] && mv /home/monty/monty/backend/start-with-nodemon.sh /home/monty/monty/backend/archive/scripts/

# Move test files to tests directory
echo "Organizing test files..."
[[ -f /home/monty/monty/backend/test-self-healing.js ]] && mv /home/monty/monty/backend/test-self-healing.js /home/monty/monty/backend/tests/

# Move log files
echo "Moving log files to logs directory..."
find /home/monty/monty/backend -maxdepth 1 -name "*.log" -exec mv {} /home/monty/monty/backend/logs/ \;

echo "=== Cleanup summary ==="
echo "Files archived:"
ls -la /home/monty/monty/backend/archive/server/
ls -la /home/monty/monty/backend/archive/services/
ls -la /home/monty/monty/backend/archive/scripts/

echo "Test files organized:"
ls -la /home/monty/monty/backend/tests/

echo "=== Comprehensive cleanup complete! ==="