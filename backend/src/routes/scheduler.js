const express = require('express');
const router = express.Router();
const schedulerService = require('../services/schedulerService');
const logger = require('../utils/logger').getModuleLogger('scheduler-routes');

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

module.exports = router;