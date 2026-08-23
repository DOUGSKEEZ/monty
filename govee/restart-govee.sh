#!/bin/bash
# Restart the Govee BLE reader service (requires sudo)
# Convenience wrapper so you don't have to remember the systemctl command.

echo "🔄 Restarting Govee reader..."

if [ "$EUID" -ne 0 ]; then
    echo "⚠️  This script requires sudo privileges"
    echo "Running: sudo systemctl restart govee-reader.service"
    sudo systemctl restart govee-reader.service
else
    systemctl restart govee-reader.service
fi

# Wait for the scanner to start and write a fresh reading
sleep 3

if systemctl is-active --quiet govee-reader.service; then
    echo "✅ Govee reader restarted successfully"
    echo ""
    echo "Startup line (which radio it bound to):"
    journalctl -u govee-reader.service -n 20 --no-pager | grep -m1 "Scanning" || true
    echo ""
    echo "Current readings:"
    if [ -f /home/monty/monty/data/govee_readings.json ]; then
        python3 -c "import json; d=json.load(open('/home/monty/monty/data/govee_readings.json')); [print(f'  {v[\"label\"]:<14} {v[\"temp_f\"]}F  {v[\"humidity\"]}%') for v in d['rooms'].values()]" 2>/dev/null || echo "  (readings file present; run 'cat data/govee_readings.json')"
    else
        echo "  (no readings file yet — give it ~15s)"
    fi
else
    echo "❌ Failed to restart Govee reader"
    echo ""
    echo "Check logs with: journalctl -u govee-reader.service -f"
    exit 1
fi
