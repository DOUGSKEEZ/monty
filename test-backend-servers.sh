#!/bin/bash

# Test script for the various Monty backend server implementations
# Usage: ./test-backend-servers.sh [server-option]
#
# Options:
#   minimal - Test minimal server
#   debug   - Test debug server
#   modular - Test modular server (default)
#   direct  - Test direct server
#   original - Test original server

# Default timeout for server start (seconds)
TIMEOUT=30
# The port used by all servers
PORT=3001

echo "Monty Backend Server Test Script"
echo "-------------------------------"

# Ensure we're in the correct directory
cd "$(dirname "$0")/backend"

# Define colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Kill any existing node processes
function cleanup() {
  echo -e "${YELLOW}Cleaning up any existing node processes...${NC}"
  pkill -f "node.*server" || true
  sleep 2
  echo "Done"
}

# Start the specified server and test if it responds
function test_server() {
  local server_type=$1
  local start_command=""
  
  case "$server_type" in
    minimal)
      echo -e "${YELLOW}Testing minimal server...${NC}"
      start_command="node src/minimal-server.js"
      ;;
    debug)
      echo -e "${YELLOW}Testing debug server...${NC}"
      start_command="node src/server-debug.js"
      ;;
    modular)
      echo -e "${YELLOW}Testing modular server with fixed scheduler...${NC}"
      start_command="node start-fixed.js"
      ;;
    direct)
      echo -e "${YELLOW}Testing direct server...${NC}"
      start_command="node direct-server.js"
      ;;
    original)
      echo -e "${YELLOW}Testing original server...${NC}"
      start_command="node src/server.js"
      ;;
    *)
      echo -e "${RED}Unknown server type: $server_type${NC}"
      exit 1
      ;;
  esac
  
  # Start the server in background
  echo "Starting server: $start_command"
  $start_command > "../${server_type}-server.log" 2>&1 &
  server_pid=$!
  
  echo "Server process started with PID: $server_pid"
  echo "Waiting for server to start (up to ${TIMEOUT}s)..."
  
  # Wait for the server to start
  local count=0
  while [ $count -lt $TIMEOUT ]; do
    sleep 1
    count=$((count + 1))
    
    # Check if the process is still running
    if ! ps -p $server_pid > /dev/null; then
      echo -e "${RED}Server process exited unexpectedly.${NC}"
      echo "Check log file: ${server_type}-server.log"
      return 1
    fi
    
    # Try to connect to the health endpoint
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/health 2>/dev/null)
    
    if [ "$response" = "200" ]; then
      echo -e "${GREEN}Server responded successfully after ${count} seconds!${NC}"
      echo "Getting health info..."
      curl -s http://localhost:$PORT/api/health | json_pp
      
      # For modular server, also check debug endpoint
      if [ "$server_type" = "modular" ]; then
        echo "Getting debug info..."
        curl -s http://localhost:$PORT/api/debug | json_pp
      fi
      
      # Kill the server
      echo "Stopping server..."
      kill $server_pid
      sleep 2
      return 0
    else
      echo -n "."
    fi
  done
  
  echo -e "\n${RED}Server did not respond within ${TIMEOUT} seconds.${NC}"
  echo "Stopping server process..."
  kill $server_pid
  return 1
}

# Main function
function main() {
  local server_type="${1:-modular}"  # Default to modular server
  
  cleanup
  
  echo -e "${YELLOW}Starting test of '$server_type' server...${NC}"
  
  test_server "$server_type"
  result=$?
  
  if [ $result -eq 0 ]; then
    echo -e "${GREEN}Test of '$server_type' server completed successfully!${NC}"
  else
    echo -e "${RED}Test of '$server_type' server failed.${NC}"
  fi
  
  cleanup
  exit $result
}

# Run the main function with the server type parameter
main "$1"