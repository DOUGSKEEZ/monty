// ShadeCommander Background Health Monitoring Service
// Continuously monitors ShadeCommander health and sends metrics to all monitoring platforms

const multiVendorMetrics = require('./MultiVendorMetricsService');
const notificationService = require('./NotificationService');
const logger = require('../utils/logger').getModuleLogger('shadecommander-monitor');

class ShadeCommanderMonitorService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.checkInterval = 30000; // 30 seconds
    this.timeout = 5000; // 5 second timeout
    this.consecutiveFailures = 0;
    this.lastHealthyTime = null;
    this.lastNotificationTime = null;
    this.lastKnownStatus = null; // Track status changes
    this.healthHistory = [];
    this.maxHistorySize = 100; // Keep last 100 checks
  }

  start() {
    if (this.isRunning) {
      logger.warn('ShadeCommander monitor already running');
      return;
    }

    logger.info(`Starting ShadeCommander background monitor (every ${this.checkInterval/1000}s)`);
    this.isRunning = true;
    
    // Do an immediate check
    this.performHealthCheck();
    
    // Set up recurring checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping ShadeCommander background monitor');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async performHealthCheck() {
    const startTime = Date.now();
    const checkTimestamp = new Date().toISOString();
    
    try {
      const response = await fetch('http://192.168.0.15:8000/health', {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout)
      });
      
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const healthData = await response.json();
      
      // Deep health analysis
      const isFullyHealthy = healthData.status === 'healthy' && 
                            healthData.arduino_connected === true && 
                            healthData.database_accessible === true;
      
      const healthResult = {
        timestamp: checkTimestamp,
        status: isFullyHealthy ? 'healthy' : 'degraded',
        responseTime: responseTime,
        details: {
          fastapi_responding: true,
          arduino_connected: healthData.arduino_connected,
          database_accessible: healthData.database_accessible,
          last_command_time: healthData.last_command_time,
          uptime_seconds: healthData.uptime_seconds,
          overall_status: healthData.status
        }
      };
      
      await this.recordHealthyCheck(healthResult);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      const healthResult = {
        timestamp: checkTimestamp,
        status: 'down',
        responseTime: responseTime >= this.timeout ? this.timeout : responseTime,
        error: error.message,
        errorType: error.name === 'TimeoutError' ? 'TIMEOUT' : (error.cause?.code || 'CONNECTION_ERROR'),
        details: {
          fastapi_responding: false,
          arduino_connected: null,
          database_accessible: null,
          last_command_time: null,
          uptime_seconds: null,
          overall_status: 'unreachable'
        }
      };
      
      await this.recordFailedCheck(healthResult);
    }
  }

  async recordHealthyCheck(healthResult) {
    this.consecutiveFailures = 0;
    this.lastHealthyTime = new Date();
    this.addToHistory(healthResult);
    
    const isFullyHealthy = healthResult.status === 'healthy';
    
    // Send metrics to all monitoring platforms
    try {
      await multiVendorMetrics.sendMetric('shadecommander_availability', isFullyHealthy ? 1 : 0.5, 'gauge', {
        status: healthResult.status,
        arduino_connected: healthResult.details.arduino_connected,
        database_accessible: healthResult.details.database_accessible,
        check_type: 'background'
      });
      
      await multiVendorMetrics.sendMetric('shadecommander_response_time', healthResult.responseTime, 'histogram', {
        endpoint: 'health',
        check_type: 'background'
      });
      
      // Individual component metrics
      await multiVendorMetrics.sendMetric('shadecommander_arduino_status', 
        healthResult.details.arduino_connected ? 1 : 0, 'gauge', { check_type: 'background' });
      await multiVendorMetrics.sendMetric('shadecommander_database_status', 
        healthResult.details.database_accessible ? 1 : 0, 'gauge', { check_type: 'background' });
      
      // Uptime metric if available
      if (healthResult.details.uptime_seconds) {
        await multiVendorMetrics.sendMetric('shadecommander_uptime_seconds', 
          healthResult.details.uptime_seconds, 'gauge', { check_type: 'background' });
      }
      
      if (!isFullyHealthy) {
        logger.warn('ShadeCommander degraded:', healthResult.details);
        await multiVendorMetrics.sendEvent(
          'ShadeCommander Degraded (Background Check)',
          `Background monitor detected degraded state - Arduino: ${healthResult.details.arduino_connected}, DB: ${healthResult.details.database_accessible}`,
          { 
            arduino_connected: healthResult.details.arduino_connected,
            database_accessible: healthResult.details.database_accessible,
            status: healthResult.details.overall_status,
            check_type: 'background'
          },
          'warning'
        );
        
        // Send notification on status change
        if (this.lastKnownStatus !== 'degraded') {
          await notificationService.sendShadeCommanderDegraded(healthResult.details, {
            response_time: healthResult.responseTime,
            consecutive_failures: this.consecutiveFailures
          });
          this.lastNotificationTime = new Date();
        }
      } else if (this.lastKnownStatus && this.lastKnownStatus !== 'healthy') {
        // Service recovered!
        await notificationService.sendShadeCommanderRecovered({
          downtime_seconds: this.lastHealthyTime ? (new Date() - this.lastHealthyTime) / 1000 : null,
          response_time: healthResult.responseTime
        });
        this.lastNotificationTime = new Date();
      }
      
      this.lastKnownStatus = isFullyHealthy ? 'healthy' : 'degraded';
      
    } catch (error) {
      logger.error('Error sending healthy check metrics:', error);
    }
  }

  async recordFailedCheck(healthResult) {
    this.consecutiveFailures++;
    this.addToHistory(healthResult);
    
    logger.warn(`ShadeCommander health check failed (${this.consecutiveFailures} consecutive):`, healthResult.error);
    
    try {
      // Send failure metrics
      await multiVendorMetrics.sendMetric('shadecommander_availability', 0, 'gauge', {
        status: 'down',
        error_type: healthResult.errorType,
        consecutive_failures: this.consecutiveFailures,
        check_type: 'background'
      });
      
      await multiVendorMetrics.sendMetric('shadecommander_arduino_status', 0, 'gauge', { check_type: 'background' });
      await multiVendorMetrics.sendMetric('shadecommander_database_status', 0, 'gauge', { check_type: 'background' });
      
      await multiVendorMetrics.sendMetric('shadecommander_consecutive_failures', this.consecutiveFailures, 'gauge', {
        error_type: healthResult.errorType,
        check_type: 'background'
      });
      
      // Send events based on failure patterns
      if (this.consecutiveFailures === 1) {
        // First failure
        await multiVendorMetrics.sendEvent(
          'ShadeCommander Down (Background Check)',
          `Background monitor detected failure: ${healthResult.error}`,
          { 
            error_type: healthResult.errorType, 
            response_time: healthResult.responseTime,
            consecutive_failures: this.consecutiveFailures,
            check_type: 'background'
          },
          'error'
        );
        
        // Send notification on first failure
        if (this.lastKnownStatus !== 'down') {
          await notificationService.sendShadeCommanderDown(healthResult.error, {
            error_type: healthResult.errorType,
            response_time: healthResult.responseTime,
            consecutive_failures: this.consecutiveFailures
          });
          this.lastNotificationTime = new Date();
        }
        
      } else if (this.consecutiveFailures % 5 === 0) {
        // Every 5th consecutive failure (escalating alert)
        const outageDuration = this.consecutiveFailures * this.checkInterval / 1000;
        await multiVendorMetrics.sendEvent(
          'ShadeCommander Extended Outage',
          `ShadeCommander has been down for ${this.consecutiveFailures} consecutive checks (${outageDuration}s)`,
          { 
            error_type: healthResult.errorType,
            consecutive_failures: this.consecutiveFailures,
            outage_duration_seconds: outageDuration,
            check_type: 'background'
          },
          'critical'
        );
        
        // Send escalating notification
        await notificationService.sendAlert(
          'ShadeCommander Extended Outage',
          `ShadeCommander has been down for ${Math.round(outageDuration / 60)} minutes (${this.consecutiveFailures} consecutive failures)`,
          'critical',
          {
            error_type: healthResult.errorType,
            consecutive_failures: this.consecutiveFailures,
            outage_duration_minutes: Math.round(outageDuration / 60),
            service: 'ShadeCommander'
          }
        );
        this.lastNotificationTime = new Date();
      }
      
      this.lastKnownStatus = 'down';
      
    } catch (error) {
      logger.error('Error sending failed check metrics:', error);
    }
  }

  addToHistory(healthResult) {
    this.healthHistory.push(healthResult);
    
    // Keep only the most recent checks
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
    }
  }

  getHealthStats() {
    if (this.healthHistory.length === 0) {
      return { message: 'No health checks performed yet' };
    }

    const recentChecks = this.healthHistory.slice(-20); // Last 20 checks
    const upCount = recentChecks.filter(check => check.status === 'healthy').length;
    const degradedCount = recentChecks.filter(check => check.status === 'degraded').length;
    const downCount = recentChecks.filter(check => check.status === 'down').length;
    
    const avgResponseTime = recentChecks
      .filter(check => check.responseTime)
      .reduce((sum, check, _, arr) => sum + check.responseTime / arr.length, 0);

    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      consecutiveFailures: this.consecutiveFailures,
      lastHealthyTime: this.lastHealthyTime,
      totalChecks: this.healthHistory.length,
      recentStats: {
        totalChecks: recentChecks.length,
        healthy: upCount,
        degraded: degradedCount,
        down: downCount,
        healthyPercentage: Math.round((upCount / recentChecks.length) * 100),
        avgResponseTime: Math.round(avgResponseTime)
      },
      latestCheck: this.healthHistory[this.healthHistory.length - 1]
    };
  }
}

// Export singleton instance
const shadeCommanderMonitor = new ShadeCommanderMonitorService();
module.exports = shadeCommanderMonitor;