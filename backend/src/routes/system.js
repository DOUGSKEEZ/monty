const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('system-routes');

// Get current system timezone
router.get('/timezone', async (req, res) => {
  try {
    // Get current timezone using timedatectl
    const { stdout } = await execPromise('timedatectl show --property=Timezone --value');
    const currentTimezone = stdout.trim();
    
    // Get current time to show the actual system time
    const currentTime = new Date().toLocaleString('en-US', { 
      timeZone: currentTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    logger.info(`Current system timezone: ${currentTimezone}`);
    
    res.json({ 
      success: true, 
      data: {
        timezone: currentTimezone,
        currentTime: currentTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error getting system timezone: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get system timezone',
      message: error.message 
    });
  }
});

// Note: Setting system timezone requires sudo privileges and should not be done through a web API
// This functionality has been removed for security reasons

// Note: Timezone management should be done at the system level by administrators
// Web applications should only display the current timezone, not change it

module.exports = router;