#!/bin/bash
# Production restart script for ShadeCommander
# Uses systemd service management (requires sudo)

echo "🔄 Restarting ShadeCommander (Production)..."

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  This script requires sudo privileges"
    echo "Running: sudo systemctl restart shadecommander.service"
    sudo systemctl restart shadecommander.service
else
    systemctl restart shadecommander.service
fi

# Wait for service to start
sleep 2

# Check service status
if systemctl is-active --quiet shadecommander.service; then
    echo "✅ ShadeCommander restarted successfully"
    echo ""
    echo "Service status:"
    systemctl status shadecommander.service --no-pager | head -10
else
    echo "❌ Failed to restart ShadeCommander"
    echo ""
    echo "Check logs with: journalctl -u shadecommander.service -f"
    exit 1
fi
