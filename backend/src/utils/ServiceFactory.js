/**
 * ServiceFactory - Factory for creating properly configured services
 * 
 * This file provides factories for creating services with their dependencies
 * properly injected, while maintaining compatibility with the existing codebase.
 */

const { container, Lifecycle } = require('./DependencyContainer');
const logger = require('./logger');
const configManager = require('./config');
const CircuitBreaker = require('./CircuitBreaker');
const ServiceRegistry = require('./ServiceRegistry');

// Import interface definitions
const IWeatherService = require('../interfaces/IWeatherService');
const ISchedulerService = require('../interfaces/ISchedulerService');

// Import service implementations
const WeatherService = require('../services/weatherService.di');
const SchedulerService = require('../services/schedulerService.di');

/**
 * Register core dependencies in the container
 */
function registerCoreDependencies() {
  // Register logger
  container.registerInstance('logger', logger);
  
  // Register config manager
  container.registerInstance('configManager', configManager);
  
  // Register circuit breaker
  container.registerInstance('CircuitBreaker', CircuitBreaker);
  
  // Register service registry
  container.registerInstance('serviceRegistry', ServiceRegistry);
  
  return container;
}

/**
 * Create a properly configured Weather Service
 * @returns {WeatherService} - Configured weather service
 */
function createWeatherService() {
  if (!container.has('weatherService')) {
    // Register weather service in container
    container.register('weatherService', WeatherService, {
      dependencies: ['logger', 'configManager'],
      lifecycle: Lifecycle.SINGLETON
    });
    
    // Verify implementation against interface
    const weatherService = container.resolve('weatherService');
    IWeatherService.verifyImplementation(weatherService, 'WeatherService');
  }
  
  return container.resolve('weatherService');
}

/**
 * Create a properly configured Scheduler Service
 * @returns {SchedulerService} - Configured scheduler service
 */
function createSchedulerService() {
  if (!container.has('schedulerService')) {
    // First ensure weather service is registered
    if (!container.has('weatherService')) {
      createWeatherService();
    }
    
    // Register shade service (using legacy singleton for now)
    if (!container.has('shadeService')) {
      const shadeService = require('../services/shadeService');
      container.registerInstance('shadeService', shadeService);
    }
    
    // Register scheduler service in container
    container.register('schedulerService', SchedulerService, {
      dependencies: [
        'logger', 
        'configManager', 
        'weatherService', 
        'shadeService',
        'serviceRegistry',
        'CircuitBreaker'
      ],
      lifecycle: Lifecycle.SINGLETON
    });
    
    // Verify implementation against interface
    const schedulerService = container.resolve('schedulerService');
    ISchedulerService.verifyImplementation(schedulerService, 'SchedulerService');
  }
  
  return container.resolve('schedulerService');
}

/**
 * Initialize the service container with all standard services
 * @returns {Object} - The DI container
 */
function initializeContainer() {
  registerCoreDependencies();
  createWeatherService();
  createSchedulerService();
  
  return container;
}

module.exports = {
  container,
  registerCoreDependencies,
  createWeatherService,
  createSchedulerService,
  initializeContainer
};