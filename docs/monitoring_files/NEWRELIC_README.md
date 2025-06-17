# New Relic Monitoring Setup for Monty Home Automation

## Overview
New Relic provides Application Performance Monitoring (APM) for both the Node.js backend (monty-core) and Python FastAPI ShadeCommander service.

## Quick Status
- **Cost**: FREE (100GB/month free tier)
- **Node.js App**: `monty-core` ✅ Active
- **Python App**: `ShadeCommander` ✅ Active
- **Infrastructure Agent**: ✅ Installed
- **Logs Integration**: ✅ Installed

## Configuration Files

### Node.js (Backend)
- **Config Location**: `backend/src/monitoring/newrelic.js`
- **App Name**: `monty-core`
- **Environment**: `backend/.env.monitoring`

### Python (ShadeCommander)
- **Config Location**: `shades/commander/newrelic.ini`
- **App Name**: `ShadeCommander`
- **Startup Script**: `shades/commander/start-shadecommander.sh`

## Environment Variables
```bash
# In backend/.env.monitoring
NEW_RELIC_LICENSE_KEY=(your key here)
NEW_RELIC_ACCOUNT_ID=(your account here)
NEW_RELIC_APP_NAME=monty
NEW_RELIC_METRIC_API_URL=https://metric-api.newrelic.com/metric/v1
NEW_RELIC_ENABLED=true  # Toggle on/off

## Enable/Disable New Relic

### Method 1: Toggle Script
```bash
# Enable New Relic
./backend/toggle-monitoring.sh newrelic

# Check status
./backend/toggle-monitoring.sh status
```

### Method 2: Manual
```bash
# Edit backend/.env.monitoring
NEW_RELIC_ENABLED=false  # Disable
NEW_RELIC_ENABLED=true   # Enable
```
Note: Restart services after toggling!


## Key Features Configured
### 1. APM (Application Performance Monitoring)

- Transaction traces for all API endpoints
- Error tracking with stack traces
- Response time analysis
- Database query performance (when applicable)

### 2. Distributed Tracing

- See requests flow from Node.js → Python
- Track external API calls (Weather, etc.)
- Identify bottlenecks across services

### 3. Infrastructure Monitoring

- Server CPU, memory, disk metrics
- Process monitoring
- System logs

### 4. Custom Metrics

- Business metrics via `MultiVendorMetricsService`
- Weather API usage tracking
- Shade command success rates
- Service health status

## Ignored Routes

To reduce noise, these endpoints are NOT tracked:
```javascript
// In backend/src/monitoring/newrelic.js
rules: {
  ignore: [
    // '^/api/health$',  // Commented out - needed for ShadeCommander
    '^/metrics$',        // Prometheus endpoint
    '^/ping$'           // Simple ping endpoint
  ]
}
```

## Common Tasks

### View Dashboards

1. Go to [https://one.newrelic.com](https://one.newrelic.com)
2. Navigate to:
    - **APM & Services** → `monty-core` (Node.js)
    - **APM & Services** → `ShadeCommander` (Python)
    - **Infrastructure** → Your server metrics

### Create Custom Dashboard

1. Go to **Dashboards** → **Create dashboard**
2. Useful queries:
```sql
-- HTTP Request Rate
SELECT rate(count(*), 1 minute) 
FROM Transaction 
WHERE appName = 'monty-core' 
FACET request.uri

-- Weather API Calls
SELECT count(*) 
FROM Transaction 
WHERE appName = 'monty-core' 
AND request.uri LIKE '%weather%'

-- Shade Commands
SELECT count(*) 
FROM Transaction 
WHERE appName = 'ShadeCommander' 
FACET request.uri
```

### Check Service Map

1. Go to **APM** → `monty-core`
2. Click **Service Map** (left sidebar)
3. See connections between:
    - monty-core → ShadeCommander
    - monty-core → External APIs

## Troubleshooting

### App Not Showing in APM

1. Check environment variable is set:
```bash
echo $NEW_RELIC_LICENSE_KEY
```
2. Verify agent is loading
```bash
# Check logs for New Relic startup messages
npm run dev | grep -i newrelic
```

3. Generate traffic (health checks are ignored!)
4. Wait 2-3 minutes for data to appear

### High CPU Usage

- Don't use `--reload` flag with Python agent
- Normal overhead: ~1-2% CPU per agent
- Check Infrastructure → Processes for details

### No Distributed Traces

1. Ensure both apps have distributed tracing enabled
2. Make requests that flow through both services
3. Check **Distributed Tracing** in New Relic UI

## Resource Usage

- **Base System**: ~1.5% CPU
- **With New Relic Node.js**: +1% CPU
- **With New Relic Python**: +0.5% CPU
- **Total with New Relic**: ~3% CPU
- **Memory**: ~50MB per agent

## Best Practices

1. Use meaningful transaction names
2. Add custom attributes for business context
3. Create alerts for important metrics
4. Review weekly insights email
5. Don't track high-frequency health checks

## Golden Signals Alerts

Automatically configured alerts for:

- ✅ High Error Rate (>5%)
- ✅ High Response Time (>1s)
- ✅ Low Throughput (unusual drop)
- ✅ High CPU Usage (>90%)

Currently sending to: Email (disabled) Future: Discord/Slack integration

## Free Tier Limits

- **100 GB/month** data ingest
- **8 days** data retention
- **1 full platform user**
- **Unlimited basic users** (read-only)

Current usage: ~1-2 GB/month (plenty of headroom!)

## Links

- Dashboard: [https://one.newrelic.com](https://one.newrelic.com)
- Documentation: [https://docs.newrelic.com](https://docs.newrelic.com)
- Community: [https://discuss.newrelic.com](https://discuss.newrelic.com)

## Next Steps

1. Set up Discord/Slack alerts
2. Create custom dashboards for home automation
3. Configure Synthetic monitoring for uptime
4. Add custom attributes for rooms/scenes
