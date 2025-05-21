const express = require('express');
const router = express.Router();
const { schedulerService } = require('../services/serviceFactory');
const logger = require('../utils/logger').getModuleLogger('scheduler-routes');
const configManager = require('../utils/config');

// Get all active schedules
router.get('/schedules', (req, res) => {
  try {
    const result = schedulerService.getActiveSchedules();
    res.json(result);
  } catch (error) {
    logger.error(`Error getting active schedules: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get active schedules'
    });
  }
});

// Set wake-up time for tomorrow
router.post('/wake-up', (req, res) => {
  try {
    const { time } = req.body;
    
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        success: false,
        error: 'Valid time required in 24-hour format (HH:MM)'
      });
    }
    
    const result = schedulerService.setWakeUpTime(time);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error setting wake-up time: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to set wake-up time'
    });
  }
});

// Manually trigger a schedule
router.post('/trigger', (req, res) => {
  try {
    const { scene_name } = req.body;
    
    if (!scene_name) {
      return res.status(400).json({
        success: false,
        error: 'scene_name is required'
      });
    }
    
    schedulerService.triggerSchedule(scene_name)
      .then(result => {
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      })
      .catch(error => {
        logger.error(`Error triggering schedule: ${error.message}`);
        res.status(500).json({
          success: false,
          error: 'Failed to trigger schedule'
        });
      });
  } catch (error) {
    logger.error(`Error triggering schedule: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger schedule'
    });
  }
});

// Get current schedule information
router.get('/schedule', async (req, res) => {
  try {
    // Get the scheduler service
    const schedulerService = require('../services/schedulerService.fixed');
    
    // Check if scheduler service is initialized
    const isInitialized = typeof schedulerService.isInitialized === 'function' && 
                          schedulerService.isInitialized();
    
    // Get the current schedule
    let schedule;
    
    if (isInitialized) {
      schedule = await schedulerService.getSchedule();
    } else {
      // Return a minimal response if service is still initializing
      schedule = {
        activeSchedules: {},
        nextSchedules: [],
        missedSchedules: { total: 0, pending: 0, recovered: 0, details: [] },
        serviceStatus: {
          initialized: false,
          startTime: null,
          uptime: 0,
          status: 'initializing',
          message: 'Scheduler service is still initializing'
        }
      };
      
      // Try to get circuit status if available
      try {
        if (typeof schedulerService.getCircuitStatus === 'function') {
          schedule.circuitStatus = schedulerService.getCircuitStatus();
        }
      } catch (err) {
        logger.warn(`Could not get circuit status: ${err.message}`);
      }
      
      // Try to get wake-up times
      try {
        schedule.wakeUpTimes = {
          nextWakeUp: configManager.get('wakeUpTime.nextWakeUpTime'),
          defaultWakeUp: configManager.get('wakeUpTime.defaultTime')
        };
      } catch (err) {
        logger.warn(`Could not get wake-up times: ${err.message}`);
      }
    }
    
    // Return the schedule data
    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    logger.error(`Error retrieving schedule: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve schedule information',
      message: error.message
    });
  }
});

module.exports = router;