# Monty Metrics Service Summary

> **Purpose:** This document summarizes Monty's metrics and monitoring architecture to help evaluate integration options with Beszel for a unified home network monitoring solution.

---

## Executive Summary

Monty has a **enterprise-grade, multi-vendor metrics system** that was built as a learning exercise to understand APM (Application Performance Monitoring) patterns used by large organizations. While powerful, it may be **overkill for forwarding basic system metrics to Beszel**.

**Key Insight:** Monty's system is designed for *application-level observability* (HTTP requests, service health, business events), not primarily for *system-level metrics* (CPU, memory, disk). For Beszel integration, you have two practical paths:

1. **Lightweight:** Install Beszel agent on Monty (simplest, recommended)
2. **Integration:** Forward existing metrics to Beszel via the MultiVendorMetricsService (more complex, educational)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MONTY METRICS ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐   │
│  │   Express    │───▶│ metricsMiddleware│───▶│ PrometheusMetrics   │   │
│  │   Request    │    │ (timing/labels)  │    │ Service             │   │
│  └──────────────┘    └──────────────────┘    │  - prom-client      │   │
│         │                                     │  - /metrics endpoint│   │
│         │            ┌──────────────────┐    └─────────┬───────────┘   │
│         └───────────▶│ multiVendorMetrics│             │               │
│                      │ Middleware        │             ▼               │
│                      └────────┬─────────┘    ┌─────────────────────┐   │
│                               │              │ Prometheus Server   │   │
│                               ▼              │ (Port 9090)         │   │
│                      ┌──────────────────┐    │ - 90 day retention  │   │
│                      │ MultiVendorMetrics│   └─────────┬───────────┘   │
│                      │ Service           │             │               │
│                      │  ├─ DataDog ✓     │             ▼               │
│                      │  ├─ New Relic ✓   │    ┌─────────────────────┐   │
│                      │  ├─ Splunk (off)  │    │ Grafana Dashboard   │   │
│                      │  ├─ ELK (off)     │    │ (if configured)     │   │
│                      │  └─ Console ✓     │    └─────────────────────┘   │
│                      └──────────────────┘                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## What Metrics Are Currently Collected

### 1. Application Metrics (Prometheus)

| Metric Name | Type | Description |
|-------------|------|-------------|
| `http_request_duration_seconds` | Histogram | Request latency with route/method/status labels |
| `http_requests_total` | Counter | Total HTTP requests |
| `service_health_status` | Gauge | Health of services (0=error, 0.5=degraded, 1=ok) |
| `circuit_breaker_state` | Gauge | Circuit breaker states (0=open, 0.5=half-open, 1=closed) |
| `retry_attempts_total` | Counter | Retry attempts by operation |
| `recovery_attempts_total` | Counter | Self-healing recovery attempts |
| `api_call_duration_seconds` | Histogram | External API call latency |

**Plus:** All default Node.js metrics (CPU, memory, GC, event loop lag) via `prom-client`.

### 2. System Metrics (system-metrics.js)

The `SystemMetricsService` collects basic system stats:

- CPU usage percentage
- Memory usage (RAM + swap)
- Disk usage (% and total)
- Temperature (thermal zone)
- Active processes count
- Network IP address

**Note:** These are collected for internal health checks, not exposed to Prometheus by default.

### 3. Business Metrics (MultiVendorMetricsService)

Automatically tagged metrics for:
- `weather_api_calls` - Weather API usage
- `shade_control_calls` - Shade automation events
- `music_control_calls` - Pianobar interactions

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/src/services/PrometheusMetricsService.js` | Core Prometheus metrics collection |
| `backend/src/services/MultiVendorMetricsService.js` | Multi-platform metrics forwarding |
| `backend/src/services/system-metrics.js` | System-level metrics collection |
| `backend/src/middleware/metricsMiddleware.js` | HTTP request instrumentation |
| `backend/src/middleware/multiVendorMetricsMiddleware.js` | Multi-vendor HTTP metrics |
| `backend/src/routes/monitoring.js` | Monitoring API endpoints |
| `backend/.env.monitoring` | Provider credentials & config |
| `config/prometheus.service` | Prometheus systemd service |

---

## Prometheus Endpoint Details

**URL:** `http://192.168.10.15:3001/metrics`

**Format:** OpenMetrics/Prometheus text format

**Sample Output:**
```prometheus
# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/weather",status_code="200",le="0.1"} 45
http_request_duration_seconds_bucket{method="GET",route="/api/weather",status_code="200",le="0.3"} 52

# HELP service_health_status Service health status gauge
# TYPE service_health_status gauge
service_health_status{service="WeatherService"} 1
service_health_status{service="PianobarService"} 0.5
service_health_status{service="BluetoothService"} 1
```

---

## Currently Active Monitoring Providers

| Provider | Status | Purpose |
|----------|--------|---------|
| **Prometheus** | ✅ Active | Local metrics storage (90-day retention) |
| **DataDog** | ✅ Active | Cloud APM (StatsD at localhost:8125) |
| **New Relic** | ✅ Active | Cloud APM (Metric API) |
| **Splunk Cloud** | ⚪ Configured but disabled | Log aggregation |
| **Elasticsearch** | ⚪ Configured but disabled | Metrics indexing |
| **Console** | ✅ Active | Development debugging |

---

## Beszel Integration Options

### Option A: Install Beszel Agent (Recommended)

**Pros:**
- Simplest approach - just install the lightweight agent
- Consistent with your other servers
- No code changes to Monty
- Beszel agent is designed for exactly this use case

**Cons:**
- One more thing running on Monty (but it's very lightweight)

**Effort:** ~10 minutes

### Option B: Forward Prometheus Metrics to Beszel

If Beszel supports Prometheus remote write or scraping:

**Pros:**
- Leverage existing metrics infrastructure
- No additional agent on Monty

**Cons:**
- Prometheus metrics are application-focused, not system-focused
- May need to configure Beszel to scrape `http://192.168.10.15:3001/metrics`
- More complex setup

**Effort:** ~30 minutes (if Beszel supports Prometheus)

### Option C: Add Beszel as a MultiVendor Provider

Add Beszel to the MultiVendorMetricsService alongside DataDog and New Relic:

```javascript
// In MultiVendorMetricsService.js
async initializeBeszel() {
  if (process.env.BESZEL_ENABLED === 'true' && process.env.BESZEL_API_URL) {
    this.providers.set('beszel', {
      name: 'Beszel',
      sendMetric: async (name, value, type, tags) => {
        // POST to Beszel API
      },
      sendEvent: async (title, text, tags, level) => {
        // POST event to Beszel
      }
    });
  }
}
```

**Pros:**
- Full integration with Monty's metrics system
- Can send custom application metrics to Beszel
- Educational - learn Beszel's API

**Cons:**
- Most complex option
- Beszel may not need/want application metrics
- Overkill if you just want system metrics

**Effort:** 2-4 hours

---

## Recommendation

**For your use case (basic system metrics across all servers), go with Option A.**

Here's why:

1. **Beszel is designed for system metrics** - CPU, memory, disk, network. That's its sweet spot.

2. **Monty's metrics system is application-focused** - HTTP latency, service health, business events. Different purpose.

3. **Consistency matters** - Your CLio server, LLM server, and Raspberry Pis will all have Beszel agents. Monty should too for a unified view.

4. **The Prometheus/Grafana stack on Monty** can remain for deep application observability when you need to debug Monty-specific issues.

Think of it as two layers:
- **Beszel** = "Are my servers healthy?" (system metrics, all hosts)
- **Prometheus/New Relic** = "Is Monty's application healthy?" (application metrics, Monty only)

---

## If You Want to Reduce Monty's Monitoring Footprint

Since you mentioned the Prometheus/Grafana stack might be overkill, here's what you could safely disable:

### Keep (High Value)
- PrometheusMetricsService - Lightweight, useful for debugging
- `/metrics` endpoint - Free to maintain, useful for occasional checks

### Consider Disabling (Lower Value for Home Use)
- DataDog integration - Unless you're actively using their dashboard
- New Relic integration - Same reasoning
- Prometheus server (the standalone service) - If you're not using Grafana dashboards

### How to Disable Providers

Edit `backend/.env.monitoring`:
```bash
# Set to 'false' to disable
DATADOG_ENABLED=false
NEWRELIC_ENABLED=false
```

### How to Stop Prometheus Server

```bash
sudo systemctl stop prometheus
sudo systemctl disable prometheus
```

The `/metrics` endpoint will still work (it's built into the Express app), you just won't have long-term storage or Grafana.

---

## API Endpoints for Monitoring Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/metrics` | GET | Prometheus metrics (text format) |
| `/api/monitoring/status` | GET | Health of all monitoring providers |
| `/api/monitoring/config` | GET | Current monitoring configuration |
| `/api/monitoring/dashboard` | GET | Aggregated monitoring dashboard |
| `/api/monitoring/test-metric` | POST | Send test metric to all providers |

---

## Summary Table: Monty Metrics vs Beszel

| Aspect | Monty's System | Beszel |
|--------|----------------|--------|
| **Focus** | Application observability | System metrics |
| **Metrics** | HTTP, services, business events | CPU, RAM, disk, network |
| **Scope** | Single application (Monty) | Multiple servers |
| **Complexity** | Enterprise-grade, multi-vendor | Lightweight, simple |
| **Best For** | Debugging app issues | Server health overview |

---

## Conclusion

Your instinct is correct - the Prometheus/Grafana/New Relic stack was a great learning experience, but for unified home network monitoring, Beszel is the right tool. Install the Beszel agent on Monty alongside your other servers, and keep the existing metrics infrastructure available for when you need deep Monty-specific debugging.

You've built something impressive here, and understanding this architecture will serve you well as you scale your home infrastructure!

---

*Document created: February 2026*
*For: Doug's Beszel Integration Planning*
