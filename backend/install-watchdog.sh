#!/bin/bash
# Install the Monty Backend Watchdog timer and service
# This script must be run with sudo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="/etc/systemd/system"

echo "🐕 Installing Monty Backend Watchdog..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run with sudo"
    exit 1
fi

# Copy service and timer files
echo "📋 Copying systemd files..."
cp "$SCRIPT_DIR/systemd/monty-backend-watchdog.service" "$SYSTEMD_DIR/"
cp "$SCRIPT_DIR/systemd/monty-backend-watchdog.timer" "$SYSTEMD_DIR/"

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable and start the timer
echo "⏰ Enabling and starting watchdog timer..."
systemctl enable monty-backend-watchdog.timer
systemctl start monty-backend-watchdog.timer

echo ""
echo "✅ Watchdog installed successfully!"
echo ""
echo "📊 Status:"
systemctl status monty-backend-watchdog.timer --no-pager
echo ""
echo "📝 Useful commands:"
echo "   Check timer status:    systemctl status monty-backend-watchdog.timer"
echo "   View watchdog logs:    journalctl -t monty-watchdog -f"
echo "   Disable watchdog:      sudo systemctl disable --now monty-backend-watchdog.timer"
echo "   Manual health check:   /home/monty/monty/backend/health-check.sh"
