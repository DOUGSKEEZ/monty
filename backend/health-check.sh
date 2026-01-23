#!/bin/bash
# Health check script for monty-backend
# Checks if the backend is responding to HTTP requests
# Returns 0 if healthy, 1 if unhealthy

HEALTH_URL="http://127.0.0.1:3001/api/health"
TIMEOUT_SECONDS=15
SERVICE_NAME="monty-backend.service"
LOG_TAG="monty-watchdog"

# Log function that writes to both syslog and stdout
log() {
    echo "$1"
    logger -t "$LOG_TAG" "$1"
}

# Check if the service is even running first
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    log "⚠️ Service $SERVICE_NAME is not running, skipping health check"
    exit 0
fi

# Perform health check
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" 2>/dev/null)
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
    log "🚨 HEALTH CHECK FAILED: curl exit code $CURL_EXIT (timeout or connection refused)"
    log "🔄 Restarting $SERVICE_NAME..."
    systemctl restart "$SERVICE_NAME"
    RESTART_RESULT=$?
    if [ $RESTART_RESULT -eq 0 ]; then
        log "✅ Service restarted successfully"
    else
        log "❌ Failed to restart service (exit code: $RESTART_RESULT)"
    fi
    exit 1
elif [ "$HTTP_CODE" != "200" ]; then
    log "🚨 HEALTH CHECK FAILED: HTTP $HTTP_CODE (expected 200)"
    log "🔄 Restarting $SERVICE_NAME..."
    systemctl restart "$SERVICE_NAME"
    RESTART_RESULT=$?
    if [ $RESTART_RESULT -eq 0 ]; then
        log "✅ Service restarted successfully"
    else
        log "❌ Failed to restart service (exit code: $RESTART_RESULT)"
    fi
    exit 1
else
    # Healthy - silent success (uncomment below for verbose logging)
    # log "✅ Health check passed (HTTP $HTTP_CODE)"
    exit 0
fi
