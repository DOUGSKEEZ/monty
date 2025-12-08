const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger').getModuleLogger('scheduler-routes');

// Import services and utilities
const { container } = require('../utils/ServiceFactory');
const retryHelper = require('../utils/RetryHelper'); // Import singleton instance
const CircuitBreaker = require('../utils/CircuitBreaker');
const { getTimezoneManager } = require('../utils/TimezoneManager');

// Create circuit breaker for scheduler operations
const schedulerCircuit = new CircuitBreaker({
  name: 'scheduler-service',
  failureThreshold: 3,
  resetTimeout: 30000,
  fallbackFunction: async (params) => {
    logger.warn(`Scheduler circuit breaker open, using fallback`);
    return {
      success: false,
      error: 'Scheduler service temporarily unavailable',
      fallback: true
    };
  }
});

/**
 * Helper function to get scheduler service with dependency injection
 * Uses circuit breaker and retry logic for resilience
 */
const getSchedulerService = async () => {
  return await retryHelper.retryOperation(async () => {
    // Try container resolution first (modern DI pattern)
    let schedulerService = container.resolve('schedulerService');
    
    // Fallback to factory method if container resolution fails
    if (!schedulerService) {
      const { createSchedulerService } = require('../utils/ServiceFactory');
      schedulerService = createSchedulerService();
    }
    
    if (!schedulerService) {
      throw new Error('SchedulerService not available');
    }
    
    return schedulerService;
  }, {
    operationName: 'get-scheduler-service',
    isCritical: true,
    shouldRetry: (error) => {
      // Retry for temporary failures, not for permanent configuration issues
      return !error.message.includes('not found') && !error.message.includes('invalid');
    }
  });
};

/**
 * Get scheduler status and next scene times
 */
router.get('/status', async (req, res) => {
  try {
    const result = await schedulerCircuit.execute(async () => {
      const schedulerService = await getSchedulerService();
      return await schedulerService.healthCheck();
    }, 'health-check');
    
    if (result.fallback) {
      return res.status(503).json(result);
    }
    
    const health = result;
    
    res.json({
      success: true,
      data: {
        status: health.status,
        message: health.message,
        metrics: health.metrics,
        nextSceneTimes: health.metrics.nextSceneTimes,
        wakeUpEnabled: health.metrics.wakeUpEnabled,
        nextWakeUpTime: health.metrics.nextWakeUpTime,
        lastWakeUpTriggered: health.metrics.lastWakeUpTriggered,
        homeAwayStatus: health.metrics.homeAwayStatus
      }
    });
  } catch (error) {
    logger.error(`Error getting scheduler status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status'
    });
  }
});

/**
 * Set wake up time and reschedule
 */
router.post('/wake-up', async (req, res) => {
  try {
    const { time } = req.body;
    
    // Validate time format
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        success: false,
        error: 'Valid time required in 24-hour format (HH:MM)'
      });
    }
    
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    // Update scheduler configuration
    schedulerService.schedulerConfig.wake_up.enabled = true;
    schedulerService.schedulerConfig.wake_up.time = time;
    schedulerService.schedulerConfig.wake_up.last_triggered = null;
    
    // Save configuration to file
    schedulerService.saveSchedulerConfig();
    
    // Clear existing wake up schedules and reschedule
    schedulerService.clearWakeUpSchedules();
    schedulerService.scheduleWakeUp();
    
    logger.info(`Wake up alarm set to ${time} and rescheduled`);
    
    res.json({
      success: true,
      message: `Wake up alarm set to ${time}`,
      data: {
        time: time,
        enabled: true,
        nextWakeUpTime: schedulerService.getNextWakeUpTime()
      }
    });
    
  } catch (error) {
    logger.error(`Error setting wake up time: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to set wake up time'
    });
  }
});

/**
 * Disable wake up alarm
 */
router.delete('/wake-up', async (req, res) => {
  try {
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    // Disable wake up alarm
    schedulerService.schedulerConfig.wake_up.enabled = false;
    
    // Save configuration
    schedulerService.saveSchedulerConfig();
    
    // Clear wake up schedules
    schedulerService.clearWakeUpSchedules();
    
    logger.info('Wake up alarm disabled');
    
    res.json({
      success: true,
      message: 'Wake up alarm disabled',
      data: {
        enabled: false,
        nextWakeUpTime: null
      }
    });
    
  } catch (error) {
    logger.error(`Error disabling wake up alarm: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to disable wake up alarm'
    });
  }
});

/**
 * Get wake up alarm status
 */
router.get('/wake-up/status', async (req, res) => {
  try {
    const { createSchedulerService } = require('../utils/ServiceFactory');
    const schedulerService = createSchedulerService();
    
    const wakeUpConfig = schedulerService.getWakeUpConfig();
    const currentTime = new Date();
    const timezoneManager = getTimezoneManager();
    const currentTime_formatted = timezoneManager.formatForDisplay(currentTime, 'datetime');
    const currentDate_formatted = timezoneManager.formatForDisplay(currentTime, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    let nextWakeUpDateTime = null;
    if (wakeUpConfig.enabled && wakeUpConfig.time) {
      // Get wake up time components
      const [hours, minutes] = wakeUpConfig.time.split(':').map(Number);
      
      // Get current time in user timezone
      const now = new Date();
      const nowUserTime = timezoneManager.toUserTime(now);
      const currentHour = nowUserTime.getHours();
      const currentMinute = nowUserTime.getMinutes();
      
      // Determine if wake up is today or tomorrow
      const wakeUpMinutesFromMidnight = hours * 60 + minutes;
      const currentMinutesFromMidnight = currentHour * 60 + currentMinute;
      
      // Create target date (today or tomorrow)
      const targetDate = new Date();
      if (wakeUpMinutesFromMidnight <= currentMinutesFromMidnight) {
        // Wake up time has passed today - use tomorrow
        targetDate.setDate(targetDate.getDate() + 1);
      }
      
      // Format as display string with the wake up time (don't set hours on targetDate)
      const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const minuteStr = minutes.toString().padStart(2, '0');
      
      const dateStr = targetDate.toLocaleDateString('en-US', {
        timeZone: timezoneManager.getCronTimezone(),
        weekday: 'short',
        month: 'short', 
        day: 'numeric'
      });
      
      nextWakeUpDateTime = `${dateStr}, ${hour12}:${minuteStr} ${ampm}`;
    }
    
    res.json({
      success: true,
      data: {
        enabled: wakeUpConfig.enabled,
        time: wakeUpConfig.time,
        nextWakeUpTime: schedulerService.getNextWakeUpTime(),
        nextWakeUpDateTime: nextWakeUpDateTime,
        lastTriggered: wakeUpConfig.last_triggered,
        lastTriggered_formatted: wakeUpConfig.last_triggered ? 
          timezoneManager.formatForDisplay(wakeUpConfig.last_triggered, 'datetime') : null,
        goodMorningDelayMinutes: wakeUpConfig.good_morning_delay_minutes || 15,
        currentTime: currentTime_formatted,
        currentDate: currentDate_formatted,
        timezone: timezoneManager.getTimezoneDisplay()
      }
    });
    
  } catch (error) {
    logger.error(`Error getting wake up status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get wake up status'
    });
  }
});

/**
 * Force SchedulerService initialization and scheduling
 */
router.post('/initialize', async (req, res) => {
  try {
    const { createSchedulerService } = require('../utils/ServiceFactory');
    const schedulerService = createSchedulerService();
    
    logger.info('Manual SchedulerService initialization requested');
    
    if (!schedulerService.isInitialized) {
      await schedulerService.initialize();
      logger.info('SchedulerService initialization completed via API');
    } else {
      logger.info('SchedulerService already initialized, rescheduling wake up');
      // Even if initialized, reschedule wake up alarm
      if (schedulerService.getWakeUpConfig().enabled) {
        schedulerService.clearWakeUpSchedules();
        schedulerService.scheduleWakeUp();
      }
    }
    
    res.json({
      success: true,
      message: 'SchedulerService initialized successfully',
      data: {
        isInitialized: schedulerService.isInitialized,
        scheduledJobs: schedulerService.scheduledJobs.size,
        wakeUpEnabled: schedulerService.isWakeUpEnabled(),
        nextWakeUpTime: schedulerService.getNextWakeUpTime()
      }
    });
    
  } catch (error) {
    logger.error(`Error initializing SchedulerService: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize SchedulerService'
    });
  }
});

/**
 * Manually trigger a scene
 */
router.post('/trigger', async (req, res) => {
  try {
    const { scene_name } = req.body;
    
    if (!scene_name) {
      return res.status(400).json({
        success: false,
        error: 'Scene name is required'
      });
    }
    
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    // Execute the scene
    const result = await schedulerService.executeScene(scene_name);
    
    if (result.success) {
      logger.info(`Manually triggered scene: ${scene_name}`);
      res.json({
        success: true,
        message: `Scene '${scene_name}' executed successfully`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || `Failed to execute scene '${scene_name}'`
      });
    }
    
  } catch (error) {
    logger.error(`Error triggering scene: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger scene'
    });
  }
});

/**
 * Get active schedules
 */
router.get('/schedules', async (req, res) => {
  try {
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    const schedules = {};
    
    // Get scheduled job names and next scene times
    for (const [jobName, job] of schedulerService.scheduledJobs) {
      schedules[jobName] = {
        name: jobName,
        active: true,
        nextRunAt: 'Scheduled' // node-cron doesn't easily expose next run time
      };
    }
    
    // Add next scene times from metrics
    const health = await schedulerService.healthCheck();
    const nextSceneTimes = health.metrics.nextSceneTimes || {};
    
    res.json({
      success: true,
      data: {
        scheduledJobs: schedules,
        nextSceneTimes: nextSceneTimes,
        wakeUpEnabled: health.metrics.wakeUpEnabled,
        nextWakeUpTime: health.metrics.nextWakeUpTime,
        homeAwayStatus: health.metrics.homeAwayStatus
      }
    });
    
  } catch (error) {
    logger.error(`Error getting schedules: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedules'
    });
  }
});

/**
 * Get complete scheduler configuration
 */
router.get('/config', async (req, res) => {
  try {
    const result = await schedulerCircuit.execute(async () => {
      const schedulerService = await getSchedulerService();
      const config = schedulerService.schedulerConfig;
      const health = await schedulerService.healthCheck();
      const skipSolarToday = schedulerService.skipSolarToday || false;
      return { config, health, skipSolarToday };
    }, 'get-config');

    if (result.fallback) {
      return res.status(503).json(result);
    }

    const { config, health, skipSolarToday } = result;

    res.json({
      success: true,
      data: {
        scenes: {
          good_afternoon_time: config.scenes.good_afternoon_time || '14:30',
          good_evening_offset_minutes: Math.abs(config.scenes.good_evening_offset_minutes || 60),
          good_night_offset_minutes: config.scenes.good_night_offset_minutes || 0,
          skip_solar_today: skipSolarToday
        },
        wake_up: {
          enabled: config.wake_up.enabled || false,
          time: config.wake_up.time || '',
          good_morning_delay_minutes: config.wake_up.good_morning_delay_minutes || 15,
          last_triggered: config.wake_up.last_triggered
        },
        music: {
          enabled_for_morning: config.music.enabled_for_morning !== undefined ? config.music.enabled_for_morning : true,
          enabled_for_evening: config.music.enabled_for_evening !== undefined ? config.music.enabled_for_evening : true,
          enabled_for_afternoon: config.music.enabled_for_afternoon !== undefined ? config.music.enabled_for_afternoon : false,
          enabled_for_night: config.music.enabled_for_night !== undefined ? config.music.enabled_for_night : false
        },
        // home_away data moved to main config.json under homeStatus.awayPeriods
        nextSceneTimes: health.metrics.nextSceneTimes,
        serviceHealth: {
          status: health.status,
          message: health.message
        }
      }
    });
  } catch (error) {
    logger.error(`Error getting scheduler config: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduler configuration'
    });
  }
});

/**
 * Update scene timing settings
 */
router.put('/scenes', async (req, res) => {
  try {
    const { good_afternoon_time, good_evening_offset_minutes, good_night_offset_minutes } = req.body;
    
    const result = await schedulerCircuit.execute(async () => {
      const schedulerService = await getSchedulerService();
      
      // Validation
      if (good_afternoon_time && !/^\d{2}:\d{2}$/.test(good_afternoon_time)) {
        throw new Error('Good afternoon time must be in 24-hour format (HH:MM)');
      }
      
      if (good_evening_offset_minutes !== undefined && (good_evening_offset_minutes < 0 || good_evening_offset_minutes > 180)) {
        throw new Error('Good evening offset must be between 0 and 180 minutes');
      }
      
      if (good_night_offset_minutes !== undefined && (good_night_offset_minutes < -120 || good_night_offset_minutes > 60)) {
        throw new Error('Good night offset must be between -120 and 60 minutes');
      }
      
      // Updates with retry logic
      return await retryHelper.retryOperation(async () => {
        // Update configuration
        if (good_afternoon_time) {
          schedulerService.schedulerConfig.scenes.good_afternoon_time = good_afternoon_time;
        }
        if (good_evening_offset_minutes !== undefined) {
          // Store as negative value to match existing pattern
          schedulerService.schedulerConfig.scenes.good_evening_offset_minutes = -Math.abs(good_evening_offset_minutes);
        }
        if (good_night_offset_minutes !== undefined) {
          schedulerService.schedulerConfig.scenes.good_night_offset_minutes = good_night_offset_minutes;
        }
        
        // Save configuration
        schedulerService.saveSchedulerConfig();
        
        // Reschedule all scenes to ensure updates take effect (may fail, but configuration is saved)
        try {
          if (good_afternoon_time || good_evening_offset_minutes !== undefined || good_night_offset_minutes !== undefined) {
            logger.info('Rescheduling all scenes due to configuration changes');
            await schedulerService.scheduleAllScenes();
          }
        } catch (scheduleError) {
          logger.warn('Scene rescheduling failed but configuration was saved:', scheduleError.message);
        }
        
        return {
          good_afternoon_time: schedulerService.schedulerConfig.scenes.good_afternoon_time,
          good_evening_offset_minutes: Math.abs(schedulerService.schedulerConfig.scenes.good_evening_offset_minutes || 60),
          good_night_offset_minutes: schedulerService.schedulerConfig.scenes.good_night_offset_minutes || 0
        };
      }, {
        operationName: 'update-scene-settings',
        isCritical: false,
        shouldRetry: (error) => !error.message.includes('validation')
      });
    }, 'update-scenes');
    
    if (result.fallback) {
      return res.status(503).json(result);
    }
    
    logger.info('Scene timing settings updated successfully');
    
    res.json({
      success: true,
      message: 'Scene timing settings updated successfully',
      data: result
    });
    
  } catch (error) {
    logger.error(`Error updating scene settings: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update scene settings'
    });
  }
});

/**
 * Update wake up settings (including good morning delay)
 */
router.put('/wake-up', async (req, res) => {
  try {
    const { time, good_morning_delay_minutes } = req.body;
    
    const { createSchedulerService } = require('../utils/ServiceFactory');
    const schedulerService = createSchedulerService();
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    // Validate time format if provided
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        success: false,
        error: 'Time must be in 24-hour format (HH:MM)'
      });
    }
    
    // Validate delay if provided
    if (good_morning_delay_minutes !== undefined && (good_morning_delay_minutes < 5 || good_morning_delay_minutes > 60)) {
      return res.status(400).json({
        success: false,
        error: 'Good morning delay must be between 5 and 60 minutes'
      });
    }
    
    // Update configuration
    if (time) {
      schedulerService.schedulerConfig.wake_up.enabled = true;
      schedulerService.schedulerConfig.wake_up.time = time;
      schedulerService.schedulerConfig.wake_up.last_triggered = null;
    }
    if (good_morning_delay_minutes !== undefined) {
      schedulerService.schedulerConfig.wake_up.good_morning_delay_minutes = good_morning_delay_minutes;
    }
    
    // Save configuration
    schedulerService.saveSchedulerConfig();
    
    // Reschedule wake up if time was changed
    if (time) {
      schedulerService.clearWakeUpSchedules();
      schedulerService.scheduleWakeUp();
    }
    
    logger.info('Wake up settings updated and rescheduled');
    
    res.json({
      success: true,
      message: 'Wake up settings updated successfully',
      data: {
        enabled: schedulerService.schedulerConfig.wake_up.enabled,
        time: schedulerService.schedulerConfig.wake_up.time,
        good_morning_delay_minutes: schedulerService.schedulerConfig.wake_up.good_morning_delay_minutes,
        nextWakeUpTime: schedulerService.getNextWakeUpTime()
      }
    });
    
  } catch (error) {
    logger.error(`Error updating wake up settings: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update wake up settings'
    });
  }
});

/**
 * Update music integration settings
 */
router.put('/music', async (req, res) => {
  try {
    const { enabled_for_morning, enabled_for_evening, enabled_for_afternoon, enabled_for_night } = req.body;
    
    const { createSchedulerService } = require('../utils/ServiceFactory');
    const schedulerService = createSchedulerService();
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    // Update configuration
    if (enabled_for_morning !== undefined) {
      schedulerService.schedulerConfig.music.enabled_for_morning = Boolean(enabled_for_morning);
    }
    if (enabled_for_evening !== undefined) {
      schedulerService.schedulerConfig.music.enabled_for_evening = Boolean(enabled_for_evening);
    }
    if (enabled_for_afternoon !== undefined) {
      schedulerService.schedulerConfig.music.enabled_for_afternoon = Boolean(enabled_for_afternoon);
    }
    if (enabled_for_night !== undefined) {
      schedulerService.schedulerConfig.music.enabled_for_night = Boolean(enabled_for_night);
    }
    
    // Save configuration
    schedulerService.saveSchedulerConfig();
    
    logger.info('Music integration settings updated');
    
    res.json({
      success: true,
      message: 'Music integration settings updated successfully',
      data: {
        enabled_for_morning: schedulerService.schedulerConfig.music.enabled_for_morning,
        enabled_for_evening: schedulerService.schedulerConfig.music.enabled_for_evening,
        enabled_for_afternoon: schedulerService.schedulerConfig.music.enabled_for_afternoon,
        enabled_for_night: schedulerService.schedulerConfig.music.enabled_for_night
      }
    });
    
  } catch (error) {
    logger.error(`Error updating music settings: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update music settings'
    });
  }
});

/**
 * Toggle skip solar shades for today
 * When enabled, Good Afternoon scene will still trigger (including music)
 * but solar shade commands will be skipped (useful for cloudy/rainy days)
 */
router.put('/skip-solar', async (req, res) => {
  try {
    const { skip_solar_today } = req.body;

    const { createSchedulerService } = require('../utils/ServiceFactory');
    const schedulerService = createSchedulerService();

    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }

    // Update the in-memory flag
    schedulerService.skipSolarToday = Boolean(skip_solar_today);

    logger.info(`Skip solar shades for today: ${schedulerService.skipSolarToday}`);

    res.json({
      success: true,
      message: schedulerService.skipSolarToday
        ? 'Solar shades will be skipped for Good Afternoon today'
        : 'Solar shades will run normally for Good Afternoon today',
      data: {
        skip_solar_today: schedulerService.skipSolarToday
      }
    });

  } catch (error) {
    logger.error(`Error updating skip solar setting: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update skip solar setting'
    });
  }
});

/**
 * Timezone management has been moved to system-level configuration
 * Web applications should not change system timezone for security reasons
 * Use: sudo timedatectl set-timezone <timezone> on the server
 */

/**
 * Test a scene manually (for scene testing)
 */
router.post('/test/:sceneName', async (req, res) => {
  try {
    const { sceneName } = req.params;
    
    const validScenes = ['good_afternoon', 'good_evening', 'good_night', 'rise_n_shine', 'good_morning'];
    if (!validScenes.includes(sceneName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid scene name. Must be one of: ${validScenes.join(', ')}`
      });
    }
    
    const { createSchedulerService } = require('../utils/ServiceFactory');
    const schedulerService = createSchedulerService();
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    // Execute the scene
    const result = await schedulerService.executeScene(sceneName);
    
    logger.info(`Manual scene test executed: ${sceneName}, success: ${result.success}`);
    
    res.json({
      success: result.success,
      message: result.success ? 
        `Scene '${sceneName}' executed successfully` : 
        `Scene '${sceneName}' failed: ${result.message}`,
      data: {
        sceneName: sceneName,
        executed: result.success,
        timestamp: new Date().toISOString(),
        details: result
      }
    });
    
  } catch (error) {
    logger.error(`Error testing scene: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to test scene'
    });
  }
});

/**
 * Get alarm device status and connectivity
 */
router.get('/alarm-device/status', async (req, res) => {
  try {
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    const status = await schedulerService.getAlarmDeviceStatus();
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    logger.error(`Error getting alarm device status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get alarm device status'
    });
  }
});

/**
 * Manually sync current schedule with alarm device
 */
router.post('/alarm-device/sync', async (req, res) => {
  try {
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    const result = await schedulerService.syncWithAlarmDevice();
    
    if (result.success) {
      logger.info('Manual alarm device sync completed successfully');
      res.json({
        success: true,
        message: 'Alarm device synchronized',
        data: result
      });
    } else {
      logger.warn(`Manual alarm device sync failed: ${result.message}`);
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to sync with alarm device',
        details: result
      });
    }
    
  } catch (error) {
    logger.error(`Error syncing with alarm device: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to sync with alarm device'
    });
  }
});

/**
 * Update alarm device notification settings
 */
router.put('/alarm-device/config', async (req, res) => {
  try {
    const { enabled, deviceUrl, timeout, maxRetries } = req.body;
    
    const alarmNotificationService = container.resolve('alarmNotificationService');
    
    if (!alarmNotificationService) {
      return res.status(503).json({
        success: false,
        error: 'AlarmNotificationService not available'
      });
    }
    
    // Validate inputs
    if (deviceUrl && !/^https?:\/\/.+/.test(deviceUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device URL format'
      });
    }
    
    if (timeout !== undefined && (timeout < 1000 || timeout > 30000)) {
      return res.status(400).json({
        success: false,
        error: 'Timeout must be between 1000 and 30000 milliseconds'
      });
    }
    
    if (maxRetries !== undefined && (maxRetries < 0 || maxRetries > 10)) {
      return res.status(400).json({
        success: false,
        error: 'Max retries must be between 0 and 10'
      });
    }
    
    // Update configuration
    const updateConfig = {};
    if (enabled !== undefined) updateConfig.enabled = enabled;
    if (deviceUrl) updateConfig.deviceUrl = deviceUrl;
    if (timeout !== undefined) updateConfig.timeout = timeout;
    if (maxRetries !== undefined) updateConfig.maxRetries = maxRetries;
    
    alarmNotificationService.updateConfig(updateConfig);
    
    logger.info('Alarm device configuration updated', updateConfig);
    
    res.json({
      success: true,
      message: 'Alarm device configuration updated',
      data: alarmNotificationService.getConfig()
    });
    
  } catch (error) {
    logger.error(`Error updating alarm device config: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update alarm device configuration'
    });
  }
});

/**
 * Test alarm device connectivity
 */
router.post('/alarm-device/ping', async (req, res) => {
  try {
    const alarmNotificationService = container.resolve('alarmNotificationService');
    
    if (!alarmNotificationService) {
      return res.status(503).json({
        success: false,
        error: 'AlarmNotificationService not available'
      });
    }
    
    const pingResult = await alarmNotificationService.pingAlarmDevice();
    
    if (pingResult.success) {
      res.json({
        success: true,
        message: 'Alarm device is reachable',
        data: pingResult
      });
    } else {
      res.status(503).json({
        success: false,
        message: pingResult.message,
        error: pingResult.error
      });
    }
    
  } catch (error) {
    logger.error(`Error pinging alarm device: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to ping alarm device'
    });
  }
});

module.exports = router;