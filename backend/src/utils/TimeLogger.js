const cron = require('node-cron');
const logger = require('./logger').getModuleLogger('time-logger');

/**
 * TimeLogger utility - Logs the current local time every hour
 * This helps with log readability by providing clear time markers
 */
class TimeLogger {
  constructor() {
    this.cronJob = null;
  }

  /**
   * Start the hourly time logging
   */
  start() {
    try {
      // Schedule to run at the top of every hour (0 minutes)
      // No timezone specified - uses system local time
      this.cronJob = cron.schedule('0 * * * *', () => {
        this.logCurrentTime();
      }, {
        scheduled: true
      });

      // Also log the current time immediately on startup
      this.logCurrentTime();
      
      logger.info('⏰ TimeLogger initialized - will log time every hour at :00');
      
    } catch (error) {
      logger.error(`Failed to start TimeLogger: ${error.message}`);
    }
  }

  /**
   * Log the current time with clear formatting
   */
  logCurrentTime() {
    const now = new Date();
    
    // Format using system local time (no timezone specified)
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    
    const formattedTime = now.toLocaleString('en-US', options);
    
    // Log with special formatting to make it stand out in logs
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info(`⏰ CLOCK CHIME: ${formattedTime}`);
    logger.info('═══════════════════════════════════════════════════════════════');
  }

  /**
   * Stop the time logger
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('TimeLogger stopped');
    }
  }
}

// Export a singleton instance
module.exports = new TimeLogger();