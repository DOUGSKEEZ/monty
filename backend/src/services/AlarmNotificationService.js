/**
 * AlarmNotificationService - Pushes alarm schedule updates to monty-alarm device
 * 
 * This service sends immediate notifications to the bedside alarm device
 * when wake-up schedules are set, cleared, or modified, eliminating the
 * need for constant polling from the alarm device.
 */

const axios = require('axios');
const logger = require('../utils/logger').getModuleLogger('alarm-notification');

class AlarmNotificationService {
  constructor(configManager, retryHelper, serviceRegistry, serviceWatchdog) {
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;
    
    // Configuration
    this.alarmDeviceUrl = this.configManager.get('alarm.notifications.deviceUrl', 'http://192.168.0.198:5000');
    this.enabled = this.configManager.get('alarm.notifications.enabled', true);
    this.timeout = this.configManager.get('alarm.notifications.timeout', 5000);
    this.maxRetries = this.configManager.get('alarm.notifications.maxRetries', 3);
    
    // State
    this.lastNotificationResult = null;
    this.isInitialized = false;
    
    // Register with ServiceRegistry
    this.serviceRegistry.register('AlarmNotificationService', {
      instance: this,
      isCore: false,
      checkHealth: this.healthCheck.bind(this),
    });

    // Register with ServiceWatchdog
    this.serviceWatchdog.registerService('AlarmNotificationService', {
      isCritical: false,
      monitorMemory: false,
      recoveryProcedure: this.recoveryProcedure.bind(this),
    });

    // Mark service as ready
    this.serviceRegistry.setStatus('AlarmNotificationService', 'ready');
    this.isInitialized = true;
    
    logger.info(`AlarmNotificationService initialized - Device: ${this.alarmDeviceUrl}, Enabled: ${this.enabled}`);
  }

  /**
   * Notify alarm device of current wake-up schedule
   * @param {Object} scheduleData - Current alarm schedule information
   */
  async notifyScheduleUpdate(scheduleData) {
    if (!this.enabled) {
      logger.debug('Alarm notifications disabled, skipping update');
      return { success: true, message: 'Notifications disabled' };
    }

    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Sending alarm schedule update to monty-alarm device', { 
            action: scheduleData.action,
            hasAlarm: scheduleData.schedule.hasAlarm 
          });
          
          const payload = {
            timestamp: new Date().toISOString(),
            action: scheduleData.action,
            schedule: scheduleData.schedule
          };

          const response = await axios.post(
            `${this.alarmDeviceUrl}/api/schedule/update`,
            payload,
            {
              timeout: this.timeout,
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'monty-scheduler/1.0'
              }
            }
          );

          if (response.status === 200) {
            logger.info('Alarm device notified successfully');
            this.lastNotificationResult = {
              success: true,
              timestamp: new Date(),
              message: 'Alarm device updated'
            };
            return {
              success: true,
              message: 'Alarm device updated',
              deviceResponse: response.data
            };
          } else {
            throw new Error(`Unexpected response: ${response.status}`);
          }

        } catch (error) {
          if (error.code === 'ECONNREFUSED') {
            logger.warn('Alarm device unreachable (sleeping/offline?)');
            this.lastNotificationResult = {
              success: false,
              timestamp: new Date(),
              error: 'DEVICE_OFFLINE'
            };
            return {
              success: false,
              message: 'Alarm device unreachable',
              error: 'DEVICE_OFFLINE'
            };
          } else if (error.code === 'ETIMEDOUT') {
            logger.warn('Alarm device timeout');
            this.lastNotificationResult = {
              success: false,
              timestamp: new Date(),
              error: 'TIMEOUT'
            };
            return {
              success: false,
              message: 'Alarm device timeout',
              error: 'TIMEOUT'
            };
          } else {
            logger.error(`Error notifying alarm device: ${error.message}`);
            throw error; // Let retry helper handle it
          }
        }
      },
      {
        operationName: 'alarm-device-notification',
        isCritical: false, // Don't fail scheduler if alarm device is down
        maxRetries: this.maxRetries,
        initialDelay: 1000,
        backoffFactor: 2,
        onRetry: (attempt, delay, error) => {
          logger.info(`Retrying alarm notification (attempt ${attempt}) in ${delay}ms`);
        }
      }
    );
  }

  /**
   * Notify alarm device that all schedules have been cleared
   */
  async notifyScheduleCleared() {
    const scheduleData = {
      action: 'schedule_cleared',
      schedule: {
        hasAlarm: false,
        wakeUpTime: null,
        nextAlarm: null,
        clearedAt: new Date().toISOString()
      }
    };

    return this.notifyScheduleUpdate(scheduleData);
  }

  /**
   * Notify alarm device of new wake-up time
   * @param {string} time - Wake-up time in HH:MM format
   * @param {Date} nextAlarmDate - Full date/time of next alarm
   */
  async notifyWakeUpScheduled(time, nextAlarmDate) {
    const scheduleData = {
      action: 'schedule_set',
      schedule: {
        hasAlarm: true,
        wakeUpTime: time,
        nextAlarm: nextAlarmDate.toISOString(),
        scheduledAt: new Date().toISOString(),
        daysUntilAlarm: Math.ceil((nextAlarmDate - new Date()) / (1000 * 60 * 60 * 24))
      }
    };

    return this.notifyScheduleUpdate(scheduleData);
  }

  /**
   * Send health check to alarm device
   */
  async pingAlarmDevice() {
    if (!this.enabled) {
      return { success: false, message: 'Notifications disabled' };
    }

    try {
      const response = await axios.get(
        `${this.alarmDeviceUrl}/api/health`,
        { timeout: 3000 }
      );

      return {
        success: true,
        message: 'Alarm device responsive',
        deviceInfo: response.data
      };
    } catch (error) {
      return {
        success: false,
        message: `Alarm device unreachable: ${error.message}`,
        error: error.code
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      enabled: this.enabled,
      deviceUrl: this.alarmDeviceUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    if (newConfig.enabled !== undefined) {
      this.enabled = newConfig.enabled;
      this.configManager.set('alarm.notifications.enabled', this.enabled);
    }
    
    if (newConfig.deviceUrl) {
      this.alarmDeviceUrl = newConfig.deviceUrl;
      this.configManager.set('alarm.notifications.deviceUrl', this.alarmDeviceUrl);
    }

    if (newConfig.timeout !== undefined) {
      this.timeout = newConfig.timeout;
      this.configManager.set('alarm.notifications.timeout', this.timeout);
    }

    if (newConfig.maxRetries !== undefined) {
      this.maxRetries = newConfig.maxRetries;
      this.configManager.set('alarm.notifications.maxRetries', this.maxRetries);
    }

    logger.info('Alarm notification configuration updated', this.getConfig());
  }

  /**
   * Health check for ServiceRegistry
   */
  async healthCheck() {
    const uptime = process.uptime();
    const status = this.isInitialized ? 'ok' : 'initializing';
    
    // Perform a quick ping if enabled
    let deviceStatus = null;
    if (this.enabled) {
      deviceStatus = await this.pingAlarmDevice();
    }
    
    return {
      status,
      message: this.enabled ? 
        `Alarm notifications active - Device: ${this.alarmDeviceUrl}` : 
        'Alarm notifications disabled',
      uptime: Math.floor(uptime),
      metrics: {
        enabled: this.enabled,
        deviceUrl: this.alarmDeviceUrl,
        deviceReachable: deviceStatus?.success || false,
        lastNotification: this.lastNotificationResult,
        config: this.getConfig()
      }
    };
  }

  /**
   * Recovery procedure for ServiceWatchdog
   */
  async recoveryProcedure() {
    try {
      logger.warn('AlarmNotificationService recovery procedure initiated');
      
      // Re-read configuration
      this.alarmDeviceUrl = this.configManager.get('alarm.notifications.deviceUrl', 'http://192.168.0.198:5000');
      this.enabled = this.configManager.get('alarm.notifications.enabled', true);
      this.timeout = this.configManager.get('alarm.notifications.timeout', 5000);
      this.maxRetries = this.configManager.get('alarm.notifications.maxRetries', 3);
      
      // Test connectivity if enabled
      if (this.enabled) {
        const pingResult = await this.pingAlarmDevice();
        if (!pingResult.success) {
          logger.warn(`Alarm device unreachable during recovery: ${pingResult.message}`);
        }
      }
      
      this.isInitialized = true;
      logger.info('AlarmNotificationService recovery completed');
      return true;
    } catch (error) {
      logger.error(`AlarmNotificationService recovery failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Cleanup method for service shutdown
   */
  cleanup() {
    try {
      logger.info('AlarmNotificationService cleanup initiated');
      this.isInitialized = false;
      logger.info('AlarmNotificationService cleanup completed');
    } catch (error) {
      logger.error(`AlarmNotificationService cleanup failed: ${error.message}`);
    }
  }
}

module.exports = AlarmNotificationService;