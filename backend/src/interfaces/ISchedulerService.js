/**
 * ISchedulerService - Interface for scheduler service implementations
 * 
 * Defines the required methods for any scheduler service implementation.
 * This provides a contract that different implementations must follow.
 */

const BaseInterface = require('./BaseInterface');

class ISchedulerService extends BaseInterface {
  /**
   * Initialize the scheduler service
   * @returns {Promise<void>} - Promise that resolves when initialization is complete
   */
  async initialize() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} - True if initialized, false otherwise
   */
  isInitialized() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Refresh all schedules (typically called at midnight)
   * @returns {Promise<void>} - Promise that resolves when refresh is complete
   */
  async refreshSchedules() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Set the wake-up time for tomorrow
   * @param {string} time - Time in HH:MM format (24-hour)
   * @returns {object} - Result with success/error information
   */
  setWakeUpTime(time) {
    throw new Error('Method not implemented');
  }
  
  /**
   * Get the wake-up time for tomorrow
   * @returns {string} - Time in HH:MM format
   */
  getWakeUpTimeForTomorrow() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Get all active schedules
   * @returns {object} - Object containing all active schedules
   */
  getActiveSchedules() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Manually trigger a shade scene schedule
   * @param {string} sceneName - The name of the scene schedule to trigger
   * @returns {Promise<object>} - Result with success/error information
   */
  async triggerSchedule(sceneName) {
    throw new Error('Method not implemented');
  }
  
  /**
   * Get circuit breaker statistics
   * @returns {object} - Circuit breaker stats
   */
  getCircuitStatus() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Get missed schedule information
   * @returns {object} - Missed schedule stats and details
   */
  getMissedSchedules() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Check for and recover missed schedules
   * @returns {Promise<boolean>} - True if missed schedules were found
   */
  async checkForMissedSchedules() {
    throw new Error('Method not implemented');
  }
  
  /**
   * Force a reset of the scheduler service
   * @returns {Promise<object>} - Result with success/error information
   */
  async forceReset() {
    throw new Error('Method not implemented');
  }
}

module.exports = ISchedulerService;