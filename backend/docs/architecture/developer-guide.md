# Developer Guide

This guide provides guidelines and best practices for developers working on the Monty backend.

## Development Workflow

1. **Setup**: Ensure you have the necessary development environment
   ```bash
   cd backend
   npm install
   ```

2. **Development Server**: Start the backend with hot-reload
   ```bash
   npm run dev
   ```

3. **Testing**: Run tests to verify changes
   ```bash
   npm test
   ```

4. **Code Quality**: Ensure code meets quality standards
   ```bash
   npm run lint
   ```

## Service Implementation

When adding or modifying services, follow these guidelines:

### 1. Define an Interface

Create an interface that extends `BaseInterface`:

```javascript
// src/interfaces/IMyService.js
const BaseInterface = require('./BaseInterface');

class IMyService extends BaseInterface {
  static get methods() {
    return {
      doSomething: "function",
      getData: "function",
      updateSettings: "function"
    };
  }
}

module.exports = IMyService;
```

### 2. Implement the Service

Create a service implementation that follows the interface:

```javascript
// src/services/myService.di.js
const IMyService = require('../interfaces/IMyService');

class MyService {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || console;
    this.configManager = dependencies.configManager;
    
    // Service initialization
    this.initialized = false;
    this.init();
  }
  
  async init() {
    try {
      // Initialization logic
      this.initialized = true;
      this.logger.info('MyService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize MyService', error);
      // Handle gracefully, implement circuit breaker if needed
    }
  }
  
  async doSomething(param) {
    if (!this.initialized) {
      return { success: false, error: 'Service not initialized' };
    }
    
    try {
      // Implementation logic
      return {
        success: true,
        result: 'Operation completed'
      };
    } catch (error) {
      this.logger.error('Error in doSomething', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
  
  // Implement other methods from interface
  
  async getServiceStatus() {
    return {
      success: true,
      status: this.initialized ? 'running' : 'error',
      // Additional status info
    };
  }
}

// Validate that this class implements the interface
IMyService.verifyImplementation(MyService.prototype, 'MyService');

module.exports = MyService;
```

### 3. Register with Dependency Container

Update the service factory to register your service:

```javascript
// In src/utils/ServiceFactory.js
function createMyService() {
  if (!container.has('myService')) {
    container.register('myService', MyService, {
      dependencies: ['logger', 'configManager'],
      lifecycle: Lifecycle.SINGLETON
    });
  }
  return container.resolve('myService');
}

// Add to exports
exports.createMyService = createMyService;
```

### 4. Expose via Service Factory

Add the service to the service factory exports:

```javascript
// In src/services/serviceFactory.js
const ServiceFactory = require('../utils/ServiceFactory');

module.exports = {
  // Other services...
  myService: ServiceFactory.createMyService(),
  // Helper function
  getService: (serviceName) => ServiceFactory.container.resolve(serviceName)
};
```

## Error Handling

Services should follow these error handling guidelines:

1. **Graceful Degradation**: Handle errors without crashing
2. **Consistent Error Format**: Return `{ success: false, error: 'Error message' }`
3. **Logging**: Log errors with appropriate levels
4. **Circuit Breaker**: Consider implementing a circuit breaker for external dependencies

## Documentation

Document your service by creating a markdown file in `/docs/services/`:

```markdown
# My Service

Description of what the service does and its key features.

## Interface

```javascript
class IMyService extends BaseInterface {
  static get methods() {
    // List of required methods
  }
}
```

## Usage Examples

```javascript
// Example code showing how to use the service
```

## Response Format

// Document expected response formats
```

## Testing

Create tests for your service in the `/tests` directory:

```javascript
// tests/my-service.test.js
const TestContainer = require('../utils/TestContainer');
const IMyService = require('../interfaces/IMyService');
const MyService = require('../services/myService.di');

describe('MyService', () => {
  let testContainer;
  let myService;
  
  beforeEach(() => {
    testContainer = new TestContainer();
    // Configure test dependencies
    
    testContainer.register('myService', MyService, {
      dependencies: ['logger', 'configManager']
    });
    
    myService = testContainer.resolve('myService');
  });
  
  it('should initialize correctly', () => {
    expect(myService.initialized).toBe(true);
  });
  
  // Additional tests
});
```

## Performance Considerations

- Keep service initialization lightweight
- Implement caching for expensive operations
- Use async/await for asynchronous operations
- Consider rate limiting for external API calls

## Security Considerations

- Validate all inputs
- Sanitize data before storing or processing
- Follow least privilege principle
- Handle sensitive data securely