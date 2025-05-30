const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger').getModuleLogger('scheduler-routes');

// Import services
const { container } = require('../utils/ServiceFactory');

/**
 * Get scheduler status and next scene times
 */
router.get('/status', async (req, res) => {
  try {
    const schedulerService = container.resolve('schedulerService');
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SchedulerService not available'
      });
    }
    
    const health = await schedulerService.healthCheck();
    
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
    const currentMT = currentTime.toLocaleString('en-US', { timeZone: 'America/Denver' });
    const currentDateMT = currentTime.toLocaleDateString('en-US', { timeZone: 'America/Denver' });
    
    let nextWakeUpDateTime = null;
    if (wakeUpConfig.enabled && wakeUpConfig.time) {
      // Calculate next wake up date/time in Mountain Time
      const [hours, minutes] = wakeUpConfig.time.split(':').map(Number);
      
      // Get current time components in Mountain Time
      const now = new Date();
      const nowMTString = now.toLocaleString("en-US", { timeZone: "America/Denver" });
      const nowMT = new Date(nowMTString);
      
      // Check if wake up time has passed today
      const currentHourMT = nowMT.getHours();
      const currentMinuteMT = nowMT.getMinutes();
      const wakeUpMinutesFromMidnight = hours * 60 + minutes;
      const currentMinutesFromMidnight = currentHourMT * 60 + currentMinuteMT;
      
      // Determine target date (today or tomorrow)
      const targetDate = new Date(now);
      if (wakeUpMinutesFromMidnight <= currentMinutesFromMidnight) {
        // Already passed today, schedule for tomorrow
        targetDate.setDate(targetDate.getDate() + 1);
      }
      
      // Format target date and time components in Mountain Time
      const targetDayName = targetDate.toLocaleDateString('en-US', { 
        timeZone: 'America/Denver', 
        weekday: 'short' 
      });
      const targetMonthDay = targetDate.toLocaleDateString('en-US', { 
        timeZone: 'America/Denver', 
        month: 'short',
        day: 'numeric'
      });
      
      // Format the wake up time in 12-hour format
      const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const minuteStr = minutes.toString().padStart(2, '0');
      
      // Construct the display string manually
      nextWakeUpDateTime = `${targetDayName}, ${targetMonthDay}, ${hour12.toString().padStart(2, '0')}:${minuteStr} ${ampm}`;
    }
    
    res.json({
      success: true,
      data: {
        enabled: wakeUpConfig.enabled,
        time: wakeUpConfig.time,
        nextWakeUpTime: schedulerService.getNextWakeUpTime(),
        nextWakeUpDateTime: nextWakeUpDateTime,
        lastTriggered: wakeUpConfig.last_triggered,
        lastTriggeredMT: wakeUpConfig.last_triggered ? 
          new Date(wakeUpConfig.last_triggered).toLocaleString('en-US', { timeZone: 'America/Denver' }) : null,
        goodMorningDelayMinutes: wakeUpConfig.good_morning_delay_minutes || 15,
        currentTimeMT: currentMT,
        currentDateMT: currentDateMT,
        timezone: 'America/Denver (Mountain Time)'
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

module.exports = router;