/**
 * Service Registry - Central registry for tracking all services and their health status
 * 
 * This module provides a central place to register services, track their health,
 * and retrieve service status for monitoring. It also enables cross-service 
 * discovery and dependency management.
 */

const logger = require('./logger');
const prometheusMetrics = require('../services/PrometheusMetricsService');

class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.listeners = [];
    this.lastHealthCheck = null;
    logger.info('ServiceRegistry initialized');
  }

  /**
   * Register a service with the registry
   * @param {string} name - Service name
   * @param {Object} options - Service options
   * @param {boolean} options.isCore - Whether this is a core service (required for operation)
   * @param {Function} options.checkHealth - Function to check service health
   * @returns {ServiceRegistry} - For method chaining
   */
  register(name, options = {}) {
    const isCore = options.isCore !== undefined ? options.isCore : false;
    
    if (this.services.has(name)) {
      logger.warn(`Service ${name} already registered, updating`);
    }

    const serviceInfo = {
      name,
      instance: options.instance || null,
      status: options.status || 'pending',
      isCore,
      lastError: null,
      lastStatusChange: new Date(),
      uptime: 0,
      startTime: options.status === 'ready' ? Date.now() : null,
      checkHealth: options.checkHealth || null,
      metrics: {
        successCount: 0,
        errorCount: 0,
        totalResponseTime: 0,
        avgResponseTime: 0,
        lastResponseTime: null
      }
    };

    this.services.set(name, serviceInfo);
    logger.info(`Service ${name} registered with registry (${isCore ? 'core' : 'optional'})`);
    
    return this;
  }

  /**
   * Set service status
   * @param {string} name - Service name
   * @param {string} status - Service status (ready, warning, error, initializing, pending)
   * @param {string} errorMessage - Optional error message if status is error
   * @returns {boolean} - Whether status changed
   */
  setStatus(name, status, errorMessage = null) {
    if (!this.services.has(name)) {
      logger.warn(`Tried to update status for unregistered service: ${name}`);
      return false;
    }
    
    const service = this.services.get(name);
    const statusChanged = service.status !== status;

    // Update Prometheus metrics
    prometheusMetrics.setServiceHealth(name, status);

    if (statusChanged) {
      const oldStatus = service.status;
      service.status = status;
      service.lastStatusChange = new Date();
      
      // Update metrics based on status change
      if (status === 'ready' && oldStatus !== 'ready') {
        // Service became healthy
        service.startTime = Date.now();
        service.metrics.successCount++;
        logger.info(`Service ${name} is ready`);
      } else if (status === 'error') {
        // Service has an error
        service.lastError = errorMessage;
        service.metrics.errorCount++;
        logger.warn(`Service ${name} error: ${errorMessage}`);
      } else if (status === 'warning') {
        // Service has a warning
        service.lastError = errorMessage;
        logger.warn(`Service ${name} warning: ${errorMessage}`);
      }
      
      // Notify listeners of status change
      this._notifyListeners(name, service);
    }
    
    // Update error message even if status didn't change
    if (status === 'error' || status === 'warning') {
      service.lastError = errorMessage;
    }
    
    // Calculate uptime if service is ready
    if (service.startTime && status === 'ready') {
      service.uptime = (Date.now() - service.startTime) / 1000;
    }
    
    this.services.set(name, service);
    return statusChanged;
  }

  /**
   * Update service metrics
   * @param {string} name - Service name
   * @param {Object} metrics - Service metrics update
   * @param {number} metrics.responseTime - Response time in ms
   * @param {boolean} metrics.success - Whether the operation was successful
   */
  updateMetrics(name, metrics = {}) {
    if (!this.services.has(name)) {
      return;
    }
    
    const service = this.services.get(name);
    
    if (metrics.success !== undefined) {
      if (metrics.success) {
        service.metrics.successCount++;
      } else {
        service.metrics.errorCount++;
      }
    }
    
    if (metrics.responseTime !== undefined) {
      service.metrics.lastResponseTime = metrics.responseTime;
      service.metrics.totalResponseTime += metrics.responseTime;
      
      // Calculate average response time
      const totalOperations = service.metrics.successCount + service.metrics.errorCount;
      if (totalOperations > 0) {
        service.metrics.avgResponseTime = service.metrics.totalResponseTime / totalOperations;
      }
    }
    
    this.services.set(name, service);
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
   * Get service status
   * @param {string} name - Service name
   * @returns {string|null} Status or null if service not found
   */
  getStatus(name) {
    if (!this.services.has(name)) {
      return null;
    }
    return this.services.get(name).status;
  }
  
  /**
   * Update service health based on health check result
   * @param {string} name - Service name
   * @param {boolean|object} healthResult - Health check result
   * @returns {boolean} - Whether update was successful
   */
  updateHealth(name, healthResult) {
    if (!this.services.has(name)) {
      this.logger.warn(`Cannot update health for unknown service: ${name}`);
      return false;
    }
    
    // Update status based on health check
    if (healthResult) {
      const status = healthResult.status || 'unknown';
      const message = healthResult.message || '';
      this.setStatus(name, status, message);
      
      // Update metrics if provided
      if (healthResult.details) {
        if (!this.services.get(name).metrics) {
          this.services.get(name).metrics = {
            successCount: 0,
            errorCount: 0,
            lastResponseTime: 0,
            avgResponseTime: 0,
            totalResponseTime: 0,
            totalChecks: 0
          };
        }
        
        // Record response time if available
        if (healthResult.details.responseTime) {
          const responseTime = healthResult.details.responseTime;
          this.services.get(name).metrics.lastResponseTime = responseTime;
          this.services.get(name).metrics.totalResponseTime += responseTime;
          this.services.get(name).metrics.totalChecks++;
          this.services.get(name).metrics.avgResponseTime = 
            this.services.get(name).metrics.totalResponseTime / this.services.get(name).metrics.totalChecks;
        }
      }
      
      return true;
    }
    
    // If healthResult is a boolean (old API), convert to status
    if (typeof healthResult === 'boolean') {
      this.setStatus(name, healthResult ? 'ready' : 'error');
      return true;
    }
    
    return false;
  }

  /**
   * Check all services' health
   * @returns {Promise<Object>} Health status of all services
   */
  async checkAllServices() {
    const checks = [];
    
    for (const [name, service] of this.services.entries()) {
      if (service.checkHealth && typeof service.checkHealth === 'function') {
        checks.push(this._checkServiceHealth(name));
      }
    }
    
    await Promise.all(checks);
    this.lastHealthCheck = Date.now();
    
    return this.getSystemHealth();
  }
  
  /**
   * Check health of a specific service
   * @param {string} name - Service name
   * @returns {Promise<Object>} - Health check result
   * @private
   */
  async _checkServiceHealth(name) {
    const service = this.services.get(name);
    if (!service || !service.checkHealth) {
      return { status: 'unknown' };
    }
    
    try {
      const startTime = Date.now();
      const result = await service.checkHealth();
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(name, {
        responseTime,
        success: result.status === 'ok' || result.status === 'ready'
      });
      
      // Update service status based on health check
      let serviceStatus = 'ready';
      if (result.status === 'warning' || result.status === 'degraded') {
        serviceStatus = 'warning';
      } else if (result.status === 'error' || result.status === 'critical') {
        serviceStatus = 'error';
      }
      
      this.setStatus(name, serviceStatus, result.message);
      
      return result;
    } catch (error) {
      // Update metrics and status
      this.updateMetrics(name, { success: false });
      this.setStatus(name, 'error', error.message);
      
      logger.error(`Health check failed for service ${name}: ${error.message}`);
      return { status: 'error', message: error.message };
    }
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
        status: service.status,
        isCore: service.isCore,
        lastStatusChange: service.lastStatusChange,
        lastError: service.lastError,
        uptime: service.uptime,
        metrics: {
          successCount: service.metrics.successCount,
          errorCount: service.metrics.errorCount,
          avgResponseTime: service.metrics.avgResponseTime 
        }
      });
    });
    
    return servicesList;
  }

  /**
   * Get detailed information about all services
   * @returns {Object} Map of service names to detailed status info
   */
  getDetailedStatus() {
    const detailedStatus = {};
    
    this.services.forEach((service, name) => {
      detailedStatus[name] = {
        status: service.status,
        isCore: service.isCore,
        lastStatusChange: service.lastStatusChange,
        lastError: service.lastError,
        uptime: service.uptime,
        metrics: {
          successCount: service.metrics.successCount,
          errorCount: service.metrics.errorCount,
          avgResponseTime: service.metrics.avgResponseTime,
          lastResponseTime: service.metrics.lastResponseTime,
          // Include all custom metrics for external services like ShadeCommander
          ...service.metrics
        }
      };
    });
    
    return detailedStatus;
  }
  
  /**
   * Get overall system health
   * @returns {Object} System health status
   */
  getSystemHealth() {
    // Count services by status
    const servicesByStatus = {
      ready: 0,
      warning: 0,
      error: 0,
      initializing: 0,
      pending: 0
    };
    
    const coreServicesByStatus = {
      ready: 0,
      warning: 0,
      error: 0,
      initializing: 0,
      pending: 0
    };
    
    this.services.forEach(service => {
      // Increment counter for this status
      if (servicesByStatus[service.status] !== undefined) {
        servicesByStatus[service.status]++;
        
        // Also count core services
        if (service.isCore) {
          coreServicesByStatus[service.status]++;
        }
      }
    });
    
    // Determine overall system status
    let systemStatus = 'ok';
    
    // If any core service is in error state, system is critical
    if (coreServicesByStatus.error > 0) {
      systemStatus = 'critical';
    }
    // If any core service is in warning state, system is warning
    else if (coreServicesByStatus.warning > 0) {
      systemStatus = 'warning';
    }
    // If any service is in error state, system is degraded
    else if (servicesByStatus.error > 0) {
      systemStatus = 'degraded';
    }
    // If any service is in warning state, system is warning
    else if (servicesByStatus.warning > 0) {
      systemStatus = 'warning';
    }
    
    return {
      status: systemStatus,
      lastUpdate: this.lastHealthCheck || Date.now(),
      uptime: process.uptime(),
      services: {
        total: this.services.size,
        byStatus: servicesByStatus
      },
      coreServices: {
        total: Array.from(this.services.values()).filter(s => s.isCore).length,
        byStatus: coreServicesByStatus
      }
    };
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
      status: service.status,
      isCore: service.isCore,
      timestamp: service.lastStatusChange,
      metrics: service.metrics,
      error: service.lastError
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
    this.lastHealthCheck = null;
    logger.info('ServiceRegistry cleared');
  }
}

// Export singleton instance
const registry = new ServiceRegistry();
module.exports = registry;