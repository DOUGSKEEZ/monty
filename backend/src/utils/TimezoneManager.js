/**
 * TimezoneManager - Centralized timezone handling utility
 * 
 * This utility replaces hardcoded "America/Denver" timezone references throughout
 * the Monty home automation system, making it portable to any timezone.
 * 
 * Key Features:
 * - Configurable timezone (from scheduler.json)
 * - UTC ↔ User timezone conversions
 * - Consistent display formatting
 * - Timezone-aware cron scheduling
 * - Dynamic timezone display labels
 * 
 * Usage:
 *   const { getTimezoneManager } = require('./TimezoneManager');
 *   const tm = getTimezoneManager('America/Denver');
 *   
 *   // Convert user input to UTC
 *   const utcTime = tm.toUTC('14:30', new Date());
 *   
 *   // Format UTC time for display
 *   const display = tm.formatForDisplay(utcTime); // "2:30 PM"
 *   
 *   // Get timezone for cron jobs
 *   const cronTz = tm.getCronTimezone(); // "America/Denver"
 * 
 * @class TimezoneManager
 */
class TimezoneManager {
  constructor(timezone = 'America/Denver') {
    this.timezone = timezone;
  }

  /**
   * Convert UTC date to user timezone
   * @param {Date} utcDate - UTC date to convert
   * @returns {Date|null} Date object in user timezone
   */
  toUserTime(utcDate) {
    if (!utcDate) return null;
    const date = new Date(utcDate);
    return new Date(date.toLocaleString('en-US', { timeZone: this.timezone }));
  }

  /**
   * Convert user timezone time string to UTC Date
   * @param {string} localTimeString - Time in "HH:MM" format (user timezone)
   * @param {Date} referenceDate - Reference date for context (default: now)
   * @returns {Date} UTC Date object
   * @example tm.toUTC('14:30') converts 2:30 PM user time to UTC
   */
  toUTC(localTimeString, referenceDate = new Date()) {
    // For times like "14:30" in user timezone, convert to UTC
    const [hours, minutes] = localTimeString.split(':').map(Number);
    
    // Create date in user timezone
    const userDate = new Date(referenceDate.toLocaleString('en-US', { timeZone: this.timezone }));
    userDate.setHours(hours, minutes, 0, 0);
    
    // Calculate offset
    const utcDate = new Date(referenceDate);
    const offset = utcDate.getTime() - userDate.getTime();
    
    // Create UTC equivalent
    const result = new Date(userDate);
    result.setTime(result.getTime() + offset);
    return result;
  }

  /**
   * Format date for display in user timezone
   * @param {Date} date - Date to format (can be UTC)
   * @param {string|object} format - 'time', 'datetime', or custom options
   * @returns {string|null} Formatted time string
   * @example 
   *   tm.formatForDisplay(utcDate, 'time') → "2:30 PM"
   *   tm.formatForDisplay(utcDate, 'datetime') → "May 30, 2:30 PM"
   */
  formatForDisplay(date, format = 'time') {
    if (!date) return null;
    const d = new Date(date);
    
    const options = {
      timeZone: this.timezone,
      ...(format === 'time' ? {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      } : format === 'datetime' ? {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      } : {})
    };
    
    return d.toLocaleString('en-US', options);
  }

  /**
   * Format date for logging (always UTC)
   * @param {Date} date - Date to format
   * @returns {string} ISO string in UTC
   */
  formatForLogging(date) {
    return new Date(date).toISOString();
  }

  /**
   * Get timezone identifier for cron jobs
   * @returns {string} Timezone identifier (e.g., "America/Denver")
   */
  getCronTimezone() {
    return this.timezone;
  }

  /**
   * Get current time in user timezone
   * @returns {Date} Current time converted to user timezone
   */
  getCurrentUserTime() {
    return this.toUserTime(new Date());
  }

  /**
   * Get friendly timezone name from timezone identifier
   * @returns {string} Human-readable timezone name
   * @example "America/Denver" → "Mountain Time"
   */
  getTimezoneName() {
    const timezoneMap = {
      'America/Denver': 'Mountain Time',
      'America/Los_Angeles': 'Pacific Time',
      'America/New_York': 'Eastern Time',
      'America/Chicago': 'Central Time',
      'America/Phoenix': 'Mountain Standard Time',
      'America/Anchorage': 'Alaska Time',
      'Pacific/Honolulu': 'Hawaii Time',
      'Europe/London': 'Greenwich Mean Time',
      'Europe/Paris': 'Central European Time',
      'Asia/Tokyo': 'Japan Standard Time',
      'Australia/Sydney': 'Australian Eastern Time'
    };
    
    return timezoneMap[this.timezone] || this.timezone.split('/')[1]?.replace(/_/g, ' ') + ' Time' || 'Local Time';
  }

  /**
   * Get full timezone display string for UI
   * @returns {string} Full display string
   * @example "America/Denver (Mountain Time)"
   */
  getTimezoneDisplay() {
    return `${this.timezone} (${this.getTimezoneName()})`;
  }
}

// Singleton pattern for consistent timezone handling across the application
let instance = null;

module.exports = {
  TimezoneManager,
  
  /**
   * Get the singleton TimezoneManager instance
   * @param {string} timezone - Timezone identifier (only used for first call)
   * @returns {TimezoneManager} Singleton instance
   */
  getTimezoneManager: (timezone) => {
    if (!instance) {
      instance = new TimezoneManager(timezone);
    }
    return instance;
  },
  
  /**
   * Initialize/reinitialize the TimezoneManager singleton
   * @param {string} timezone - Timezone identifier
   * @returns {TimezoneManager} New singleton instance
   */
  initializeTimezoneManager: (timezone) => {
    instance = new TimezoneManager(timezone);
    return instance;
  }
};