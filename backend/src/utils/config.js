const fs = require('fs');
const path = require('path');
const logger = require('./logger').getModuleLogger('config');

const CONFIG_FILE_PATH = path.join(__dirname, '../../../config/config.json');

// Default configuration values
const DEFAULT_CONFIG = {
  // General settings
  location: {
    zipCode: '80498',
    city: 'Silverthorne',
    state: 'CO'
  },
  
  // Wake up time settings
  wakeUpTime: {
    defaultTime: '07:45', // 24-hour format
    nextWakeUpTime: null  // Set by user for next day
  },
  
  // Home/Away status
  homeStatus: {
    status: 'home', // 'home' or 'away'
    awayPeriods: [] // Array of {start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'}
  },
  
  // Shade automation timing
  shadeScenes: {
    // Main Level
    goodMorningTime: '07:45', // Default wake up time for raising main floor privacy shades
    goodAfternoonOffset: 0,  // Offset in minutes from calculated sun position
    goodEveningOffset: 0,    // Offset in minutes from calculated sun position
    goodNightOffset: 30,     // Minutes after sunset to lower privacy shades
    
    // Bedroom
    riseAndShineTime: '07:45', // Default wake up time for bedroom blackout shades
    letTheSunInDelay: 7,      // Minutes after wake up to raise west bedroom privacy shades
    
    // Office
    startTheDayDelay: 20,    // Minutes after wake up to raise office shades
    
    // Additional scene options
    enableRepeatCommands: true,  // Whether to send commands multiple times for reliability
    repeatCommandCount: 2        // Number of times to repeat commands
  },
  
  // Music settings
  music: {
    defaultStation: '128737420597291214', // Jazz Fruits Music Radio station ID
    wakeUpWithMusic: false,
    wakeUpVolume: 50  // Volume level 0-100
  }
};

/**
 * Configuration manager for Monty application
 */
class ConfigManager {
  constructor() {
    this.config = null;
    this.ensureConfigDirectory();
    this.loadConfig();
    
    // Set up periodic saving of config to avoid data loss
    setInterval(() => {
      if (this.configChanged) {
        this.saveConfig();
        this.configChanged = false;
      }
    }, 60000); // Save every minute if changes exist
  }
  
  /**
   * Ensure the config directory exists
   */
  ensureConfigDirectory() {
    const configDir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
        logger.info(`Created config directory at ${configDir}`);
      } catch (error) {
        logger.error(`Failed to create config directory: ${error.message}`);
      }
    }
  }
  
  /**
   * Load configuration from file or create default if not exists
   */
  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const rawData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
        this.config = JSON.parse(rawData);
        logger.info('Configuration loaded successfully');
        
        // Ensure all required fields exist (handle config file from older version)
        this.config = this.mergeWithDefaults(this.config, DEFAULT_CONFIG);
      } else {
        logger.info('No configuration file found, creating default');
        this.config = { ...DEFAULT_CONFIG };
        this.saveConfig();
      }
    } catch (error) {
      logger.error(`Error loading configuration: ${error.message}`);
      logger.info('Using default configuration');
      this.config = { ...DEFAULT_CONFIG };
      this.configChanged = true;
    }
  }
  
  /**
   * Save current configuration to file
   */
  saveConfig() {
    try {
      fs.writeFileSync(
        CONFIG_FILE_PATH, 
        JSON.stringify(this.config, null, 2), 
        'utf8'
      );
      logger.info('Configuration saved successfully');
      return true;
    } catch (error) {
      logger.error(`Error saving configuration: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get the entire configuration object
   */
  getConfig() {
    return this.config;
  }
  
  /**
   * Get a specific configuration value by path
   * @param {string} path - Dot notation path (e.g., 'shadeScenes.goodNightOffset')
   * @param {any} defaultValue - Value to return if path not found
   */
  get(path, defaultValue = null) {
    const parts = path.split('.');
    let current = this.config;
    
    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * Set a specific configuration value by path
   * @param {string} path - Dot notation path (e.g., 'shadeScenes.goodNightOffset')
   * @param {any} value - Value to set
   */
  set(path, value) {
    const parts = path.split('.');
    let current = this.config;
    
    // Navigate to the parent of the property to set
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined) {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Set the property
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
    this.configChanged = true;
    
    // Save immediately for critical values
    if (this.isCriticalConfig(path)) {
      this.saveConfig();
    }
    
    return true;
  }
  
  /**
   * Update multiple configuration values
   * @param {object} updates - Object with updates
   */
  update(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.set(key, value);
    });
    
    // Always save after bulk updates
    this.saveConfig();
    return true;
  }
  
  /**
   * Merges configuration with defaults to ensure all required fields exist
   * @param {object} config - Existing configuration
   * @param {object} defaults - Default configuration
   */
  mergeWithDefaults(config, defaults) {
    const merged = { ...config };
    
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in merged)) {
        merged[key] = value;
        continue;
      }
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeWithDefaults(merged[key] || {}, value);
      }
    }
    
    return merged;
  }
  
  /**
   * Check if a configuration path is critical and should be saved immediately
   * @param {string} path - Configuration path
   */
  isCriticalConfig(path) {
    const criticalPaths = [
      'wakeUpTime.nextWakeUpTime',
      'homeStatus.status'
    ];
    
    return criticalPaths.some(criticalPath => path.startsWith(criticalPath));
  }
  
  /**
   * Set the next wake-up time
   * @param {string} time - Time in 24-hour format (HH:MM)
   */
  setNextWakeUpTime(time) {
    this.set('wakeUpTime.nextWakeUpTime', time);
    logger.info(`Next wake-up time set to ${time}`);
    return true;
  }
  
  /**
   * Get the wake-up time for tomorrow
   * Returns the nextWakeUpTime if set, otherwise the default time
   */
  getWakeUpTimeForTomorrow() {
    return this.get('wakeUpTime.nextWakeUpTime') || this.get('wakeUpTime.defaultTime');
  }
  
  /**
   * Update the home/away status
   * @param {string} status - 'home' or 'away'
   */
  setHomeStatus(status) {
    if (status !== 'home' && status !== 'away') {
      logger.warn(`Invalid home status: ${status}. Must be 'home' or 'away'`);
      return false;
    }
    
    this.set('homeStatus.status', status);
    logger.info(`Home status set to ${status}`);
    return true;
  }
  
  /**
   * Add an away period
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   */
  addAwayPeriod(startDate, endDate) {
    const awayPeriods = this.get('homeStatus.awayPeriods', []);
    
    awayPeriods.push({
      start: startDate,
      end: endDate
    });
    
    this.set('homeStatus.awayPeriods', awayPeriods);
    logger.info(`Added away period: ${startDate} to ${endDate}`);
    this.saveConfig();
    return true;
  }
  
  /**
   * Remove an away period
   * @param {number} index - Index of the period to remove
   */
  removeAwayPeriod(index) {
    const awayPeriods = this.get('homeStatus.awayPeriods', []);
    
    if (index < 0 || index >= awayPeriods.length) {
      logger.warn(`Invalid away period index: ${index}`);
      return false;
    }
    
    awayPeriods.splice(index, 1);
    this.set('homeStatus.awayPeriods', awayPeriods);
    logger.info(`Removed away period at index ${index}`);
    this.saveConfig();
    return true;
  }
}

// Create and export a singleton instance
const configManager = new ConfigManager();
module.exports = configManager;