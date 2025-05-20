/**
 * TestContainer - Enhanced DependencyContainer for testing
 * 
 * Extends the standard DependencyContainer with features for testing,
 * particularly the ability to easily register mock implementations.
 */

const { DependencyContainer, Lifecycle } = require('./DependencyContainer');

/**
 * TestContainer for dependency injection during testing
 * @extends DependencyContainer
 */
class TestContainer extends DependencyContainer {
  /**
   * Create a new test container
   */
  constructor() {
    super();
    this.mocks = new Map();
  }
  
  /**
   * Register a mock implementation for a dependency
   * @param {string} id - Unique identifier for the dependency
   * @param {Object} mockInstance - Mock instance to register
   * @returns {TestContainer} - This container instance for chaining
   */
  registerMock(id, mockInstance) {
    if (!id || typeof id !== 'string') {
      throw new Error('Dependency ID must be a non-empty string');
    }
    
    if (mockInstance === undefined || mockInstance === null) {
      throw new Error('Mock instance cannot be null or undefined');
    }
    
    // Store the original implementation if it exists
    if (this._registry.has(id) && !this.mocks.has(id)) {
      this.mocks.set(id, {
        originalImplementation: this._registry.get(id),
        originalInstance: this._instances.get(id)
      });
    }
    
    // Register the mock as a singleton
    this.registerInstance(id, mockInstance);
    
    return this;
  }
  
  /**
   * Create a Jest-compatible mock for a dependency
   * @param {string} id - Unique identifier for the dependency
   * @param {Object} implementation - Implementation to start with (optional)
   * @returns {Object} - Jest-compatible mock object
   */
  createMock(id, implementation = {}) {
    // Create a mock object with Jest-like functionality
    const mock = {
      ...implementation,
      _calls: {},
      _returnValues: {},
      mockClear() {
        for (const method in this._calls) {
          this._calls[method] = [];
        }
      },
      mockReset() {
        this.mockClear();
        for (const method in this._returnValues) {
          delete this._returnValues[method];
        }
      },
      mockImplementation(method, fn) {
        if (typeof this[method] !== 'function') {
          this[method] = function(...args) {
            this._recordCall(method, args);
            return this._getReturnValue(method, args);
          };
        }
        
        this._returnValues[method] = fn;
        return this;
      },
      mockReturnValue(method, value) {
        return this.mockImplementation(method, () => value);
      },
      mockResolvedValue(method, value) {
        return this.mockImplementation(method, async () => value);
      },
      mockRejectedValue(method, value) {
        return this.mockImplementation(method, async () => { throw value; });
      },
      _recordCall(method, args) {
        if (!this._calls[method]) {
          this._calls[method] = [];
        }
        this._calls[method].push(args);
      },
      _getReturnValue(method, args) {
        if (this._returnValues[method]) {
          return this._returnValues[method](...args);
        }
        return undefined;
      },
      mockCalls(method) {
        return this._calls[method] || [];
      }
    };
    
    // Initialize default methods from implementation
    for (const method in implementation) {
      if (typeof implementation[method] === 'function') {
        mock._calls[method] = [];
        
        // Wrap the implementation to track calls
        const originalMethod = implementation[method];
        mock[method] = function(...args) {
          mock._recordCall(method, args);
          return originalMethod.apply(this, args);
        };
      }
    }
    
    // Register the mock
    this.registerMock(id, mock);
    
    return mock;
  }
  
  /**
   * Create and register mocks from an interface
   * @param {string} id - Unique identifier for the dependency
   * @param {Function} interfaceClass - Interface to create mock from
   * @param {Object} implementation - Optional partial implementation
   * @returns {Object} - Mock instance
   */
  mockFromInterface(id, interfaceClass, implementation = {}) {
    if (!interfaceClass || typeof interfaceClass !== 'function') {
      throw new Error('Interface class is required');
    }
    
    // Get method names from the interface prototype
    const interfaceMethods = Object.getOwnPropertyNames(interfaceClass.prototype)
      .filter(name => name !== 'constructor');
    
    // Create a basic implementation for each method
    const mockImpl = { ...implementation };
    for (const method of interfaceMethods) {
      if (!mockImpl[method]) {
        mockImpl[method] = function() {
          return undefined; // Default implementation
        };
      }
    }
    
    // Create the mock
    return this.createMock(id, mockImpl);
  }
  
  /**
   * Restore the original implementation of a mocked dependency
   * @param {string} id - Unique identifier for the dependency
   * @returns {TestContainer} - This container instance for chaining
   */
  restoreMock(id) {
    if (!this.mocks.has(id)) {
      return this;
    }
    
    const { originalImplementation, originalInstance } = this.mocks.get(id);
    
    // Restore original implementation
    if (originalImplementation) {
      this._registry.set(id, originalImplementation);
    } else {
      this._registry.delete(id);
    }
    
    // Restore original instance
    if (originalInstance) {
      this._instances.set(id, originalInstance);
    } else {
      this._instances.delete(id);
    }
    
    // Remove from mocks map
    this.mocks.delete(id);
    
    return this;
  }
  
  /**
   * Restore all mocked dependencies
   * @returns {TestContainer} - This container instance for chaining
   */
  restoreAllMocks() {
    for (const id of this.mocks.keys()) {
      this.restoreMock(id);
    }
    return this;
  }
  
  /**
   * Clear the container, including mocks
   * @returns {TestContainer} - This container instance for chaining
   */
  clear() {
    this.mocks.clear();
    return super.clear();
  }
}

module.exports = {
  TestContainer,
  
  // Export a default singleton test container instance
  testContainer: new TestContainer()
};