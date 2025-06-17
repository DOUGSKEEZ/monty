#!/bin/bash
# Toggle monitoring providers on/off

MONITORING_CONFIG="backend/.env.monitoring"

show_status() {
    echo "Current monitoring status:"
    echo "========================"
    grep -E "^(NEW_RELIC|DATADOG|SPLUNK|HONEYCOMB)_ENABLED=" $MONITORING_CONFIG 2>/dev/null || echo "No status flags found"
}

toggle_newrelic() {
    if grep -q "^NEW_RELIC_ENABLED=false" $MONITORING_CONFIG; then
        sed -i 's/^NEW_RELIC_ENABLED=false/NEW_RELIC_ENABLED=true/' $MONITORING_CONFIG
        echo "✅ New Relic ENABLED"
    elif grep -q "^NEW_RELIC_ENABLED=true" $MONITORING_CONFIG; then
        sed -i 's/^NEW_RELIC_ENABLED=true/NEW_RELIC_ENABLED=false/' $MONITORING_CONFIG
        echo "❌ New Relic DISABLED"
    else
        echo "NEW_RELIC_ENABLED=true" >> $MONITORING_CONFIG
        echo "✅ New Relic ENABLED (added to config)"
    fi
}

case "$1" in
    status)
        show_status
        ;;
    newrelic)
        toggle_newrelic
        echo ""
        show_status
        echo ""
        echo "⚠️  Restart services for changes to take effect"
        ;;
    *)
        echo "Usage: $0 {status|newrelic|datadog|splunk}"
        echo ""
        show_status
        ;;
esac
