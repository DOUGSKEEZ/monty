/**
 * ServiceWatchdog - Utility for monitoring and automatically recovering services
 * 
 * This class provides automatic monitoring of registered services:
 * - Periodically checks health of services
 * - Detects when services become unhealthy or unresponsive
 * - Attempts to restart/recover failed services
 * - Integrates with service registry to track health status
 * - Records recovery attempts and success rates
 */

const EventEmitter = require('events');
const logger = require('./logger').getModuleLogger('service-watchdog');

class ServiceWatchdog extends EventEmitter {
  /**
   * Create a new ServiceWatchdog
   * @param {Object} serviceRegistry - The service registry to integrate with
   * @param {Object} options - Configuration options
   * @param {number} options.checkInterval - Time in ms between health checks (default: 60000)
   * @param {number} options.startupDelay - Time in ms before first check after startup (default: 120000)
   * @param {number} options.maxConsecutiveFailures - Failures before attempting recovery (default: 3)
   * @param {number} options.recoveryAttemptLimit - Max recovery attempts before giving up (default: 5)
   * @param {number} options.recoveryBackoffFactor - Backoff multiplier for repeated recovery (default: 2)
   * @param {boolean} options.enabled - Whether watchdog is enabled at startup (default: true)
   */
  constructor(serviceRegistry, options = {}) {
    super();
    
    if (!serviceRegistry) {
      throw new Error('ServiceWatchdog requires a serviceRegistry instance');
    }
    
    this.serviceRegistry = serviceRegistry;
    this.checkInterval = options.checkInterval !== undefined ? options.checkInterval : 60000;
    this.startupDelay = options.startupDelay !== undefined ? options.startupDelay : 120000;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures !== undefined ? options.maxConsecutiveFailures : 3;
    this.recoveryAttemptLimit = options.recoveryAttemptLimit !== undefined ? options.recoveryAttemptLimit : 5;
    this.recoveryBackoffFactor = options.recoveryBackoffFactor !== undefined ? options.recoveryBackoffFactor : 2;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    
    // Monitoring status
    this.isMonitoring = false;
    this.checkTimer = null;
    this.lastCheckTime = null;
    
    // Service health tracking
    this.serviceHealth = {};
    
    // Recovery tracking
    this.recoveryHistory = {};
    
    logger.info(`ServiceWatchdog initialized with check interval ${this.checkInterval}ms, enabled: ${this.enabled}`);
    
    // Auto-start monitoring after startup delay
    if (this.enabled) {
      this.startWithDelay(this.startupDelay);
    }
  }
  
  /**
   * Start service monitoring with delay
   * @param {number} delay - Milliseconds to wait before starting
   */
  startWithDelay(delay = 0) {
    if (this.isMonitoring) {
      logger.debug('Monitoring already active, ignoring startWithDelay call');
      return;
    }
    
    logger.info(`ServiceWatchdog will start in ${delay}ms`);
    
    setTimeout(() => {
      this.start();
    }, delay);
  }
  
  /**
   * Start service monitoring
   */
  start() {
    if (this.isMonitoring) {
      logger.debug('Monitoring already active, ignoring start call');
      return;
    }
    
    this.isMonitoring = true;
    this.enabled = true;
    
    logger.info('ServiceWatchdog started monitoring');
    this.emit('monitoring:start');
    
    // Run initial check immediately
    this.checkServices();
    
    // Set up recurring checks
    this.checkTimer = setInterval(() => {
      this.checkServices();
    }, this.checkInterval);
  }
  
  /**
   * Stop service monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    
    logger.info('ServiceWatchdog stopped monitoring');
    this.emit('monitoring:stop');
  }
  
  /**
   * Register a service for monitoring
   * @param {string} serviceName - Name of the service in service registry
   * @param {Object} options - Service-specific monitoring options
   * @param {Function} options.recoveryProcedure - Custom recovery function for this service
   * @param {boolean} options.isCritical - Whether this is a critical service
   * @param {number} options.failureThreshold - Service-specific failure threshold
   * @param {boolean} options.monitorMemory - Whether to check for memory issues
   * @param {number} options.memoryThresholdMB - Memory threshold in MB to trigger recovery
   */
  registerService(serviceName, options = {}) {
    // Verify the service exists in registry
    const service = this.serviceRegistry.getService(serviceName);
    if (!service) {
      logger.warn(`Cannot register unknown service "${serviceName}" for monitoring`);
      return false;
    }
    
    // Initialize health tracking for this service
    this.serviceHealth[serviceName] = {
      name: serviceName,
      status: 'unknown',
      consecutiveFailures: 0,
      lastCheck: null,
      lastFailure: null,
      lastRecovery: null,
      recoveryAttempts: 0,
      recoveryBackoffTime: 0,
      nextRecoveryAttempt: null,
      options: {
        recoveryProcedure: options.recoveryProcedure || this.defaultRecoveryProcedure,
        isCritical: options.isCritical !== undefined ? options.isCritical : service.isCore,
        failureThreshold: options.failureThreshold || this.maxConsecutiveFailures,
        monitorMemory: options.monitorMemory !== undefined ? options.monitorMemory : false,
        memoryThresholdMB: options.memoryThresholdMB || 500,
        customHealthCheck: options.customHealthCheck || null
      }
    };
    
    // Initialize recovery history for this service
    this.recoveryHistory[serviceName] = {
      totalAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      lastAttemptTime: null,
      lastAttemptResult: null,
      details: []
    };
    
    logger.info(`Registered service "${serviceName}" for monitoring, critical: ${this.serviceHealth[serviceName].options.isCritical}`);
    this.emit('service:registered', serviceName);
    
    return true;
  }
  
  /**
   * Unregister a service from monitoring
   * @param {string} serviceName - Name of the service
   */
  unregisterService(serviceName) {
    if (this.serviceHealth[serviceName]) {
      delete this.serviceHealth[serviceName];
      logger.info(`Unregistered service "${serviceName}" from monitoring`);
      this.emit('service:unregistered', serviceName);
      return true;
    }
    return false;
  }
  
  /**
   * Check health of all registered services
   */
  async checkServices() {
    if (!this.isMonitoring || !this.enabled) {
      return;
    }
    
    this.lastCheckTime = Date.now();
    logger.debug(`Starting health check for ${Object.keys(this.serviceHealth).length} services`);
    
    const checkPromises = Object.keys(this.serviceHealth).map(serviceName => 
      this.checkServiceHealth(serviceName).catch(err => {
        logger.error(`Error during health check for "${serviceName}": ${err.message}`);
      })
    );
    
    await Promise.all(checkPromises);
    
    this.emit('checks:complete', {
      time: this.lastCheckTime,
      servicesChecked: Object.keys(this.serviceHealth).length
    });
  }
  
  /**
   * Check health of a specific service
   * @param {string} serviceName - Name of the service
   */
  async checkServiceHealth(serviceName) {
    const serviceData = this.serviceHealth[serviceName];
    if (!serviceData) {
      return;
    }
    
    const service = this.serviceRegistry.getService(serviceName);
    if (!service) {
      logger.warn(`Service "${serviceName}" not found in registry, skipping health check`);
      return;
    }
    
    serviceData.lastCheck = Date.now();
    
    try {
      let healthStatus;
      
      // Use service's own checkHealth if available in service registry
      if (service.checkHealth && typeof service.checkHealth === 'function') {
        healthStatus = await service.checkHealth();
      } 
      // Use custom health check if provided
      else if (serviceData.options.customHealthCheck && typeof serviceData.options.customHealthCheck === 'function') {
        healthStatus = await serviceData.options.customHealthCheck(serviceName);
      }
      // Default to using service status from registry
      else {
        healthStatus = {
          status: service.status === 'ready' ? 'ok' : service.status,
          message: service.lastError || `Service is ${service.status}`
        };
      }
      
      // Check for memory issues if enabled
      let memoryIssue = false;
      if (serviceData.options.monitorMemory && process.memoryUsage) {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        
        if (heapUsedMB > serviceData.options.memoryThresholdMB) {
          memoryIssue = true;
          healthStatus.status = 'warning';
          healthStatus.message = `High memory usage: ${heapUsedMB}MB exceeds threshold ${serviceData.options.memoryThresholdMB}MB`;
        }
      }
      
      // Process health status result
      if (healthStatus.status === 'ok' || healthStatus.status === 'ready') {
        // Service is healthy
        serviceData.status = 'healthy';
        serviceData.consecutiveFailures = 0;
        
        // Reset recovery backoff if the service has been healthy for a while
        if (serviceData.recoveryAttempts > 0 && 
            serviceData.lastRecovery && 
            (Date.now() - serviceData.lastRecovery > this.checkInterval * 3)) {
          serviceData.recoveryAttempts = 0;
          serviceData.recoveryBackoffTime = 0;
          serviceData.nextRecoveryAttempt = null;
        }
      } else {
        // Service is unhealthy
        serviceData.status = 'unhealthy';
        serviceData.consecutiveFailures++;
        serviceData.lastFailure = Date.now();
        
        logger.warn(`Service "${serviceName}" reported unhealthy: ${healthStatus.message}`);
        
        // Check if we need to attempt recovery
        const needsRecovery = serviceData.consecutiveFailures >= serviceData.options.failureThreshold || memoryIssue;
        
        if (needsRecovery) {
          const canAttemptRecovery = this.canAttemptRecovery(serviceName);
          
          if (canAttemptRecovery) {
            this.attemptServiceRecovery(serviceName, `Health check failed: ${healthStatus.message}`);
          } else {
            logger.warn(`Service "${serviceName}" needs recovery but maximum attempts reached or in backoff period`);
          }
        } else {
          logger.info(`Service "${serviceName}" has ${serviceData.consecutiveFailures}/${serviceData.options.failureThreshold} consecutive failures`);
        }
      }
      
      // Emit health status event
      this.emit('service:health', {
        service: serviceName,
        status: serviceData.status,
        consecutive: serviceData.consecutiveFailures,
        details: healthStatus
      });
      
    } catch (error) {
      // Health check itself failed
      serviceData.status = 'check-failed';
      serviceData.consecutiveFailures++;
      serviceData.lastFailure = Date.now();
      
      logger.error(`Health check for "${serviceName}" failed: ${error.message}`);
      
      // Check if we need to attempt recovery due to check failure
      if (serviceData.consecutiveFailures >= serviceData.options.failureThreshold) {
        const canAttemptRecovery = this.canAttemptRecovery(serviceName);
        
        if (canAttemptRecovery) {
          this.attemptServiceRecovery(serviceName, `Health check error: ${error.message}`);
        }
      }
      
      this.emit('service:health', {
        service: serviceName,
        status: 'check-failed',
        consecutive: serviceData.consecutiveFailures,
        error: error.message
      });
    }
  }
  
  /**
   * Check if service recovery can be attempted
   * @param {string} serviceName - Name of the service
   * @returns {boolean} - True if recovery can be attempted
   */
  canAttemptRecovery(serviceName) {
    const serviceData = this.serviceHealth[serviceName];
    if (!serviceData) return false;
    
    // Check if we've reached the maximum recovery attempts
    if (serviceData.recoveryAttempts >= this.recoveryAttemptLimit) {
      return false;
    }
    
    // Check if we're in the backoff period
    if (serviceData.nextRecoveryAttempt && Date.now() < serviceData.nextRecoveryAttempt) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Attempt to recover a failed service
   * @param {string} serviceName - Name of the service
   * @param {string} reason - Reason for recovery attempt
   */
  async attemptServiceRecovery(serviceName, reason) {
    const serviceData = this.serviceHealth[serviceName];
    if (!serviceData) return;
    
    // Update recovery tracking data
    serviceData.recoveryAttempts++;
    const attemptNumber = serviceData.recoveryAttempts;
    
    const attemptTime = Date.now();
    const recoveryId = `${serviceName}-recovery-${attemptTime}`;
    
    logger.info(`Attempting recovery #${attemptNumber} for service "${serviceName}": ${reason}`);
    
    // Update service registry status
    this.serviceRegistry.updateHealth(serviceName, false);
    
    // Record recovery attempt
    this.recoveryHistory[serviceName].totalAttempts++;
    this.recoveryHistory[serviceName].lastAttemptTime = attemptTime;
    
    // Add detailed recovery record
    const recoveryRecord = {
      id: recoveryId,
      attemptNumber,
      time: attemptTime,
      reason,
      successful: false,
      duration: 0,
      error: null,
      result: null
    };
    
    // Push to limited-size history array
    this.recoveryHistory[serviceName].details.unshift(recoveryRecord);
    if (this.recoveryHistory[serviceName].details.length > 10) {
      this.recoveryHistory[serviceName].details.pop();
    }
    
    // Emit recovery attempt event
    this.emit('recovery:attempt', {
      service: serviceName,
      attemptNumber,
      reason,
      id: recoveryId
    });
    
    // Execute the recovery procedure
    try {
      const recoveryStartTime = Date.now();
      const result = await serviceData.options.recoveryProcedure(serviceName, attemptNumber);
      const recoveryDuration = Date.now() - recoveryStartTime;
      
      // Update recovery record with success
      recoveryRecord.successful = true;
      recoveryRecord.duration = recoveryDuration;
      recoveryRecord.result = result;
      
      // Update service health data
      serviceData.lastRecovery = Date.now();
      serviceData.status = 'recovered';
      serviceData.consecutiveFailures = 0;
      
      // Update recovery history
      this.recoveryHistory[serviceName].successfulRecoveries++;
      this.recoveryHistory[serviceName].lastAttemptResult = 'success';
      
      logger.info(`Recovery of "${serviceName}" succeeded after ${recoveryDuration}ms`);
      
      // Update service registry
      this.serviceRegistry.updateHealth(serviceName, true);
      
      // Emit recovery success event
      this.emit('recovery:success', {
        service: serviceName,
        attemptNumber,
        duration: recoveryDuration,
        id: recoveryId,
        result
      });
      
      return true;
    } catch (error) {
      // Update recovery record with failure
      recoveryRecord.successful = false;
      recoveryRecord.error = error.message;
      recoveryRecord.duration = Date.now() - attemptTime;
      
      // Update recovery history
      this.recoveryHistory[serviceName].failedRecoveries++;
      this.recoveryHistory[serviceName].lastAttemptResult = 'failure';
      
      // Calculate exponential backoff for next attempt
      serviceData.recoveryBackoffTime = Math.min(
        1800000, // Max 30 minutes
        3000 * Math.pow(this.recoveryBackoffFactor, serviceData.recoveryAttempts - 1)
      );
      
      serviceData.nextRecoveryAttempt = Date.now() + serviceData.recoveryBackoffTime;
      
      logger.error(`Recovery of "${serviceName}" failed: ${error.message}. Next attempt in ${Math.round(serviceData.recoveryBackoffTime/1000)}s`);
      
      // Update service registry
      this.serviceRegistry.updateHealth(serviceName, false);
      
      // Emit recovery failure event
      this.emit('recovery:failure', {
        service: serviceName,
        attemptNumber,
        id: recoveryId,
        error: error.message,
        nextAttempt: serviceData.nextRecoveryAttempt
      });
      
      return false;
    }
  }
  
  /**
   * Default recovery procedure for services
   * Attempts to restart the service by notifying the service registry
   * 
   * @param {string} serviceName - Name of the service
   * @param {number} attemptNumber - Recovery attempt number
   * @returns {Promise<object>} - Result of the recovery attempt
   */
  async defaultRecoveryProcedure(serviceName, attemptNumber) {
    const service = this.serviceRegistry.getService(serviceName);
    if (!service) {
      throw new Error(`Service "${serviceName}" not found in registry during recovery`);
    }
    
    // If the service has a restart method, use it
    if (service.restart && typeof service.restart === 'function') {
      const result = await service.restart();
      return { method: 'restart', result };
    }
    
    // Try to use custom service initialize method if available
    if (service.initialize && typeof service.initialize === 'function') {
      const result = await service.initialize();
      return { method: 'initialize', result };
    }
    
    // If memory issue is suspected, suggest garbage collection
    if (global.gc && typeof global.gc === 'function') {
      try {
        global.gc();
        logger.info(`Forced garbage collection during recovery of "${serviceName}"`);
        return { method: 'gc', memoryBefore: process.memoryUsage() };
      } catch (error) {
        logger.warn(`Failed to run garbage collection: ${error.message}`);
      }
    }
    
    // Cannot restart/reinitialize this service
    throw new Error(`No recovery method found for service "${serviceName}"`);
  }
  
  /**
   * Manually trigger recovery for a service
   * @param {string} serviceName - Name of the service
   * @param {string} reason - Reason for manual recovery
   * @returns {Promise<boolean>} - Success of recovery attempt
   */
  async triggerRecovery(serviceName, reason = 'Manually triggered') {
    const serviceData = this.serviceHealth[serviceName];
    
    if (!serviceData) {
      logger.warn(`Cannot trigger recovery for unregistered service: ${serviceName}`);
      return false;
    }
    
    // Reset recovery backoff to allow immediate attempt
    serviceData.nextRecoveryAttempt = null;
    
    return this.attemptServiceRecovery(serviceName, reason);
  }
  
  /**
   * Get health status of all monitored services
   * @returns {Object} - Status information for all services
   */
  getStatus() {
    const result = {
      monitoring: this.isMonitoring,
      enabled: this.enabled,
      lastCheck: this.lastCheckTime,
      checkInterval: this.checkInterval,
      services: {},
      summary: {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        recovering: 0,
        critical: 0
      }
    };
    
    // Compile service status
    for (const [name, health] of Object.entries(this.serviceHealth)) {
      result.services[name] = {
        name,
        status: health.status,
        critical: health.options.isCritical,
        failures: health.consecutiveFailures,
        recovery: {
          attempts: health.recoveryAttempts,
          lastRecovery: health.lastRecovery,
          nextAttempt: health.nextRecoveryAttempt,
          backoffTime: health.recoveryBackoffTime
        },
        lastCheck: health.lastCheck
      };
      
      // Update summary counts
      result.summary.total++;
      
      if (health.status === 'healthy') {
        result.summary.healthy++;
      } else if (health.status === 'unhealthy') {
        result.summary.unhealthy++;
      }
      
      if (health.status === 'recovering') {
        result.summary.recovering++;
      }
      
      if (health.options.isCritical) {
        result.summary.critical++;
      }
    }
    
    return result;
  }
  
  /**
   * Get recovery history and statistics
   * @returns {Object} - Recovery statistics and history
   */
  getRecoveryStats() {
    const stats = {
      overall: {
        totalAttempts: 0,
        successful: 0,
        failed: 0,
        successRate: 0
      },
      services: {}
    };
    
    // Aggregate the recovery statistics
    for (const [name, history] of Object.entries(this.recoveryHistory)) {
      stats.overall.totalAttempts += history.totalAttempts;
      stats.overall.successful += history.successfulRecoveries;
      stats.overall.failed += history.failedRecoveries;
      
      stats.services[name] = {
        attempts: history.totalAttempts,
        successful: history.successfulRecoveries,
        failed: history.failedRecoveries,
        successRate: history.totalAttempts > 0 
          ? Math.round((history.successfulRecoveries / history.totalAttempts) * 100) 
          : 0,
        lastAttempt: history.lastAttemptTime,
        lastResult: history.lastAttemptResult,
        recentHistory: history.details.slice(0, 5).map(record => ({
          id: record.id,
          time: new Date(record.time).toISOString(),
          successful: record.successful,
          reason: record.reason,
          duration: record.duration
        }))
      };
    }
    
    // Calculate overall success rate
    if (stats.overall.totalAttempts > 0) {
      stats.overall.successRate = Math.round(
        (stats.overall.successful / stats.overall.totalAttempts) * 100
      );
    }
    
    return stats;
  }
}

// Create and export singleton instance
const serviceWatchdog = new ServiceWatchdog(require('./ServiceRegistry'), {
  // Default to disabled until explicitly started
  enabled: false,
  // Longer startup delay to ensure all services have time to initialize
  startupDelay: 180000,
  // Default settings for monitoring
  checkInterval: 60000,
  maxConsecutiveFailures: 3,
  recoveryAttemptLimit: 5,
  recoveryBackoffFactor: 2
});

module.exports = serviceWatchdog;

// Also export the class for creating custom instances
module.exports.ServiceWatchdog = ServiceWatchdog;