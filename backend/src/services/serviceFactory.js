/**
 * Service Factory - Provides backward compatibility for service references
 * 
 * This file serves as a compatibility layer for transitioning to DI-based services.
 * It ensures that existing code that directly imports services will still work
 * while we gradually move to the dependency injection architecture.
 */

const logger = require('../utils/logger');
const ServiceFactory = require('../utils/ServiceFactory');

// Initialize the DI container
ServiceFactory.initializeContainer();

// Export the legacy services
module.exports = {
  // Re-export the DI container
  container: ServiceFactory.container,
  
  // Weather service - use DI version but maintain backward compatibility
  weatherService: ServiceFactory.createWeatherService(),
  
  // Scheduler service - use DI version but maintain backward compatibility
  schedulerService: ServiceFactory.createSchedulerService(),
  
  /**
   * Get a service from the DI container
   * @param {string} serviceName - The name of the service
   * @returns {Object} - The service instance
   */
  getService: (serviceName) => {
    try {
      return ServiceFactory.container.resolve(serviceName);
    } catch (error) {
      logger.error(`Failed to resolve service '${serviceName}': ${error.message}`);
      return null;
    }
  }
};