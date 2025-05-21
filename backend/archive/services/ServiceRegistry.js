/**
 * Service Registry for Monty Backend
 * 
 * This module provides a centralized registry for all services,
 * tracking their status, initialization state, and health metrics.
 */

const EventEmitter = require('events');
const logger = require('../utils/logger').getModuleLogger('service-registry');

class ServiceRegistry extends EventEmitter {
  constructor() {
    super();
    this.services = {};
    this.lastUpdateTime = Date.now();
    this.startupTime = Date.now();
    
    // Set up a periodic check for all registered services
    setInterval(() => this.checkAllServices(), 60000); // Check every minute
  }
  
  /**
   * Register a service with the registry
   * @param {string} name - Name of the service
   * @param {object} options - Service options
   * @param {boolean} options.isCore - Whether this is a core service (required for operation)
   * @param {number} options.timeout - Timeout for service operations in ms
   * @param {Function} options.checkHealth - Function to check service health
   */
  register(name, options = {}) {
    if (this.services[name]) {
      logger.warn(`Service ${name} already registered, updating`);
    }
    
    this.services[name] = {
      name,
      status: 'pending',
      isCore: options.isCore || false,
      timeout: options.timeout || 10000,
      checkHealth: options.checkHealth || null,
      lastCheck: null,
      lastError: null,
      metrics: {
        successCount: 0,
        errorCount: 0,
        lastResponseTime: null,
        avgResponseTime: 0
      },
      registeredAt: Date.now(),
      initializedAt: null
    };
    
    logger.info(`Registered service: ${name}, core: ${options.isCore}`);
    this.emit('service:registered', name);
    return this;
  }
  
  /**
   * Set a service's status
   * @param {string} name - Service name
   * @param {string} status - Status to set ('pending', 'initializing', 'ready', 'error', 'warning')
   * @param {string} message - Optional status message
   */
  setStatus(name, status, message = null) {
    if (!this.services[name]) {
      throw new Error(`Cannot set status for unregistered service: ${name}`);
    }
    
    const prevStatus = this.services[name].status;
    this.services[name].status = status;
    
    if (message) {
      this.services[name].lastError = message;
    }
    
    if (status === 'ready' && !this.services[name].initializedAt) {
      this.services[name].initializedAt = Date.now();
    }
    
    // Log status changes
    if (prevStatus !== status) {
      if (status === 'error') {
        logger.error(`Service ${name} status changed: ${prevStatus} -> ${status}${message ? ': ' + message : ''}`);
      } else if (status === 'warning') {
        logger.warn(`Service ${name} status changed: ${prevStatus} -> ${status}${message ? ': ' + message : ''}`);
      } else {
        logger.info(`Service ${name} status changed: ${prevStatus} -> ${status}${message ? ': ' + message : ''}`);
      }
      
      // Emit event when status changes
      this.emit('service:statusChanged', {
        name,
        prevStatus,
        status,
        message
      });
    }
    
    return this;
  }
  
  /**
   * Log a successful operation for a service
   * @param {string} name - Service name
   * @param {number} responseTime - Response time in ms
   */
  logSuccess(name, responseTime = 0) {
    if (!this.services[name]) {
      return false;
    }
    
    const service = this.services[name];
    service.metrics.successCount++;
    service.metrics.lastResponseTime = responseTime;
    
    // Calculate running average of response time
    service.metrics.avgResponseTime = 
      (service.metrics.avgResponseTime * (service.metrics.successCount - 1) + responseTime) / 
      service.metrics.successCount;
      
    return true;
  }
  
  /**
   * Log an error for a service
   * @param {string} name - Service name
   * @param {string} error - Error message
   */
  logError(name, error) {
    if (!this.services[name]) {
      return false;
    }
    
    const service = this.services[name];
    service.metrics.errorCount++;
    service.lastError = error;
    
    // Set service status based on error threshold
    const errorRate = service.metrics.errorCount / 
      (service.metrics.successCount + service.metrics.errorCount);
    
    if (errorRate > 0.5 && service.metrics.errorCount >= 3) {
      this.setStatus(name, 'error', `High error rate: ${(errorRate * 100).toFixed(1)}%`);
    } else if (errorRate > 0.2 && service.metrics.errorCount >= 2) {
      this.setStatus(name, 'warning', `Elevated error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    
    return true;
  }
  
  /**
   * Check the health of a specific service
   * @param {string} name - Service name
   * @returns {Promise<object>} - Health check result
   */
  async checkService(name) {
    if (!this.services[name]) {
      throw new Error(`Cannot check unregistered service: ${name}`);
    }
    
    const service = this.services[name];
    service.lastCheck = Date.now();
    
    try {
      // If the service has a health check function, call it
      if (typeof service.checkHealth === 'function') {
        const startTime = Date.now();
        
        // Apply timeout to the health check
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timed out')), service.timeout);
        });
        
        // Race the health check against the timeout
        const result = await Promise.race([
          service.checkHealth(),
          timeoutPromise
        ]);
        
        const responseTime = Date.now() - startTime;
        this.logSuccess(name, responseTime);
        
        if (result && result.status === 'ok') {
          this.setStatus(name, 'ready');
        } else if (result && result.status === 'warning') {
          this.setStatus(name, 'warning', result.message || 'Warning status reported');
        } else {
          this.setStatus(name, 'error', result.message || 'Health check failed');
        }
        
        return result;
      }
      
      // If no health check function, just return current status
      return {
        status: service.status === 'ready' ? 'ok' : service.status,
        message: service.status === 'ready' ? 'Service is ready' : 
                (service.lastError || `Service status is ${service.status}`)
      };
    } catch (error) {
      this.logError(name, error.message);
      this.setStatus(name, 'error', `Health check error: ${error.message}`);
      
      return {
        status: 'error',
        message: error.message
      };
    }
  }
  
  /**
   * Check all registered services
   * @returns {Promise<object>} - Status of all services
   */
  async checkAllServices() {
    const results = {};
    const checkPromises = [];
    
    for (const [name, service] of Object.entries(this.services)) {
      // Don't check services too frequently
      if (service.lastCheck && Date.now() - service.lastCheck < 30000) {
        results[name] = {
          status: service.status === 'ready' ? 'ok' : service.status,
          message: 'Using cached status (checked within last 30s)'
        };
        continue;
      }
      
      checkPromises.push(
        this.checkService(name)
          .then(result => {
            results[name] = result;
          })
          .catch(error => {
            results[name] = {
              status: 'error',
              message: error.message
            };
          })
      );
    }
    
    // Wait for all checks to complete
    await Promise.allSettled(checkPromises);
    
    this.lastUpdateTime = Date.now();
    return results;
  }
  
  /**
   * Get a summary of the overall system health
   * @returns {object} - System health summary
   */
  getSystemHealth() {
    const services = Object.values(this.services);
    const coreServices = services.filter(s => s.isCore);
    
    // Count services by status
    const statusCounts = {
      ready: services.filter(s => s.status === 'ready').length,
      error: services.filter(s => s.status === 'error').length,
      warning: services.filter(s => s.status === 'warning').length,
      pending: services.filter(s => s.status === 'pending').length,
      initializing: services.filter(s => s.status === 'initializing').length
    };
    
    // Count core services by status
    const coreStatusCounts = {
      ready: coreServices.filter(s => s.status === 'ready').length,
      error: coreServices.filter(s => s.status === 'error').length,
      warning: coreServices.filter(s => s.status === 'warning').length,
      pending: coreServices.filter(s => s.status === 'pending').length,
      initializing: coreServices.filter(s => s.status === 'initializing').length
    };
    
    // Determine overall system status
    let systemStatus = 'ok';
    if (coreStatusCounts.error > 0) {
      systemStatus = 'critical';
    } else if (statusCounts.error > 0 || coreStatusCounts.warning > 0) {
      systemStatus = 'degraded';
    } else if (statusCounts.warning > 0) {
      systemStatus = 'warning';
    }
    
    return {
      status: systemStatus,
      uptime: Math.floor((Date.now() - this.startupTime) / 1000),
      lastUpdate: this.lastUpdateTime,
      services: {
        total: services.length,
        core: coreServices.length,
        byStatus: statusCounts
      },
      coreServices: {
        total: coreServices.length,
        byStatus: coreStatusCounts
      }
    };
  }
  
  /**
   * Get detailed information about all services
   * @returns {object} - Detailed service information
   */
  getDetailedStatus() {
    const result = {};
    
    for (const [name, service] of Object.entries(this.services)) {
      result[name] = {
        status: service.status,
        isCore: service.isCore,
        lastError: service.lastError,
        metrics: { ...service.metrics },
        lastCheck: service.lastCheck,
        uptime: service.initializedAt ? 
          Math.floor((Date.now() - service.initializedAt) / 1000) : null
      };
    }
    
    return result;
  }
}

// Create and export singleton instance
const registry = new ServiceRegistry();
module.exports = registry;