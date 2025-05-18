const express = require('express');
const router = express.Router();
const configManager = require('../utils/config');
const logger = require('../utils/logger').getModuleLogger('config-routes');

// Get all configuration
router.get('/', (req, res) => {
  try {
    const config = configManager.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error(`Error getting configuration: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to get configuration' });
  }
});

// Get specific configuration by path
router.get('/:path(*)', (req, res) => {
  try {
    const { path } = req.params;
    const value = configManager.get(path);
    
    if (value === null) {
      return res.status(404).json({ 
        success: false, 
        error: `Configuration path '${path}' not found` 
      });
    }
    
    res.json({ success: true, data: value });
  } catch (error) {
    logger.error(`Error getting configuration path: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to get configuration' });
  }
});

// Update specific configuration by path
router.put('/:path(*)', (req, res) => {
  try {
    const { path } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Value is required in request body' 
      });
    }
    
    const success = configManager.set(path, value);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Updated configuration path '${path}'`,
        data: value
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: `Failed to update configuration path '${path}'` 
      });
    }
  } catch (error) {
    logger.error(`Error updating configuration path: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

// Update multiple configuration values
router.post('/', (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'Updates object is required in request body' 
      });
    }
    
    const success = configManager.update(updates);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Configuration updated successfully'
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to update configuration' 
      });
    }
  } catch (error) {
    logger.error(`Error updating multiple configurations: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

// Set wake-up time for tomorrow
router.post('/wake-up-time', (req, res) => {
  try {
    const { time } = req.body;
    
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid time required in 24-hour format (HH:MM)' 
      });
    }
    
    const success = configManager.setNextWakeUpTime(time);
    
    if (success) {
      logger.info(`Wake-up time set to ${time}`);
      res.json({ 
        success: true, 
        message: `Wake-up time set to ${time}`
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to set wake-up time' 
      });
    }
  } catch (error) {
    logger.error(`Error setting wake-up time: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to set wake-up time' });
  }
});

// Set home/away status
router.post('/home-status', (req, res) => {
  try {
    const { status } = req.body;
    
    if (status !== 'home' && status !== 'away') {
      return res.status(400).json({ 
        success: false, 
        error: "Status must be either 'home' or 'away'" 
      });
    }
    
    const success = configManager.setHomeStatus(status);
    
    if (success) {
      logger.info(`Home status set to ${status}`);
      res.json({ 
        success: true, 
        message: `Home status set to ${status}`
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to set home status' 
      });
    }
  } catch (error) {
    logger.error(`Error setting home status: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to set home status' });
  }
});

// Add away period
router.post('/away-periods', (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Start and end dates are required' 
      });
    }
    
    // Simple validation for date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Dates must be in YYYY-MM-DD format' 
      });
    }
    
    // Check if start date is before end date
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Start date must be before end date' 
      });
    }
    
    const success = configManager.addAwayPeriod(startDate, endDate);
    
    if (success) {
      logger.info(`Away period added: ${startDate} to ${endDate}`);
      res.json({ 
        success: true, 
        message: `Away period added: ${startDate} to ${endDate}`
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to add away period' 
      });
    }
  } catch (error) {
    logger.error(`Error adding away period: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to add away period' });
  }
});

// Remove away period
router.delete('/away-periods/:index', (req, res) => {
  try {
    const index = parseInt(req.params.index);
    
    if (isNaN(index)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Index must be a number' 
      });
    }
    
    const success = configManager.removeAwayPeriod(index);
    
    if (success) {
      logger.info(`Away period removed at index ${index}`);
      res.json({ 
        success: true, 
        message: `Away period removed at index ${index}`
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to remove away period, index may be out of range' 
      });
    }
  } catch (error) {
    logger.error(`Error removing away period: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to remove away period' });
  }
});

module.exports = router;