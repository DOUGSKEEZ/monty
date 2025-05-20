/**
 * Service Registry - Central registry for tracking all services and their health status
 * 
 * This module provides a central place to register services, track their health,
 * and retrieve service status for monitoring. It also enables cross-service 
 * discovery and dependency management.
 */

const logger = require('./logger');

class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.listeners = [];
    logger.info('ServiceRegistry initialized');
  }

  /**
   * Register a service with the registry
   * @param {string} name - Service name
   * @param {Object} serviceInstance - Service instance
   * @param {boolean} isHealthy - Initial health state
   * @param {Object} metadata - Additional metadata about service
   */
  register(name, serviceInstance, isHealthy = false, metadata = {}) {
    if (this.services.has(name)) {
      logger.warn(`Service ${name} already registered, updating`);
    }

    const serviceInfo = {
      name,
      instance: serviceInstance,
      healthy: isHealthy,
      lastStatusChange: new Date(),
      metadata,
      metrics: {
        failureCount: 0,
        recoveryCount: 0,
        lastFailure: null,
        lastRecovery: null
      }
    };

    this.services.set(name, serviceInfo);
    logger.info(`Service ${name} registered with registry`);
    
    return this;
  }

  /**
   * Update service health status
   * @param {string} name - Service name
   * @param {boolean} isHealthy - New health state
   */
  updateHealth(name, isHealthy) {
    if (!this.services.has(name)) {
      logger.warn(`Tried to update health for unregistered service: ${name}`);
      return false;
    }
    
    const service = this.services.get(name);
    const statusChanged = service.healthy !== isHealthy;
    
    if (statusChanged) {
      service.healthy = isHealthy;
      service.lastStatusChange = new Date();
      
      if (isHealthy) {
        service.metrics.recoveryCount++;
        service.metrics.lastRecovery = new Date();
        logger.info(`Service ${name} recovered`);
      } else {
        service.metrics.failureCount++;
        service.metrics.lastFailure = new Date();
        logger.warn(`Service ${name} failed`);
      }
      
      // Notify listeners of status change
      this._notifyListeners(name, service);
    }
    
    this.services.set(name, service);
    return statusChanged;
  }

  /**
   * Get service by name
   * @param {string} name - Service name
   * @returns {Object|null} Service instance or null if not found
   */
  getService(name) {
    if (!this.services.has(name)) {
      return null;
    }
    return this.services.get(name).instance;
  }

  /**
   * Get service health status
   * @param {string} name - Service name
   * @returns {boolean|null} Health status or null if service not found
   */
  isHealthy(name) {
    if (!this.services.has(name)) {
      return null;
    }
    return this.services.get(name).healthy;
  }

  /**
   * Get all services and their status
   * @returns {Array} Array of service info objects
   */
  getAllServices() {
    const servicesList = [];
    
    this.services.forEach((service, name) => {
      servicesList.push({
        name,
        healthy: service.healthy,
        lastStatusChange: service.lastStatusChange,
        metrics: service.metrics,
        metadata: service.metadata
      });
    });
    
    return servicesList;
  }

  /**
   * Subscribe to service status changes
   * @param {Function} callback - Function to call on status change
   */
  subscribe(callback) {
    if (typeof callback !== 'function') {
      logger.error('Invalid listener callback provided to ServiceRegistry');
      return;
    }
    
    this.listeners.push(callback);
    logger.debug('New listener subscribed to ServiceRegistry');
    
    return this.listeners.length - 1; // Return index for unsubscribing
  }

  /**
   * Unsubscribe from service status changes
   * @param {number} index - Subscription index from subscribe()
   */
  unsubscribe(index) {
    if (index >= 0 && index < this.listeners.length) {
      this.listeners.splice(index, 1);
      logger.debug('Listener unsubscribed from ServiceRegistry');
      return true;
    }
    return false;
  }

  /**
   * Notify all listeners of service status change
   * @param {string} name - Service name
   * @param {Object} service - Service info object
   * @private
   */
  _notifyListeners(name, service) {
    const event = {
      serviceName: name,
      isHealthy: service.healthy,
      timestamp: service.lastStatusChange,
      metrics: service.metrics
    };
    
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error(`Error in ServiceRegistry listener: ${error.message}`);
      }
    });
  }

  /**
   * Clear the registry (mainly for testing)
   */
  clear() {
    this.services.clear();
    this.listeners = [];
    logger.info('ServiceRegistry cleared');
  }
}

// Export singleton instance
const registry = new ServiceRegistry();
module.exports = registry;