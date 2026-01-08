# Monty API Dashboard

The Monty API Dashboard provides a comprehensive real-time monitoring interface for all system services, external integrations, and hardware components.

## Overview

**Dashboard URL**: `http://192.168.10.15:3001/api/dashboard`

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
- **system-metrics**: Real-time system monitoring (CPU, memory, disk, temperature)
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
- `GET http://192.168.10.15:8000/health` - Service health check
- `GET http://192.168.10.15:8000/arduino/status` - Arduino connection details
- `GET http://192.168.10.15:8000/retries` - Active background task monitoring

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
- **Backend Proxy**: `POST http://192.168.10.15:8000/arduino/reconnect`

**Button States**:
- Default: "🔌 Reconnect Arduino"
- Loading: "⏳ Reconnecting..."
- Success: "✅ Reconnected!" (auto-refresh after 2s)
- Error: "❌ Failed" or "❌ Error" (reset after 3s)

## Backend Proxy Endpoints

### `/api/shade-commander/reconnect`
**Method**: POST  
**Purpose**: Proxy Arduino reconnection requests to avoid CORS  
**Target**: `http://192.168.10.15:8000/arduino/reconnect`  
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
  const healthResponse = await axios.get('http://192.168.10.15:8000/health');
  
  // Get Arduino status separately
  const arduinoResponse = await axios.get('http://192.168.10.15:8000/arduino/status');
  
  // Get background task stats
  const retryResponse = await axios.get('http://192.168.10.15:8000/retries');
  
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

## System Metrics Integration

### System Metrics Service
The **system-metrics** service provides real-time monitoring of the Ubuntu Server hardware:

#### Displayed Metrics
```
System Load: 0.57 (1-minute average)
Temperature: 50°C (CPU thermal sensor)
Disk Usage: 12% of 98G (root filesystem)
Processes: 373 (total running processes)
Memory Usage: 18% (RAM utilization)
Swap Usage: 0% (swap file utilization) 
Users Logged In: 5 (active SSH sessions)
IPv4 Address: 192.168.10.15 (primary network interface)
```

#### Historical Chart
The dashboard includes a Chart.js time-series chart showing:
- **System Load** (green line)
- **Memory Usage %** (blue line)  
- **Temperature °C** (orange line)

Chart displays last 5 data points updated every 60 seconds.

### ⚠️ CRITICAL: ServiceRegistry Custom Metrics Implementation

**🚨 MAJOR DISCOVERY**: System metrics revealed critical ServiceRegistry bugs that affect ANY service with custom metrics.

#### The Core Issues Fixed

1. **Metrics Not Passed to Dashboard**
   ```javascript
   // ISSUE: updateHealth() only checked healthResult.details, not healthResult.metrics
   if (healthResult.details) { /* only checked .details */ }
   
   // FIX: Check both details AND metrics
   if (healthResult.details || healthResult.metrics) {
     // Merge custom metrics from healthResult.metrics
     if (healthResult.metrics) {
       this.services.get(name).metrics = {
         ...this.services.get(name).metrics,
         ...healthResult.metrics  // ✅ Include custom metrics
       };
     }
   }
   ```

2. **Health Check Results Not Merged**
   ```javascript
   // ISSUE: _checkServiceHealth() called updateMetrics() and setStatus() but NOT updateHealth()
   this.updateMetrics(name, { responseTime, success });
   this.setStatus(name, serviceStatus, result.message);
   // Missing: this.updateHealth(name, result);
   
   // FIX: Add the missing call
   this.updateHealth(name, result);  // ✅ Merges custom metrics
   ```

#### Symptoms of These Bugs
- ✅ Health checks work perfectly (logs show correct data)
- ✅ Custom metrics collected successfully in service  
- ❌ Dashboard shows "N/A" for ALL custom metrics
- ✅ Standard metrics (successCount, etc.) display correctly

#### System Metrics checkHealth() Pattern
```javascript
checkHealth: async () => {
  // Collect system metrics
  const metrics = {};
  metrics.load = parseFloat(loadavg.split(' ')[0]);
  metrics.temperature = parseInt(temp.trim()) / 1000;
  // ... collect other metrics
  
  // Update historical arrays AFTER collecting data
  systemMetricsService.metrics.loadHistory.push(metrics.load);
  systemMetricsService.metrics.memoryUsageHistory.push(parseFloat(metrics.memoryUsage));
  
  // Merge into service metrics
  systemMetricsService.metrics = { 
    ...systemMetricsService.metrics, 
    ...metrics 
  };
  
  // Return metrics for ServiceRegistry
  return {
    status: 'ok',
    message: 'System metrics collected successfully',
    metrics: systemMetricsService.metrics  // ✅ Include ALL metrics
  };
}
```

#### Impact for Future Services
These fixes enable **ANY service** (internal Node.js, external APIs, IoT devices) to display custom metrics properly:
- **Hardware monitoring**: Temperature, disk usage, network stats
- **External API metrics**: Response times, cache hit rates, quotas
- **IoT device status**: Battery levels, connection quality, sensor readings
- **Performance data**: Custom timings, throughput, error rates

## Troubleshooting

### Common Issues

**🚨 CRITICAL: Service shows "N/A" or "undefined" for custom metrics**
- **Root Cause**: ServiceRegistry bugs in `updateHealth()` and `_checkServiceHealth()` methods
- **Symptoms**: Health checks work, logs show correct data, but dashboard shows "N/A" values
- **Solution**: Ensure ServiceRegistry includes both fixes from System Metrics section above
- **Debugging**: Check if `updateHealth(name, result)` is called in `_checkServiceHealth()`

**ShadeCommander shows as "error"**
- Check if ShadeCommander is running on port 8000
- Verify network connectivity: `curl http://192.168.10.15:8000/health`
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

### 1. Custom Metrics Health Check Pattern
**Use this pattern** for services with custom metrics (system monitoring, IoT devices, external APIs):

```javascript
checkHealth: async () => {
  // Collect/fetch custom metrics
  const metrics = {};
  metrics.customValue1 = await getCustomData();
  metrics.customValue2 = await getMoreData();
  
  // Update service metrics internally
  myService.metrics = { 
    ...myService.metrics,  // Preserve existing metrics
    ...metrics             // Add custom metrics
  };
  
  // Return ALL metrics for ServiceRegistry
  return {
    status: 'ok',
    message: 'Service healthy',
    metrics: myService.metrics  // ✅ Include ALL metrics
  };
}
```

### 2. ServiceRegistry Requirements
**Ensure these fixes are applied** in `src/utils/ServiceRegistry.js`:

```javascript
// 1. In updateHealth() method - accept healthResult.metrics
if (healthResult.details || healthResult.metrics) {
  if (healthResult.metrics) {
    this.services.get(name).metrics = {
      ...this.services.get(name).metrics,
      ...healthResult.metrics  // ✅ Merge custom metrics
    };
  }
}

// 2. In _checkServiceHealth() method - call updateHealth()
this.setStatus(name, serviceStatus, result.message);
this.updateHealth(name, result);  // ✅ Required to merge metrics
```

### 3. System Metrics Collection Examples
Common patterns for adding hardware/system monitoring:

```javascript
// File system metrics
const diskStats = await fs.readFile('/proc/diskstats', 'utf8');
metrics.diskIOps = parseDiskStats(diskStats);

// Network interface metrics  
const netStats = await fs.readFile('/proc/net/dev', 'utf8');
metrics.networkThroughput = parseNetworkStats(netStats);

// Process metrics
const { stdout } = await execPromise('ps aux --no-headers | wc -l');
metrics.totalProcesses = parseInt(stdout.trim());

// Custom command metrics
const { stdout } = await execPromise('uptime');
metrics.uptime = parseUptime(stdout);
```

### 4. CORS Proxy Pattern for Interactive Controls
Always proxy external service actions through backend to avoid CORS issues (essential for FastAPI, Flask, etc.).

### 5. Testing Service Integration
1. **Verify health checks work**: Check logs for metric collection
2. **Confirm ServiceRegistry storage**: Add debug logging  
3. **Test dashboard display**: Verify no "N/A" values
4. **Test interactive controls**: Verify proxy endpoints work
5. **Test charts**: Verify historical data updates for system metrics

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