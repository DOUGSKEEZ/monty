# APM & Monitoring Infrastructure - Documentation & Decommissioning Guide

> **Status:** PARTIALLY DECOMMISSIONED (as of 2026-02-20)
> **Purpose:** This document serves as both a showcase of the enterprise-grade monitoring architecture implemented in Monty, and a practical guide for decommissioning when ready.
>
> **2026-02-20 Update:** Datadog APM system-level injection was removed to resolve yt-dlp/Deno compatibility issues. The Datadog agent's `/etc/ld.so.preload` hook was conflicting with Deno's runtime (required by yt-dlp for YouTube JS challenge solving). Services disabled: `datadog-agent`, `datadog-agent-trace`. The application-level monitoring (Prometheus, Grafana, New Relic) remains functional.

---

## Executive Summary

Monty implements a **multi-vendor Application Performance Monitoring (APM) architecture** that mirrors patterns used by large-scale enterprises. This was built as a learning exercise to understand:

- Prometheus metrics exposition and time-series databases
- Multi-vendor metrics forwarding (write once, observe everywhere)
- Middleware-based request instrumentation
- Circuit breaker and retry observability patterns
- Enterprise APM platforms (New Relic, DataDog, Splunk, Elasticsearch)

**Current Resource Usage:**
| Component | RAM | CPU | Disk | Network |
|-----------|-----|-----|------|---------|
| Prometheus | 77 MB | ~0% | 128 MB | Local only |
| Grafana | 239 MB | 0.4% | Minimal | Local only |
| MultiVendor Middleware | - | - | - | HTTP to New Relic/DataDog per request |
| **Total** | **316 MB** | **~0.4%** | **128 MB** | Outbound to APM vendors |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MONTY APM ARCHITECTURE (Enterprise Pattern)              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │   Express   │                                                            │
│  │   Request   │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      MIDDLEWARE LAYER                                 │  │
│  │  ┌─────────────────────┐    ┌──────────────────────────────────────┐ │  │
│  │  │  metricsMiddleware  │    │  multiVendorMetricsMiddleware        │ │  │
│  │  │  (Prometheus)       │    │  (All External Vendors)              │ │  │
│  │  │  • process.hrtime() │    │  • New Relic API                     │ │  │
│  │  │  • Histogram obs.   │    │  • DataDog StatsD                    │ │  │
│  │  │  • Counter inc.     │    │  • Splunk HEC (disabled)             │ │  │
│  │  │  • ~2μs overhead    │    │  • Elasticsearch (disabled)          │ │  │
│  │  └─────────┬───────────┘    │  • ~5-50ms async (non-blocking)      │ │  │
│  │            │                └──────────────────┬───────────────────┘ │  │
│  └────────────┼─────────────────────────────────────┼────────────────────┘  │
│               │                                     │                       │
│               ▼                                     ▼                       │
│  ┌─────────────────────────┐        ┌─────────────────────────────────────┐│
│  │ PrometheusMetricsService│        │    MultiVendorMetricsService        ││
│  │ (In-Memory Metrics)     │        │    (External API Calls)             ││
│  │                         │        │                                     ││
│  │ • http_request_duration │        │  ┌──────────┐  ┌──────────────────┐ ││
│  │ • http_requests_total   │        │  │ DataDog  │  │    New Relic     │ ││
│  │ • service_health_status │        │  │ StatsD   │  │   Metrics API    │ ││
│  │ • circuit_breaker_state │        │  │ :8125    │  │ metric-api.nr.com│ ││
│  │ • retry_attempts_total  │        │  └──────────┘  └──────────────────┘ ││
│  │ • recovery_attempts     │        │                                     ││
│  │ • api_call_duration     │        │  ┌──────────┐  ┌──────────────────┐ ││
│  └───────────┬─────────────┘        │  │ Splunk   │  │  Elasticsearch   │ ││
│              │                      │  │ HEC      │  │  :9200           │ ││
│              │                      │  │ (off)    │  │  (off)           │ ││
│              ▼                      │  └──────────┘  └──────────────────┘ ││
│  ┌─────────────────────────┐        └─────────────────────────────────────┘│
│  │   /metrics endpoint     │                                               │
│  │   (Prometheus format)   │                                               │
│  └───────────┬─────────────┘                                               │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────┐        ┌─────────────────────────────────────┐│
│  │   Prometheus Server     │───────▶│        Grafana Dashboards           ││
│  │   (Port 9090)           │        │        (Port 3000)                  ││
│  │   • 90-day retention    │        │        • Visualization              ││
│  │   • TSDB storage        │        │        • Alerting                   ││
│  │   • 15s scrape interval │        │        • Query builder              ││
│  └─────────────────────────┘        └─────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What Was Implemented

### 1. Prometheus Metrics Service
**File:** `backend/src/services/PrometheusMetricsService.js`

A singleton service using `prom-client` that exposes standard Prometheus metrics:

```javascript
// Metrics implemented:
- http_request_duration_seconds (Histogram)  // Request latency distribution
- http_requests_total (Counter)              // Request count by route/method/status
- service_health_status (Gauge)              // Service health: 0=error, 0.5=degraded, 1=ok
- circuit_breaker_state (Gauge)              // Circuit breaker: 0=open, 0.5=half, 1=closed
- retry_attempts_total (Counter)             // Retry tracking by operation
- recovery_attempts_total (Counter)          // Self-healing attempts
- api_call_duration_seconds (Histogram)      // External API latency
```

**Why This Matters:** This is the exact same pattern Netflix, Uber, and other large-scale systems use. Prometheus is the de-facto standard for cloud-native observability.

### 2. Multi-Vendor Metrics Service
**File:** `backend/src/services/MultiVendorMetricsService.js`

An abstraction layer that sends metrics to multiple APM platforms simultaneously:

```javascript
// Unified API - write once, observe everywhere
await multiVendorMetrics.sendMetric('shade_control', 1, 'counter', { room: 'bedroom' });
await multiVendorMetrics.sendEvent('Scene Executed', 'Good Morning', { shades: 14 });
```

**Supported Providers:**
| Provider | Protocol | Use Case |
|----------|----------|----------|
| DataDog | StatsD (UDP) | Real-time metrics, APM |
| New Relic | HTTP Metrics API | Full-stack observability |
| Splunk | HTTP Event Collector | Log aggregation, SIEM |
| Elasticsearch | REST API | Search, analytics |
| Honeycomb | HTTP API | High-cardinality debugging |
| Console | stdout | Development/debugging |

**Why This Matters:** Enterprise environments often run multiple monitoring tools (legacy + modern, different teams, compliance requirements). This pattern allows graceful migration between vendors without code changes.

### 3. Middleware Instrumentation
**Files:**
- `backend/src/middleware/metricsMiddleware.js`
- `backend/src/middleware/multiVendorMetricsMiddleware.js`

Automatic instrumentation of all HTTP requests without modifying route handlers:

```javascript
// Every request automatically gets:
- Request duration (high-resolution timing)
- Route/method/status labels
- Business metric tagging (weather, shades, music endpoints)
- Error event generation (5xx responses)
```

**Why This Matters:** This is the "decorator pattern" applied to observability - separation of concerns that keeps business logic clean while ensuring comprehensive monitoring.

### 4. Circuit Breaker Observability
**File:** `backend/src/utils/CircuitBreaker.js`

Circuit breakers report their state to Prometheus, enabling alerting on degraded dependencies:

```javascript
// Circuit states visible in metrics:
CLOSED (1.0)    → Healthy, requests flowing
HALF_OPEN (0.5) → Testing if dependency recovered
OPEN (0.0)      → Failing fast, dependency down
```

**Why This Matters:** This pattern (from Michael Nygard's "Release It!") prevents cascade failures. Making circuit state observable enables proactive incident response.

### 5. Prometheus + Grafana Stack
**Services:**
- Prometheus: `systemctl status prometheus` (Port 9090)
- Grafana: `systemctl status grafana-server` (Port 3000)

Full time-series database with 90-day retention and visualization dashboards.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `backend/.env.monitoring` | Provider credentials and enable/disable flags |
| `config/prometheus.service` | Systemd service for Prometheus |
| `backend/src/monitoring/newrelic.js` | New Relic agent configuration |

### Current `.env.monitoring` Settings
```bash
# Active
NEW_RELIC_ENABLED=true
CONSOLE_METRICS_ENABLED=true

# Configured but disabled
SPLUNK_ENABLED=false
ELASTICSEARCH_ENABLED=false
ELASTICSEARCH_METRICS_ENABLED=false
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /metrics` | Prometheus metrics (text format) |
| `GET /api/monitoring/status` | Health of all monitoring providers |
| `GET /api/monitoring/config` | Current monitoring configuration |
| `GET /api/monitoring/dashboard` | Aggregated monitoring dashboard |
| `POST /api/monitoring/test-metric` | Send test metric to all providers |
| `POST /api/monitoring/test-event` | Send test event to all providers |

---

## Skills Demonstrated

This implementation demonstrates proficiency in:

- **Observability Patterns:** RED metrics (Rate, Errors, Duration), USE metrics (Utilization, Saturation, Errors)
- **Cloud-Native Tooling:** Prometheus, Grafana, OpenMetrics format
- **Enterprise APM Platforms:** New Relic, DataDog, Splunk, Elasticsearch
- **Software Architecture:** Singleton pattern, middleware pattern, dependency injection
- **Resilience Patterns:** Circuit breakers, retry with backoff, self-healing
- **DevOps Practices:** Systemd services, health checks, graceful degradation

---

## Decommissioning Instructions

When ready to simplify the monitoring stack, follow these steps:

### Phase 1: Disable External APM Providers (Recommended First)

This stops outbound network requests while preserving local observability.

```bash
# Edit the monitoring configuration
nano /home/monty/monty/backend/.env.monitoring

# Change these values:
NEW_RELIC_ENABLED=false
DATADOG_ENABLED=false
SPLUNK_ENABLED=false
ELASTICSEARCH_ENABLED=false
CONSOLE_METRICS_ENABLED=false  # Optional, just logs to console

# Restart the backend to apply changes
cd /home/monty/monty
./prod-restart-backend.sh
```

**Result:** No more outbound API calls to APM vendors. Saves network I/O on every request.

### Phase 2: Stop Grafana (Optional - Reclaims 239 MB RAM)

Grafana can be stopped and started on-demand for demos.

```bash
# Stop Grafana
sudo systemctl stop grafana-server

# Disable auto-start on boot
sudo systemctl disable grafana-server

# Verify it's stopped
systemctl status grafana-server
```

**To restart for demos:**
```bash
sudo systemctl start grafana-server
# Access at http://192.168.10.15:3000
```

### Phase 3: Stop Prometheus Server (Optional - Reclaims 77 MB RAM)

Note: The `/metrics` endpoint will still work - it's built into Express. Stopping Prometheus only removes the long-term storage and scraping.

```bash
# Stop Prometheus
sudo systemctl stop prometheus

# Disable auto-start on boot
sudo systemctl disable prometheus

# Verify it's stopped
systemctl status prometheus
```

**To restart:**
```bash
sudo systemctl start prometheus
# Access at http://192.168.10.15:9090
```

### Phase 4: Remove MultiVendor Middleware (Optional - Code Change)

If you want to completely remove the multi-vendor overhead from the request path:

```bash
# Edit server.js
nano /home/monty/monty/backend/src/server.js

# Comment out or remove this line:
# app.use(multiVendorMetricsMiddleware);

# Restart backend
cd /home/monty/monty
./prod-restart-backend.sh
```

### What to KEEP (Recommended)

| Component | Why Keep It |
|-----------|-------------|
| `/metrics` endpoint | Zero overhead, useful for debugging |
| `PrometheusMetricsService` | In-memory only, ~2μs per request |
| `metricsMiddleware` | Lightweight, feeds /metrics |

These components are essentially free and provide valuable debugging capability.

---

## Reverting (If Needed)

To restore full monitoring:

```bash
# Re-enable services
sudo systemctl enable --now grafana-server
sudo systemctl enable --now prometheus

# Re-enable APM providers
nano /home/monty/monty/backend/.env.monitoring
# Set desired providers to 'true'

# Restart backend
cd /home/monty/monty
./prod-restart-backend.sh
```

---

## Interview Talking Points

When showcasing this system:

1. **"Why multi-vendor?"** - Enterprises often have multiple monitoring tools due to acquisitions, team preferences, or compliance. This architecture allows writing metrics once and forwarding everywhere.

2. **"Why Prometheus?"** - It's the CNCF standard, powers Kubernetes monitoring, and uses a pull-based model that's more resilient than push-based alternatives.

3. **"What about cost?"** - The middleware uses `Promise.allSettled()` so one slow/failed provider doesn't affect others. Sampling rates are configurable per provider.

4. **"How does this scale?"** - The pattern scales horizontally. In production, you'd add a metrics aggregator (like Prometheus Federation or Cortex) for multi-instance deployments.

5. **"What would you do differently?"** - For a home project, this is overkill. I'd use a lightweight solution like Beszel for system metrics and keep Prometheus for application metrics only if needed.

---

## Related Documentation

- `docs/Monty-Metrics-Service-Summary.md` - Detailed technical summary
- `backend/src/services/PrometheusMetricsService.js` - Core metrics implementation
- `backend/src/services/MultiVendorMetricsService.js` - Multi-vendor abstraction
- `backend/src/middleware/` - Request instrumentation

---

*Document created: February 2026*
*Author: Doug & Claude*
