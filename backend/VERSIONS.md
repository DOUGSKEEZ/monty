# Version History for Monty Backend

This document tracks the versions of key services and files in the Monty backend system.

## Service Versions

### Weather Service

| Version | File | Description |
|---------|------|-------------|
| v1.0    | weatherService.js | Original implementation with basic caching |
| v2.0    | weatherService.fixed.js | Enhanced version with resilient error handling, exponential backoff, and improved caching |
| v3.0    | weatherService.di.js | Dependency injection version for better testability and improved architecture |

### Scheduler Service

| Version | File | Description |
|---------|------|-------------|
| v1.0    | schedulerService.js | Original implementation with basic scheduling functionality |
| v2.0    | schedulerService.fixed.js | Enhanced version with circuit breakers, self-healing, and missed schedule recovery |
| v3.0    | schedulerService.di.js | Dependency injection version for better testability |

### Server Implementations

| Version | File | Description |
|---------|------|-------------|
| v1.0    | server.js | Original implementation |
| v1.1    | server-debug.js | Debug version with extensive logging |
| v1.2    | minimal-server.js | Minimal implementation for testing |
| v1.3    | simplified-server.js | Simplified implementation for testing |
| v2.0    | modular-server.js | Modular implementation with better initialization sequence, service registry, and self-healing |

## Utility Classes

| Version | File | Description |
|---------|------|-------------|
| v1.0    | logger.js | Basic logger utility |
| v1.0    | config.js | Configuration management utility |
| v1.0    | CircuitBreaker.js | Circuit breaker pattern implementation |
| v1.0    | RetryHelper.js | Retry logic with exponential backoff |
| v1.0    | ServiceWatchdog.js | Service health monitoring and recovery |
| v1.0    | ServiceRegistry.js | Central registry for service status |
| v1.0    | DependencyContainer.js | Dependency injection container |
| v1.0    | TestContainer.js | Testing extensions for DI container |

## Active Files

The currently active files are:

- **Server**: modular-server.js
- **Weather Service**: weatherService.di.js (preferred) or weatherService.fixed.js
- **Scheduler Service**: schedulerService.di.js (preferred) or schedulerService.fixed.js

## Startup Scripts

- **Production**: start-fixed.js (runs modular-server.js)
- **Development**: start-with-nodemon.sh (runs modular-server.js with hot reloading)

## Archived Files

Files that have been moved to the archive directory:

- direct-server.js
- start-direct.js
- src/server-debug.js
- src/minimal-server.js
- src/simplified-server.js
- src/services/musicService.js.bak
- src/services/musicService.js.updated