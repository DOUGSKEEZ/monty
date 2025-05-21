# Dependency Injection Architecture

Monty uses a lightweight dependency injection (DI) framework to manage service dependencies, improve testability, and reduce coupling between components.

## Key Components

1. **DependencyContainer**: The core container that manages service registration and resolution
2. **ServiceFactory**: A compatibility layer for accessing services with minimal code changes
3. **Interface Definitions**: Contracts that services must implement
4. **TestContainer**: Extended container that simplifies testing with mocks

## DependencyContainer

The `DependencyContainer` class provides the foundation for DI:

```javascript
const container = new DependencyContainer();

// Register a service with explicit dependencies
container.register('weatherService', WeatherService, {
  dependencies: ['logger', 'configManager'],
  lifecycle: Lifecycle.SINGLETON
});

// Resolve a service (automatically resolves dependencies)
const weatherService = container.resolve('weatherService');
```

### Lifecycles

Services can have different lifecycles:

- **SINGLETON**: One instance shared across the application (default)
- **TRANSIENT**: New instance created on each resolve
- **SCOPED**: One instance per scope (e.g., per request)

```javascript
const { Lifecycle } = require('../utils/DependencyContainer');

container.register('logService', LogService, {
  lifecycle: Lifecycle.TRANSIENT
});
```

### Factories

For complex initialization, factory functions can be used:

```javascript
container.registerFactory('database', () => {
  const db = new Database();
  db.connect(connectionString);
  return db;
});
```

## Interface Definitions

Interfaces define the contract that implementations must follow:

```javascript
class IWeatherService extends BaseInterface {
  static get methods() {
    return {
      getCurrentWeather: "function",
      getForecast: "function",
      // Other required methods...
    };
  }
}
```

Services can be verified against interfaces:

```javascript
// Throws if weatherService doesn't implement the interface
IWeatherService.verifyImplementation(weatherService, 'weatherService');
```

## Service Implementation

Services accept their dependencies via constructor injection:

```javascript
class WeatherService {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || console;
    this.configManager = dependencies.configManager;
    // Service initialization...
  }
  
  async getCurrentWeather() {
    // Implementation...
  }
}
```

## ServiceFactory

The `ServiceFactory` provides compatibility with existing code:

```javascript
// Old way (still works)
const weatherService = require('../services/weatherService');

// New way - explicit imports
const { weatherService } = require('../services/serviceFactory');

// New way - dynamic resolution
const { getService } = require('../services/serviceFactory');
const shadeService = getService('shadeService');
```

## Testing with DI

The `TestContainer` extends `DependencyContainer` with testing capabilities:

```javascript
const testContainer = new TestContainer();

// Create a mock that implements IWeatherService
const mockWeatherService = testContainer.mockFromInterface('weatherService', IWeatherService);

// Configure mock behavior
mockWeatherService.mockResolvedValue('getCurrentWeather', {
  success: true,
  data: { temperature: { current: 75 } }
});

// Register mock for testing
testContainer.registerMock('weatherService', mockWeatherService);

// Test a service that depends on weatherService
const schedulerService = testContainer.resolve('schedulerService');
```

## Example Test

```javascript
const TestContainer = require('../utils/TestContainer');
const IWeatherService = require('../interfaces/IWeatherService');
const IConfigService = require('../interfaces/IConfigService');
const SchedulerService = require('../services/schedulerService.di');

describe('SchedulerService', () => {
  let testContainer;
  let mockWeatherService;
  let mockConfigService;
  let schedulerService;
  
  beforeEach(() => {
    testContainer = new TestContainer();
    
    mockWeatherService = testContainer.mockFromInterface('weatherService', IWeatherService);
    mockConfigService = testContainer.mockFromInterface('configService', IConfigService);
    
    // Configure mocks
    mockWeatherService.mockResolvedValue('getSunsetTime', { hour: 19, minute: 30 });
    mockConfigService.mockResolvedValue('getConfigValue', 'scheduler.enabled', true);
    
    // Register mocks
    testContainer.registerMock('weatherService', mockWeatherService);
    testContainer.registerMock('configService', mockConfigService);
    
    // Create service under test with dependencies
    testContainer.register('schedulerService', SchedulerService, {
      dependencies: ['weatherService', 'configService', 'logger']
    });
    
    schedulerService = testContainer.resolve('schedulerService');
  });
  
  it('should schedule sunset event correctly', async () => {
    // Test implementation...
  });
});
```

## Migration Path

To migrate existing services to the DI architecture:

1. Create interface definition for the service
2. Create a new implementation that accepts dependencies via constructor
3. Update the service factory to provide the new implementation
4. Gradually update existing imports to use the service factory

This allows for incremental adoption without breaking existing code.