#!/bin/bash
# Production restart script for Monty Backend
# Uses systemd service management (requires sudo)

echo "🔄 Restarting Monty Backend (Production)..."

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  This script requires sudo privileges"
    echo "Running: sudo systemctl restart monty-backend.service"
    sudo systemctl restart monty-backend.service
else
    systemctl restart monty-backend.service
fi

# Wait for service to start
sleep 2

# Check service status
if systemctl is-active --quiet monty-backend.service; then
    echo "✅ Monty Backend restarted successfully"
    echo ""
    echo "Service status:"
    systemctl status monty-backend.service --no-pager | head -10
else
    echo "❌ Failed to restart Monty Backend"
    echo ""
    echo "Check logs with: journalctl -u monty-backend.service -f"
    exit 1
fi
