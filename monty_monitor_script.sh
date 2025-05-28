#!/bin/bash

# Monty Home Automation - Service Monitor
# Place this in /home/monty/monty/monitor-monty.sh
# This script shows the status of all services and tails the logs

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

check_service() {
    local name=$1
    local pid_file=$2
    local port=$3
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            # Check if port is responding
            if curl -s "http://localhost:$port" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $name${NC} (PID: $pid, Port: $port) - Running & Responding"
            else
                echo -e "${YELLOW}⚠️  $name${NC} (PID: $pid, Port: $port) - Running but not responding"
            fi
        else
            echo -e "${RED}❌ $name${NC} - PID file exists but process not running"
        fi
    else
        echo -e "${RED}❌ $name${NC} - Not running (no PID file)"
    fi
}

echo "🏠 Monty Home Automation - Service Status"
echo "========================================"

check_service "Backend" ~/monty/logs/backend.pid 3001
check_service "ShadeCommander" ~/monty/logs/commander.pid 8000
check_service "Frontend" ~/monty/logs/frontend.pid 3000

echo ""
echo "📝 Recent log entries:"
echo "======================"

if [ -f ~/monty/logs/backend.log ]; then
    echo -e "${BLUE}Backend (last 3 lines):${NC}"
    tail -3 ~/monty/logs/backend.log
    echo ""
fi

if [ -f ~/monty/logs/shadecommander.log ]; then
    echo -e "${BLUE}ShadeCommander (last 3 lines):${NC}"
    tail -3 ~/monty/logs/shadecommander.log
    echo ""
fi

if [ -f ~/monty/logs/frontend.log ]; then
    echo -e "${BLUE}Frontend (last 3 lines):${NC}"
    tail -3 ~/monty/logs/frontend.log
    echo ""
fi

echo "🔍 Commands:"
echo "   View live backend logs:      tail -f ~/monty/logs/backend.log"
echo "   View live shadecommander:    tail -f ~/monty/logs/shadecommander.log"
echo "   View live frontend logs:     tail -f ~/monty/logs/frontend.log"
echo "   Stop all services:           ~/monty/stop-monty.sh"
echo "   Restart all services:        ~/monty/stop-monty.sh && ~/monty/start-monty.sh"