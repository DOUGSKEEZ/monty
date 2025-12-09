# Monty Backend Architecture

This document describes the current backend service architecture.

## Active Server

- **Server**: `server.js` - Main Express server with service registry, dependency injection, and health monitoring
- **Startup**: `dev.sh` (development with nodemon + New Relic) or systemd service (production)

## Core Services

| Service | File | Description |
|---------|------|-------------|
| SchedulerService | `SchedulerService.js` | Shade scene automation with sunset-based timing, wake-up alarms |
| WeatherService | `WeatherService.js` | OpenWeatherMap integration with caching and quota management |
| PianobarService | `PianobarService.js` | Pianobar process lifecycle management with circuit breakers |
| PianobarWebsocketService | `PianobarWebsocketService.js` | Real-time music updates via WebSocket |
| BluetoothService | `BluetoothService.js` | Bluetooth speaker connection management |

## Supporting Services

| Service | File | Description |
|---------|------|-------------|
| PrometheusMetricsService | `PrometheusMetricsService.js` | Prometheus metrics collection |
| AlarmNotificationService | `AlarmNotificationService.js` | Wake-up alarm notifications |
| NotificationService | `NotificationService.js` | General notification handling |
| ShadeCommanderMonitorService | `ShadeCommanderMonitorService.js` | Monitors ShadeCommander (FastAPI) health |

## Utility Classes

| Utility | File | Description |
|---------|------|-------------|
| ServiceRegistry | `ServiceRegistry.js` | Central registry for service health status |
| ServiceWatchdog | `ServiceWatchdog.js` | Service health monitoring and self-healing |
| CircuitBreaker | `CircuitBreaker.js` | Circuit breaker pattern for fault tolerance |
| RetryHelper | `RetryHelper.js` | Retry logic with exponential backoff |
| ServiceFactory | `ServiceFactory.js` | Dependency injection factory |
| DependencyContainer | `DependencyContainer.js` | DI container implementation |

## External Services

| Service | Port | Description |
|---------|------|-------------|
| ShadeCommander | 8000 | FastAPI microservice for RF shade control |
| Prometheus | 9090 | Metrics collection (optional) |
| Grafana | 3000 | Metrics visualization (optional) |

## Cleanup History

The following legacy files were removed during production preparation (December 2024):
- `modular-server.js` - Obsolete alternate server implementation
- `start-with-metrics.sh` - Referenced deleted modular-server
- Various `.fixed.js` and `.di.js` versions consolidated into main service files
