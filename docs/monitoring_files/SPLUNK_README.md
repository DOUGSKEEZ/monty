# Splunk Cloud Monitoring Setup for Monty Home Automation

## Overview
Splunk Cloud provides enterprise-grade log aggregation and analysis for the Monty home automation system. We've implemented custom structured logging with a flattened JSON format for easy querying.

```
┌─────────────────┐     ┌─────────────────┐     ┌───────────────────┐     ┌──────────────┐
│ WeatherService  │ --> │ Enhanced Logger │ --> │ SplunkHECTransport│ --> │ Splunk Cloud │
└─────────────────┘     └─────────────────┘     └───────────────────┘     └──────────────┘
        |                                                  |
        v                                                  v
  Rich Context                                      Flattened JSON
  - quota tracking                                  - quota.daily_used
  - cache status                                    - cache_status.exists
  - location data                                   - location.city
```
## Quick Status
- **Cost**: 14-day trial (then Costs $)
- **Node.js Logging**: ✅ Custom HEC Transport
- **Python ShadeCommander**: ❌ Not implemented
- **Log Volume**: ~5K events/day
- **Index**: `monty`

## Architecture

### What We Built

WeatherService → Enhanced Logger → SplunkHECTransport → Splunk Cloud ↓ ↓ Rich Context Flattened JSON (quota, cache, location) (dot notation fields)

### Custom Implementation
- **No winston-splunk-httplogger** - We built our own transport
- **Flattened JSON** - All nested objects use dot notation
- **Module-specific logging** - Each service has its own logger context
- **Correlation IDs** - Track requests across services

## Configuration

### Environment Variables
```bash
# In backend/.env.monitoring
SPLUNK_HOST=prd-p-#.splunkcloud.com
SPLUNK_PORT=8088
SPLUNK_HEC_TOKEN=#
SPLUNK_INDEX=monty
SPLUNK_SOURCE=monty:logs
SPLUNK_SOURCETYPE=monty:logs
SPLUNK_ENABLED=true
SPLUNK_VERIFY_SSL=false  # Required for self-signed certs
```

## What's Logged

### WeatherService (Fully Implemented)

- API calls with quota tracking ($0.001/call)
- Cache hits/misses with age
- Response times and data quality
- Location context (Silverthorne)
- Correlation IDs for request tracing

### Other Services (Basic Logging Only)

- HTTP request/response metrics
- Service health checks
- System metrics (CPU, memory, temp)

## Example Log Entry
```json
{
  "timestamp": "2025-06-18T04:28:19.351Z",
  "level": "info",
  "message": "Weather API call initiated",
  "action": "weather:api_call",
  "trigger": "manual",
  "cache_status.exists": true,
  "cache_status.stale": false,
  "quota.daily_used": 127,
  "quota.percent_used": 12.7,
  "quota.daily_cost": 0.127,
  "location.city": "Silverthorne",
  "location.lat": 39.66,
  "module": "weather-service",
  "correlation_id": "58447f61"
}
```
## Splunk Dashboards

### Weather API Performance
```spl
index="monty" module="weather-service" earliest=-1h
| stats 
    count(eval(action="weather:api_call")) as api_calls
    count(eval(action="weather:cache_hit")) as cache_hits
    avg(duration) as avg_response_ms
| eval cache_hit_rate = round((cache_hits / (cache_hits + api_calls)) * 100, 2)
```

### API Quota Tracking
```spl
index="monty" action="weather:api_call" quota.daily_used=* earliest=-24h
| timechart span=1h 
    max(quota.daily_used) as "API Calls Used"
    max(quota.daily_cost) as "Daily Cost"
```

## Limitations

1. **No APM** - Just logging, no application performance monitoring
2. **No Distributed Tracing** - Correlation IDs exist but aren't visualized
3. **Python Services** - ShadeCommander not integrated
4. **Manual Dashboards** - No pre-built home automation templates

## Level Up with Splunk Observability Cloud

### What We're Missing

1. **APM (via SignalFx)**
    - Service maps showing Monty → ShadeCommander → Arduino flow
    - Latency tracking for shade commands
    - Error tracking with stack traces
2. **Infrastructure Monitoring**
    - Raspberry Pi metrics (CPU, disk, network)
    - Arduino connection health
    - Bluetooth speaker status
3. **Real User Monitoring (RUM)**
    - Frontend performance metrics
    - User interaction tracking
    - Weather dashboard load times
4. **Synthetic Monitoring**
    - Automated health checks every 5 minutes
    - Alert if shades don't respond
    - Weather API availability monitoring
5. **IT Service Intelligence (ITSI)**
    - KPIs for home automation health
    - Service dependencies mapped
    - Predictive analytics for failures

### Cisco/Splunk Integration Opportunities

1. **AppDynamics Integration**
    - Unified dashboard with AppD metrics
    - Business transaction mapping
    - End-to-end visibility
2. **Splunk SOAR**
    - Automated response to failures
    - Self-healing shade commands
    - Weather-based automation playbooks
3. **Splunk Machine Learning Toolkit**
    - Predict shade motor failures
    - Optimize API call patterns
    - Anomaly detection for unusual usage

## Cost Considerations

- **Current**: Free trial (14 days)
- **Splunk Cloud**: ~$150/month for meaningful retention
- **Observability Cloud**: ~$50/month for APM
- **ITSI**: Enterprise pricing ($)

## Next Steps for Full Observability

1. **Enable APM agents** for Node.js and Python
2. **Implement distributed tracing** with trace IDs
3. **Add RUM** to React frontend
4. **Create service dependency maps**
5. **Build ITSI service models** for home automation

## Why This Matters for Enterprise

While Monty doesn't need enterprise logging, this implementation demonstrates:

- Custom transport development
- Structured logging best practices
- Performance optimization (flattened JSON)
- Integration with enterprise platforms
- Cost-conscious monitoring design

Perfect for showing Splunk/AppD I understand their ecosystem! 🚀