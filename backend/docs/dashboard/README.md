# Monty API Dashboard

The Monty API Dashboard provides a comprehensive real-time monitoring interface for all system services, external integrations, and hardware components.

## Overview

**Dashboard URL**: `http://192.168.0.15:3001/api/dashboard`

The dashboard is a self-contained HTML page that displays:
- Service health status with color-coded indicators
- Real-time metrics and performance data
- External service monitoring (OpenWeatherMap, ShadeCommander)
- Hardware status (Arduino connections)
- System recovery and retry statistics
- Interactive controls for service management

## Service Monitoring

### Core Services
- **config**: Configuration management service
- **weather-service**: OpenWeatherMap integration
- **scheduler-service**: Automated shade scheduling
- **shade-service**: Local shade control service
- **music-service**: Pianobar/Pandora integration
- **bluetooth-service**: Bluetooth device management

### External Services
- **ShadeCommander**: FastAPI shade controller (port 8000)
  - Arduino connection monitoring
  - Background task tracking
  - RF transmission status
  - **Custom Metrics Integration**: Real-time hardware status and fire-and-forget task monitoring

## Status Indicators

### Service Status Colors
- 🟢 **Green (Ready/OK)**: Service is operational and responding
- 🟡 **Yellow (Warning/Degraded)**: Service operational with issues
- 🔴 **Red (Error/Critical)**: Service down or unresponsive
- 🔵 **Blue (Initializing/Pending)**: Service starting up

### Service Types
- **Core**: Essential services required for basic operation
- **Optional**: Enhancement services that can fail without system impact

## ShadeCommander Integration

### Monitoring Endpoints
The dashboard monitors ShadeCommander via these endpoints:
- `GET http://192.168.0.15:8000/health` - Service health check
- `GET http://192.168.0.15:8000/arduino/status` - Arduino connection details
- `GET http://192.168.0.15:8000/retries` - Active background task monitoring

### Status Logic
- **Service Status**: Green when ShadeCommander API is responding (regardless of Arduino)
- **Arduino Status**: Independent hardware indicator (🟢 Connected / 🔴 Disconnected)
- **Task Monitoring**: Real-time display of active retry tasks and cancellations

### Displayed Metrics
```
Arduino: 🟢 Connected (COM3) or 🔴 Disconnected (Unknown)
Active Tasks: 0 background retries
Recent Cancellations: 0
Uptime: 2h 15m 30s
```

## Interactive Controls

### Arduino Reconnection
The dashboard includes a "🔌 Reconnect Arduino" button for ShadeCommander.

**Implementation**: Uses a backend proxy to avoid CORS issues
- **Frontend**: `POST /api/shade-commander/reconnect`
- **Backend Proxy**: `POST http://192.168.0.15:8000/arduino/reconnect`

**Button States**:
- Default: "🔌 Reconnect Arduino"
- Loading: "⏳ Reconnecting..."
- Success: "✅ Reconnected!" (auto-refresh after 2s)
- Error: "❌ Failed" or "❌ Error" (reset after 3s)

## Backend Proxy Endpoints

### `/api/shade-commander/reconnect`
**Method**: POST  
**Purpose**: Proxy Arduino reconnection requests to avoid CORS  
**Target**: `http://192.168.0.15:8000/arduino/reconnect`  
**Timeout**: 15 seconds (Arduino detection can take 5-10 seconds)

**Response Format**:
```json
{
  "success": true/false,
  "message": "Connection result message",
  "error": "Error details if failed"
}
```

**Why Proxy?**
- **CORS Prevention**: Browser cannot directly call external APIs from dashboard
- **Error Handling**: Backend provides consistent error responses
- **Logging**: Centralized logging of reconnection attempts
- **Security**: Frontend doesn't expose external API endpoints

## Auto-Refresh

The dashboard includes auto-refresh functionality:
- **Checkbox**: "Auto-refresh (10s)" in top-right corner
- **Interval**: Reloads entire page every 10 seconds when enabled
- **Use Case**: Real-time monitoring of changing service states

## Service Health Checks

### Health Check Frequency
- **Initial Check**: 5 seconds after service startup
- **Periodic Checks**: Every 60 seconds
- **Dashboard Access**: Real-time check on page load

### Health Check Implementation
Each service implements a `checkHealth()` method:

```javascript
checkHealth: async () => {
  return {
    status: 'ok|warning|error',
    message: 'Human-readable status',
    metrics: { /* service-specific data */ }
  };
}
```

### ShadeCommander Health Check
```javascript
checkHealth: async () => {
  // Check ShadeCommander API health
  const healthResponse = await axios.get('http://192.168.0.15:8000/health');
  
  // Get Arduino status separately
  const arduinoResponse = await axios.get('http://192.168.0.15:8000/arduino/status');
  
  // Get background task stats
  const retryResponse = await axios.get('http://192.168.0.15:8000/retries');
  
  // Return combined status
  return {
    status: healthResponse.data.status === 'healthy' ? 'ok' : 'error',
    message: 'Service and Arduino status summary',
    metrics: {
      arduinoConnected: boolean,
      arduinoPort: string,
      activeTasks: number,
      recentCancellations: number,
      uptime: seconds
    }
  };
}
```

## Error Handling

### Network Failures
- **Timeout Handling**: 5-second timeout for health checks, 3-second for status
- **Graceful Degradation**: Shows cached data when external services unavailable
- **Error Messages**: Clear indication of connection failures

### Service Failures
- **Status Preservation**: Last known good status displayed until recovery
- **Error Logging**: Detailed error information in backend logs
- **Recovery Detection**: Automatic status updates when services recover

## Retry and Recovery Statistics

### Retry Information Section
- **Total Operations**: Count of all retry operations attempted
- **Total Retries**: Sum of all retry attempts across operations
- **Successful Operations**: Operations that eventually succeeded
- **Failed Operations**: Operations that failed after all retries
- **Critical Failures**: Failures that affect system stability

### Self-Healing Recovery Section
- **Overall Statistics**: Total recovery attempts and success rate
- **Service-Specific Stats**: Per-service recovery history
- **Recent Activity**: Latest recovery attempts and results

## Customization

### Adding New Services
1. Register service with ServiceRegistry:
```javascript
serviceRegistry.register('my-service', {
  isCore: false,
  status: 'initializing',
  checkHealth: async () => {
    // Implementation
  }
});
```

2. Add custom metrics display (optional):
```javascript
if (name === 'my-service') {
  html += `<p><strong>Custom Metric:</strong> ${service.metrics.customValue}</p>`;
}
```

### Adding Proxy Endpoints
For external service controls that need CORS handling:

```javascript
app.post('/api/my-service/action', async (req, res) => {
  try {
    const response = await axios.post('http://external-service:port/action', req.body);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### ⚠️ CRITICAL: ServiceRegistry Custom Metrics Issue

**🚨 MAJOR DISCOVERY**: When integrating external services with custom metrics, there's a critical ServiceRegistry filtering bug that causes dashboard display failures.

#### The Problem
The `ServiceRegistry.getDetailedStatus()` method only returns a subset of standard metrics:

```javascript
// BROKEN - Filters out custom metrics
metrics: {
  successCount: service.metrics.successCount,
  errorCount: service.metrics.errorCount,
  avgResponseTime: service.metrics.avgResponseTime,
  lastResponseTime: service.metrics.lastResponseTime
  // ❌ Custom metrics like arduinoConnected, activeTasks are LOST here!
}
```

#### Symptoms of This Bug
- ✅ Health checks work perfectly (logs show correct data)
- ✅ Custom metrics stored in service registry successfully  
- ❌ Dashboard shows "undefined" for ALL custom metrics
- ✅ Standard metrics (successCount, etc.) display correctly

#### The Fix (Required for External Services)
Update `src/utils/ServiceRegistry.js` line ~336 in `getDetailedStatus()`:

```javascript
// FIXED - Includes all custom metrics
metrics: {
  successCount: service.metrics.successCount,
  errorCount: service.metrics.errorCount,
  avgResponseTime: service.metrics.avgResponseTime,
  lastResponseTime: service.metrics.lastResponseTime,
  // ✅ Include ALL custom metrics for external services
  ...service.metrics
}
```

#### Debugging External Service Integration
1. **Verify health check data flow**:
   ```javascript
   logger.info(`Final metrics: ${JSON.stringify(finalMetrics)}`);
   ```

2. **Confirm service registry updates**:
   ```javascript
   const service = serviceRegistry.services.get('my-service');
   service.metrics = { ...service.metrics, ...customMetrics };
   logger.info(`✅ Updated ServiceRegistry: ${JSON.stringify(service.metrics)}`);
   ```

3. **Check dashboard data source**:
   ```javascript
   if (serviceDetails['my-service']) {
     logger.info(`🔍 Dashboard receives: ${JSON.stringify(serviceDetails['my-service'])}`);
   }
   ```

#### Impact for Future External Services
This issue will affect **ANY external service** (FastAPI, Flask, Spring Boot, etc.) that needs custom metrics beyond the standard Node.js internal service patterns. The ServiceRegistry was designed for internal services and filters external service metrics by default.

**Fix Required For**: IoT device monitoring, hardware status, external API metrics, custom performance data, third-party service integration.

## Troubleshooting

### Common Issues

**🚨 CRITICAL: External service shows "undefined" for custom metrics**
- **Root Cause**: ServiceRegistry filters out custom metrics in `getDetailedStatus()`
- **Symptoms**: Health checks work, but dashboard shows "undefined" values
- **Solution**: Update `ServiceRegistry.js` to include `...service.metrics` (see Critical section above)
- **Debugging**: Check logs for successful health checks vs dashboard display

**ShadeCommander shows as "error"**
- Check if ShadeCommander is running on port 8000
- Verify network connectivity: `curl http://192.168.0.15:8000/health`
- Check backend logs for connection errors

**Arduino Reconnect button fails**
- Verify ShadeCommander API is responsive
- Check backend logs for proxy request failures  
- Ensure Arduino is physically connected to system
- **CORS Error**: Verify proxy endpoint is implemented (not direct external API calls)

**Auto-refresh not working**
- Check browser JavaScript console for errors
- Verify dashboard page loads completely
- Disable ad blockers that might interfere

**Services stuck in "initializing"**
- Check service logs for startup errors
- Verify all dependencies are available
- Restart services if needed

### Log Analysis
Backend logs include detailed health check information:
```
2024-01-01 12:00:00 [info]: Service shade-commander is ready
2024-01-01 12:00:05 [warn]: Service shade-commander error: ShadeCommander unhealthy
2024-01-01 12:00:10 [info]: Dashboard requested Arduino reconnection via ShadeCommander
```

## Best Practices for External Service Integration

### 1. ServiceRegistry Custom Metrics Pattern
**Always apply this fix** when adding external services with custom metrics:

```javascript
// In ServiceRegistry.js getDetailedStatus() method
metrics: {
  successCount: service.metrics.successCount,
  errorCount: service.metrics.errorCount,
  avgResponseTime: service.metrics.avgResponseTime, 
  lastResponseTime: service.metrics.lastResponseTime,
  ...service.metrics  // ✅ Critical: Include ALL custom metrics
}
```

### 2. Health Check Implementation for External Services
```javascript
checkHealth: async () => {
  // Fetch data from external service
  const customMetrics = await fetchExternalMetrics();
  
  // Update service registry WITHIN the health check
  const service = serviceRegistry.services.get('my-service');
  service.metrics = { ...service.metrics, ...customMetrics };
  serviceRegistry.services.set('my-service', service);
  
  return { status: 'ok', message: 'Service healthy', metrics: customMetrics };
}
```

### 3. CORS Proxy Pattern for Interactive Controls
Always proxy external service actions through backend to avoid CORS issues.

### 4. Testing External Service Integration
1. Verify health checks work: Check logs for metric collection
2. Confirm service registry storage: Add debug logging  
3. Test dashboard display: Verify no "undefined" values
4. Test interactive controls: Verify proxy endpoints work

## Security Considerations

- **Network Isolation**: Dashboard accessible only on local network
- **No Authentication**: Assumes secure network environment
- **Proxy Pattern**: External API calls routed through backend for security
- **Input Validation**: All external data sanitized before display

## Performance

- **Lightweight**: Single HTML page with minimal JavaScript
- **Efficient Polling**: Services checked every 60 seconds, not on every page load
- **Responsive Design**: Works on desktop and mobile devices
- **Fast Loading**: Static content cached, dynamic data fetched asynchronously