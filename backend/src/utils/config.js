const fs = require('fs');
const path = require('path');
const logger = require('./logger').getModuleLogger('config');
// Node.js built-in modules
const os = require('os'); // Used for system temp directory access in ensureCacheDirectory

// Allow config path to be specified in environment variables
const CONFIG_FILE_PATH = process.env.CONFIG_PATH 
  ? path.resolve(process.env.CONFIG_PATH) 
  : path.join(__dirname, '../../../config/config.json');

// Backup file path for config
const BACKUP_CONFIG_PATH = `${CONFIG_FILE_PATH}.backup`;

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
    this.configLoaded = false;
    this.configChanged = false;
    this.lastConfigError = null;
    this.ensureConfigDirectory();
    this.loadConfig();
    
    // Set up periodic saving of config to avoid data loss
    setInterval(() => {
      if (this.configChanged) {
        this.saveConfig();
        this.configChanged = false;
      }
    }, 60000); // Save every minute if changes exist
    
    // Set up periodic config validation and recovery
    setInterval(() => {
      this.validateAndRecoverConfig();
    }, 300000); // Check every 5 minutes
  }
  
  /**
   * Ensure the cache directory exists with fallback
   */
  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        logger.info(`Created cache directory at ${this.cacheDir}`);
      } catch (error) {
        logger.error(`Failed to create primary cache directory: ${error.message}`);
        
        // Try fallback to system temp directory
        try {
          const tempCacheDir = path.join(os.tmpdir(), 'monty-cache');
          if (!fs.existsSync(tempCacheDir)) {
            fs.mkdirSync(tempCacheDir, { recursive: true });
          }
          
          // Update cache paths to use temp directory
          this.cacheDir = tempCacheDir;
          this.weatherCachePath = path.join(this.cacheDir, 'weather_cache.json');
          this.forecastCachePath = path.join(this.cacheDir, 'forecast_cache.json');
          
          logger.info(`Using fallback cache directory at ${this.cacheDir}`);
        } catch (fallbackError) {
          logger.error(`Failed to create fallback cache directory: ${fallbackError.message}`);
          logger.warn('Weather caching will be disabled');
          
          // Disable cache by setting paths to null
          this.cacheDir = null;
          this.weatherCachePath = null;
          this.forecastCachePath = null;
        }
      }
    }
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
      // Try to load from main config file
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        try {
          const rawData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
          this.config = JSON.parse(rawData);
          logger.info(`Configuration loaded successfully from ${CONFIG_FILE_PATH}`);
          this.configLoaded = true;
          
          // Ensure all required fields exist (handle config file from older version)
          this.config = this.mergeWithDefaults(this.config, DEFAULT_CONFIG);
          return;
        } catch (mainConfigError) {
          // Main config file exists but is invalid, try backup
          logger.error(`Error loading main configuration: ${mainConfigError.message}`);
          this.lastConfigError = mainConfigError.message;
          
          if (fs.existsSync(BACKUP_CONFIG_PATH)) {
            logger.info('Attempting to load from backup configuration');
            try {
              const backupData = fs.readFileSync(BACKUP_CONFIG_PATH, 'utf8');
              this.config = JSON.parse(backupData);
              logger.info('Backup configuration loaded successfully');
              this.configLoaded = true;
              
              // Ensure all required fields exist
              this.config = this.mergeWithDefaults(this.config, DEFAULT_CONFIG);
              
              // Restore the main config from backup
              this.saveConfig();
              return;
            } catch (backupError) {
              logger.error(`Error loading backup configuration: ${backupError.message}`);
            }
          }
        }
      }
      
      // If we reach here, either the config doesn't exist or both main and backup are corrupt
      logger.info('No valid configuration found, creating default');
      this.config = { ...DEFAULT_CONFIG };
      this.configChanged = true;
      this.configLoaded = true;
      this.saveConfig();
    } catch (error) {
      logger.error(`Critical error in configuration loading: ${error.message}`);
      logger.info('Using default configuration in memory only');
      this.lastConfigError = error.message;
      this.config = { ...DEFAULT_CONFIG };
      this.configChanged = true;
      this.configLoaded = false; // Indicate that we're running with in-memory config only
    }
  }
  
  /**
   * Save current configuration to file
   */
  saveConfig() {
    try {
      // First, create a backup of existing config if it exists and is valid
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        try {
          const currentConfig = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
          JSON.parse(currentConfig); // Test if valid JSON
          fs.writeFileSync(BACKUP_CONFIG_PATH, currentConfig, 'utf8');
          logger.debug('Created backup of current configuration');
        } catch (backupErr) {
          logger.warn(`Could not backup existing config: ${backupErr.message}`);
        }
      }
      
      // Now write the new config
      const configJson = JSON.stringify(this.config, null, 2);
      
      // Write to a temporary file first
      const tempConfigPath = `${CONFIG_FILE_PATH}.tmp`;
      fs.writeFileSync(tempConfigPath, configJson, 'utf8');
      
      // Ensure it's valid JSON before replacing the actual config
      try {
        JSON.parse(fs.readFileSync(tempConfigPath, 'utf8'));
      } catch (jsonErr) {
        throw new Error(`Invalid JSON in temp config: ${jsonErr.message}`);
      }
      
      // Replace the actual config with the temp file
      fs.renameSync(tempConfigPath, CONFIG_FILE_PATH);
      
      logger.info('Configuration saved successfully');
      this.lastConfigError = null;
      return true;
    } catch (error) {
      this.lastConfigError = error.message;
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
   * Get the current computed home/away status based on away periods
   * @returns {string} 'home' or 'away'
   */
  getCurrentHomeStatus() {
    try {
      // Get the manual status
      const manualStatus = this.get('homeStatus.status', 'home');
      
      // If manually set to away, respect that
      if (manualStatus === 'away') {
        return 'away';
      }
      
      // Check if currently in an away period
      const awayPeriods = this.get('homeStatus.awayPeriods', []);
      
      // Use local timezone - get current date in the configured timezone
      // For now, use UTC but this should be updated to use TimezoneManager when available
      const currentDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      for (const period of awayPeriods) {
        if (currentDateStr >= period.start && currentDateStr <= period.end) {
          logger.debug(`Currently in away period: ${period.start} to ${period.end} (current: ${currentDateStr})`);
          return 'away';
        }
      }
      
      return 'home';
    } catch (error) {
      logger.error(`Error computing current home status: ${error.message}`);
      return 'home'; // Default to home if error
    }
  }

  /**
   * Check if currently in an away period
   * @returns {boolean} True if currently away
   */
  isCurrentlyAway() {
    return this.getCurrentHomeStatus() === 'away';
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
  
  /**
   * Check if the configuration was successfully loaded
   * @returns {boolean} True if config was loaded, false otherwise
   */
  isLoaded() {
    return this.configLoaded;
  }
  
  /**
   * Get the last error that occurred during config operations
   * @returns {string|null} The last error message or null if no error
   */
  getLastError() {
    return this.lastConfigError;
  }
  
  /**
   * Validate the current configuration and attempt recovery if corrupted
   */
  validateAndRecoverConfig() {
    try {
      // Perform a basic validation check
      if (!this.config || typeof this.config !== 'object') {
        throw new Error('Configuration is not a valid object');
      }
      
      // Check if required sections exist
      const requiredSections = ['location', 'wakeUpTime', 'homeStatus', 'shadeScenes', 'music'];
      for (const section of requiredSections) {
        if (!this.config[section] || typeof this.config[section] !== 'object') {
          throw new Error(`Required configuration section '${section}' is missing or invalid`);
        }
      }
      
      // If we're in a degraded state but validation passes, attempt to save again
      if (!this.configLoaded) {
        logger.info('Configuration validation passed, attempting to restore from memory');
        if (this.saveConfig()) {
          this.configLoaded = true;
          logger.info('Successfully recovered configuration state');
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Configuration validation failed: ${error.message}`);
      
      // If validation fails, attempt recovery
      if (fs.existsSync(BACKUP_CONFIG_PATH)) {
        try {
          logger.info('Attempting to recover from backup configuration');
          const backupData = fs.readFileSync(BACKUP_CONFIG_PATH, 'utf8');
          const backupConfig = JSON.parse(backupData);
          
          // Merge with defaults to ensure completeness
          this.config = this.mergeWithDefaults(backupConfig, DEFAULT_CONFIG);
          this.configLoaded = true;
          this.configChanged = true;
          this.saveConfig();
          
          logger.info('Successfully recovered configuration from backup');
          return true;
        } catch (recoveryError) {
          logger.error(`Recovery from backup failed: ${recoveryError.message}`);
        }
      }
      
      // If recovery fails, reset to defaults as last resort
      logger.warn('Resetting to default configuration as last resort');
      this.config = { ...DEFAULT_CONFIG };
      this.configChanged = true;
      this.saveConfig();
      
      return false;
    }
  }
}

// Create and export a singleton instance
const configManager = new ConfigManager();
module.exports = configManager;