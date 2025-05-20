# Monty Backend Server Fix

## Problem Description

The Monty backend server was failing to start properly - it would initialize but hang before starting to listen on port 3001. After investigation, we determined several issues:

1. The `schedulerService` was causing a hang during initialization due to:
   - Circular dependencies between services
   - Lack of timeout handling for external API calls
   - Missing error handling in initialization

2. The server initialization process was not modular, making it difficult to:
   - Identify which component was causing the hang
   - Start the server if a non-critical service failed to initialize
   - Properly sequence service initialization

## Solution Implemented

We created several fixed versions of the server with progressive improvements:

### 1. Minimal Server (`minimal-server.js`)

A barebone server implementation that:
- Includes only essential middleware (cors, body-parser)
- Provides only a health endpoint
- Avoids loading any potentially problematic services
- Uses explicit host binding with `0.0.0.0`

### 2. Debug Server (`server-debug.js`)

The original server with extensive debugging logs:
- Adds timestamps to all console logs
- Logs each step of the initialization process 
- Adds a server startup timeout

### 3. Fixed Scheduler Service (`schedulerService.fixed.js`)

A refactored scheduler service that:
- Uses explicit initialization rather than auto-initialization in constructor
- Adds timeouts to all external API calls and file operations
- Handles circular dependencies through lazy loading
- Provides better error handling and recovery
- Doesn't block server startup if it fails

### 4. Modular Server (`modular-server.js`)

A complete rewrite of the server initialization process:
- Starts the HTTP server first, then initializes services
- Loads services in sequence with proper error handling
- Uses non-blocking initialization for non-essential services
- Provides better monitoring endpoints

## Enhanced Monitoring Features

We've added several new features to improve system monitoring and observability:

### 1. Service Registry

A centralized service registry (`ServiceRegistry.js`) that:
- Tracks the status of all services
- Provides health check capabilities
- Monitors response times and error rates
- Implements a pub/sub event system for service status changes

### 2. Enhanced Health Endpoint

The `/api/health` endpoint now provides:
- Overall system status (ok, warning, degraded, critical)
- Summaries of service health
- Detailed service metrics with the `?full=true` parameter
- Status-based HTTP response codes

### 3. Status Dashboard

A new `/api/dashboard` endpoint provides:
- HTML-based visual dashboard of service status
- Real-time service metrics
- Auto-refresh capability
- Color-coded status indicators

### 4. Debug Endpoint

The `/api/debug` endpoint provides:
- Detailed information about the server environment
- Service initialization status
- Memory usage statistics
- Comprehensive service registry data

## Initialization Retry Logic

To improve resilience during startup, we've implemented a robust retry mechanism with the following features:

### 1. RetryHelper Utility Class

The `RetryHelper` class (`/src/utils/RetryHelper.js`) provides:
- Configurable retry attempts with exponential backoff
- Service-specific retry configurations
- Detailed retry statistics tracking
- Error classification for retryable vs. non-retryable errors
- Event callbacks for retry attempts

Key features:
```javascript
// Configure retry settings globally
retryHelper.maxRetries = 3;         // Max number of retry attempts
retryHelper.initialDelay = 1000;    // Initial delay in ms
retryHelper.backoffFactor = 2;      // Each retry waits 2x longer
retryHelper.enabled = true;         // Can be disabled for testing

// Use with async operations
await retryHelper.retryOperation(
  async () => { /* operation code */ },
  {
    operationName: 'service-initialization', 
    isCritical: true,                        // Is this operation critical?
    maxRetries: 5,                           // Override default retries
    initialDelay: 2000,                      // Override default delay
    backoffFactor: 1.5,                      // Override default backoff
    onRetry: (attempt, delay, error) => {    // Called before each retry
      // Update UI or logs with retry information
    },
    shouldRetry: (error) => {                // Determine if error is retryable
      return !(error instanceof SyntaxError); // Don't retry syntax errors
    }
  }
);
```

### 2. Service-Specific Retry Strategies

Different services have custom retry configurations:
- **Critical services** (like config routes) have higher retry limits
- **Complex services** (like scheduler) have longer delays between retries
- **Non-critical services** can fail after exhausting retries without crashing the server
- **Syntax errors** (like in music routes) are identified as non-retryable

### 3. Retry Monitoring and Reporting

All retry attempts are tracked and reported:
- The `/api/health` endpoint shows retry statistics
- The `/api/dashboard` provides visual retry status
- Retry configurations can be viewed in `/api/debug`
- Service cards show retry attempt counts

### 4. Progressive Backoff Strategy

The system implements an exponential backoff strategy:
- First retry: Initial delay (default: 1000ms)
- Second retry: Initial delay × backoff factor (default: 2000ms)
- Third retry: Previous delay × backoff factor (default: 4000ms)
- And so on, with configurable limits

### 5. Configurable Retry Settings

Retry settings can be configured from:
- Environment variables
- Configuration file (`config.json`)
- Programmatic API for testing scenarios
- Service-specific overrides

## How to Use the Fixed Server

We've added several new scripts to run different server implementations:

1. **Minimal Server**
   ```bash
   cd backend
   node src/minimal-server.js
   ```

2. **Debug Server**
   ```bash
   cd backend
   node src/server-debug.js
   ```

3. **Modular Server with Fixed Scheduler (Recommended)**
   ```bash
   cd backend
   node start-fixed.js
   ```

Additionally, a test script is provided to validate server startup:
```bash
./test-backend-servers.sh [server-option]
```

Where `server-option` can be: minimal, debug, modular, direct, or original.

## Key Changes Made

1. **Service Initialization**
   - Moved service initialization out of constructors
   - Added explicit initialize methods with proper Promise handling
   - Added timeouts to all async operations

2. **Circular Dependencies**
   - Implemented lazy loading to avoid circular dependency issues
   - Used dynamic require() for services that depend on each other

3. **Error Handling**
   - Added try/catch blocks around all service initialization
   - Added Promise timeout handling for async operations
   - Implemented fallbacks for critical services

4. **Server Startup**
   - Changed server to start listening first, then initialize services
   - Made non-critical service initialization non-blocking
   - Added better debug endpoints to monitor initialization status

5. **Service Monitoring**
   - Added a centralized service registry
   - Implemented health check capabilities for all services
   - Created a status dashboard for system health visualization
   - Added error rate tracking and automatic status degradation

6. **Retry Logic**
   - Implemented exponential backoff for transient errors
   - Added specialized retry policies for different service types
   - Integrated retry tracking with the monitoring dashboard
   - Differentiated between retryable and non-retryable errors

## Self-Healing Implementation

We've implemented comprehensive self-healing capabilities to ensure the system can automatically recover from failures:

### 1. Circuit Breaker Pattern

The `CircuitBreaker` class (`/src/utils/CircuitBreaker.js`) implements:
- Three circuit states: CLOSED (normal), OPEN (failing), and HALF-OPEN (testing recovery)
- Automatic transitioning between states based on failure thresholds
- Fallback mechanisms when circuits are open
- Configurable timeouts and thresholds
- Metrics for monitoring circuit status

Usage example:
```javascript
// Create a circuit breaker
const apiCircuit = new CircuitBreaker({
  name: 'api-service',
  failureThreshold: 3,                // Open after 3 failures
  resetTimeout: 30000,                // Try half-open after 30 seconds
  fallbackFunction: async (params) => {
    // Provide fallback behavior when circuit is open
    return { success: false, fromFallback: true, params };
  }
});

// Use the circuit breaker
try {
  const result = await apiCircuit.execute(async () => {
    // Normal operation that might fail
    return await makeApiCall();
  }, params);
} catch (error) {
  // Handle the error
}
```

### 2. Service Watchdog

The `ServiceWatchdog` class (`/src/utils/ServiceWatchdog.js`) provides:
- Periodic health checking of registered services
- Automatic detection of service failures
- Recovery procedures for failed services
- Exponential backoff for repeated recovery attempts
- Detailed recovery history and statistics

Usage example:
```javascript
// Register a service for monitoring
serviceWatchdog.registerService('scheduler-service', {
  isCritical: true,
  monitorMemory: true,
  memoryThresholdMB: 100,
  recoveryProcedure: async (serviceName, attemptNumber) => {
    // Custom recovery logic
    await restartService(serviceName);
    return { success: true };
  }
});
```

### 3. Service Registry

The `ServiceRegistry` singleton (`/src/utils/ServiceRegistry.js`) provides:
- Centralized registry for all services
- Health status tracking for services
- Service discovery and dependency management
- Event emission for service status changes

### 4. Missed Schedule Detection

The scheduler service has been enhanced with:
- Detection of missed schedules due to server downtime
- Intelligent recovery of missed schedules based on time of day
- Tracking of schedule execution history for monitoring
- Automatic rescheduling of important missed schedules

### 5. Self-Healing Dashboard

The dashboard at `/api/dashboard` now includes:
- Circuit breaker status visualization
- Service health indicators
- Recovery attempt history
- Missed schedule information

### 6. Test Script

We've created a test script to demonstrate self-healing capabilities:
```bash
node backend/test-self-healing.js
```

This script allows you to:
- Simulate failures in different services
- Observe circuit breakers opening and closing
- Watch the service watchdog detect and recover services
- Monitor the system's self-healing in real-time

## Dependency Injection Implementation

We've implemented a comprehensive dependency injection system to improve modularity, testability, and maintainability:

### 1. DependencyContainer

The `DependencyContainer` class (`/src/utils/DependencyContainer.js`) provides:
- Service lifecycle management (singleton, transient)
- Automatic dependency resolution
- Factory functions for complex initialization
- Hierarchical containers with parent-child relationships

Usage example:
```javascript
// Get the container singleton
const { container } = require('./utils/DependencyContainer');

// Register a dependency
container.register('logger', Logger, {
  lifecycle: Lifecycle.SINGLETON
});

// Register with explicit dependencies
container.register('weatherService', WeatherService, {
  dependencies: ['logger', 'configManager'],
  lifecycle: Lifecycle.SINGLETON
});

// Resolve a dependency (automatically resolves nested dependencies)
const weatherService = container.resolve('weatherService');
```

### 2. Interface Definitions

We've created interfaces for key services in the `/src/interfaces` directory:
- `IWeatherService`: Interface for weather data providers
- `ISchedulerService`: Interface for scheduler implementations
- `BaseInterface`: Utility class for interface verification

These interfaces define the contract that implementations must follow and provide runtime type checking.

### 3. Refactored Services

Services have been refactored to use explicit dependency injection:
- Each service now accepts its dependencies via constructor
- Services implement their respective interfaces
- No more direct imports of other services (avoids circular dependencies)
- Factory functions provided for backward compatibility

Example:
```javascript
class WeatherService extends IWeatherService {
  constructor(logger, configManager) {
    super();
    this.logger = logger;
    this.configManager = configManager;
    // Initialize with injected dependencies
  }
  
  // Implementation of interface methods
}
```

### 4. Testing Support

A specialized `TestContainer` extends the DI container with testing features:
- Easy mock registration with `registerMock()`
- Interface-based mock creation with `mockFromInterface()`
- Jest-compatible mock functionality
- Ability to restore original implementations

Example test:
```javascript
const { testContainer } = require('../utils/TestContainer');
const IWeatherService = require('../interfaces/IWeatherService');

// Create mock from interface
const mockWeatherService = testContainer.mockFromInterface(
  'weatherService', 
  IWeatherService
);

// Configure mock behavior
mockWeatherService.mockReturnValue('getCurrentWeather', {
  success: true, 
  data: { temperature: 75 }
});

// Test with the mock
const schedulerService = new SchedulerService(
  mockLogger, 
  mockConfigManager,
  mockWeatherService, // Injected mock
  mockShadeService
);
```

### 5. Container Configuration

The container can be configured in different ways:
- Direct registration for production code
- Factory overrides for special environments
- Interface verification to ensure implementations are valid
- Hierarchical containers for feature isolation

### 6. Migration Strategy

To ensure backward compatibility while migrating to DI:
- Legacy services continue to work with the singleton pattern
- Factory functions create properly injected instances
- New code uses DI by default
- Gradual migration of existing services as needed

## Future Improvements

1. **Enhanced Metrics**
   - Add integration with Prometheus for better metrics collection
   - Implement request-specific tracing
   - Add log aggregation for better debugging

## Accessing the Monitoring Features

Once you've started the server with `node start-fixed.js`, you can access:

1. **Basic Health Check**:
   ```
   http://localhost:3001/api/health
   ```

2. **Detailed Health Check**:
   ```
   http://localhost:3001/api/health?full=true
   ```

3. **Debug Information**:
   ```
   http://localhost:3001/api/debug
   ```

4. **Status Dashboard**:
   ```
   http://localhost:3001/api/dashboard
   ```