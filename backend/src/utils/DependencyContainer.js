/**
 * DependencyContainer - Advanced Dependency Injection for the Monty backend server
 * 
 * This module provides a dependency injection container that:
 * - Manages service lifecycles (singleton, transient, scoped)
 * - Resolves dependencies automatically
 * - Supports factory functions for complex initialization
 * - Provides a way to register mock implementations for testing
 */

const logger = require('./logger').getModuleLogger('di-container');

/**
 * Lifecycle options for registered dependencies
 */
const Lifecycle = {
  /**
   * A new instance is created each time the dependency is resolved
   */
  TRANSIENT: 'transient',
  
  /**
   * A single instance is created and reused for the lifetime of the container
   */
  SINGLETON: 'singleton',
  
  /**
   * A single instance is created for each resolution scope (not implemented yet)
   */
  SCOPED: 'scoped'
};

/**
 * Dependency Container for managing service dependencies
 */
class DependencyContainer {
  /**
   * Create a new dependency container
   */
  constructor() {
    // Map of registered dependencies
    this._registry = new Map();
    
    // Map of resolved singleton instances
    this._instances = new Map();
    
    // Map of factory override functions
    this._factories = new Map();
    
    // Resolution stack to detect circular dependencies
    this._resolutionStack = [];
    
    // Parent container for hierarchical containers
    this._parent = null;

    logger.info('DependencyContainer initialized');
  }
  
  /**
   * Set parent container for hierarchical resolution
   * @param {DependencyContainer} parent - Parent container
   * @returns {DependencyContainer} - This container instance for chaining
   */
  setParent(parent) {
    if (!(parent instanceof DependencyContainer)) {
      throw new Error('Parent must be a DependencyContainer instance');
    }
    this._parent = parent;
    return this;
  }
  
  /**
   * Get parent container
   * @returns {DependencyContainer|null} - Parent container or null if none
   */
  getParent() {
    return this._parent;
  }
  
  /**
   * Register a dependency in the container
   * @param {string} id - Unique identifier for the dependency
   * @param {Function|Object} implementation - Class constructor or instance to register
   * @param {Object} options - Registration options
   * @param {string} options.lifecycle - Lifecycle option (default: SINGLETON)
   * @param {Array<string>} options.dependencies - Array of dependency IDs
   * @param {Function} options.factory - Factory function for creating the dependency
   * @returns {DependencyContainer} - This container instance for chaining
   */
  register(id, implementation, options = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Dependency ID must be a non-empty string');
    }
    
    if (!implementation && !options.factory) {
      throw new Error('Either implementation or factory function must be provided');
    }
    
    const lifecycle = options.lifecycle || Lifecycle.SINGLETON;
    if (!Object.values(Lifecycle).includes(lifecycle)) {
      throw new Error(`Invalid lifecycle: ${lifecycle}`);
    }
    
    const dependencies = options.dependencies || [];
    if (!Array.isArray(dependencies)) {
      throw new Error('Dependencies must be an array of dependency IDs');
    }
    
    // Register the dependency
    this._registry.set(id, {
      implementation,
      lifecycle,
      dependencies,
      factory: options.factory || null
    });
    
    // Clear any cached instance if re-registering
    this._instances.delete(id);
    
    logger.debug(`Registered dependency: ${id} (${lifecycle})`);
    return this;
  }
  
  /**
   * Register a factory function for a dependency
   * @param {string} id - Unique identifier for the dependency
   * @param {Function} factory - Factory function to create the dependency
   * @returns {DependencyContainer} - This container instance for chaining
   */
  registerFactory(id, factory) {
    if (!id || typeof id !== 'string') {
      throw new Error('Dependency ID must be a non-empty string');
    }
    
    if (typeof factory !== 'function') {
      throw new Error('Factory must be a function');
    }
    
    this._factories.set(id, factory);
    
    // Clear any cached instance when overriding factory
    this._instances.delete(id);
    
    logger.debug(`Registered factory for: ${id}`);
    return this;
  }
  
  /**
   * Register an instance directly (always as singleton)
   * @param {string} id - Unique identifier for the dependency
   * @param {Object} instance - Instance to register
   * @returns {DependencyContainer} - This container instance for chaining
   */
  registerInstance(id, instance) {
    if (!id || typeof id !== 'string') {
      throw new Error('Dependency ID must be a non-empty string');
    }
    
    if (instance === undefined || instance === null) {
      throw new Error('Instance cannot be null or undefined');
    }
    
    // Register as a singleton
    this._registry.set(id, {
      implementation: instance,
      lifecycle: Lifecycle.SINGLETON,
      dependencies: [],
      factory: null
    });
    
    // Store the instance directly
    this._instances.set(id, instance);
    
    logger.debug(`Registered instance for: ${id}`);
    return this;
  }
  
  /**
   * Check if a dependency is registered
   * @param {string} id - Unique identifier for the dependency
   * @returns {boolean} - True if the dependency is registered
   */
  has(id) {
    return this._registry.has(id) || (this._parent && this._parent.has(id));
  }
  
  /**
   * Resolve a dependency from the container
   * @param {string} id - Unique identifier for the dependency
   * @returns {Object} - Resolved dependency instance
   */
  resolve(id) {
    // Check for circular dependencies
    if (this._resolutionStack.includes(id)) {
      const circle = [...this._resolutionStack, id].join(' -> ');
      throw new Error(`Circular dependency detected: ${circle}`);
    }
    
    // Try to resolve from this container
    if (this._registry.has(id)) {
      try {
        this._resolutionStack.push(id);
        const instance = this._resolveLocal(id);
        this._resolutionStack.pop();
        return instance;
      } catch (error) {
        this._resolutionStack.pop();
        throw error;
      }
    }
    
    // Try to resolve from parent container
    if (this._parent) {
      return this._parent.resolve(id);
    }
    
    throw new Error(`Dependency not registered: ${id}`);
  }
  
  /**
   * Resolve a dependency from this container (without checking parent)
   * @param {string} id - Unique identifier for the dependency
   * @returns {Object} - Resolved dependency instance
   * @private
   */
  _resolveLocal(id) {
    const registration = this._registry.get(id);
    if (!registration) {
      throw new Error(`Dependency not registered: ${id}`);
    }
    
    const { implementation, lifecycle, dependencies, factory } = registration;
    
    // For singletons, return cached instance if available
    if (lifecycle === Lifecycle.SINGLETON && this._instances.has(id)) {
      return this._instances.get(id);
    }
    
    // Check for factory override
    if (this._factories.has(id)) {
      const factoryFn = this._factories.get(id);
      const instance = factoryFn(this);
      
      // Cache singleton instances
      if (lifecycle === Lifecycle.SINGLETON) {
        this._instances.set(id, instance);
      }
      
      return instance;
    }
    
    // Use registration factory if available
    if (factory) {
      const instance = factory(this);
      
      // Cache singleton instances
      if (lifecycle === Lifecycle.SINGLETON) {
        this._instances.set(id, instance);
      }
      
      return instance;
    }
    
    // If implementation is already an instance, return it directly
    if (typeof implementation !== 'function') {
      return implementation;
    }
    
    // Resolve dependencies
    const resolvedDependencies = dependencies.map(depId => this.resolve(depId));
    
    // Create a new instance
    const instance = new implementation(...resolvedDependencies);
    
    // Cache singleton instances
    if (lifecycle === Lifecycle.SINGLETON) {
      this._instances.set(id, instance);
    }
    
    return instance;
  }
  
  /**
   * Create a new resolution scope
   * @returns {DependencyContainer} - A new container with this container as parent
   */
  createScope() {
    const scope = new DependencyContainer();
    scope.setParent(this);
    return scope;
  }
  
  /**
   * Clear all registered dependencies and cached instances
   * @returns {DependencyContainer} - This container instance for chaining
   */
  clear() {
    this._registry.clear();
    this._instances.clear();
    this._factories.clear();
    this._resolutionStack = [];
    logger.debug('Container cleared');
    return this;
  }
}

// Export the container class and lifecycle enum
module.exports = {
  DependencyContainer,
  Lifecycle,
  
  // Export a default singleton container instance
  container: new DependencyContainer()
};