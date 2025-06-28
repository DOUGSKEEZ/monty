/**
 * SchedulerService - Automated shade scene scheduling based on time and sunset
 * 
 * This service provides:
 * - ServiceRegistry integration
 * - ServiceWatchdog monitoring 
 * - Automated shade scene execution at calculated times
 * - Sunset-based timing calculations with timezone awareness
 * - Home/Away status awareness
 * - Direct ShadeCommander integration
 */

const cron = require('node-cron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger').getModuleLogger('scheduler-service');

class SchedulerService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog, weatherService, timezoneManager) {
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;
    this.weatherService = weatherService;
    this.timezoneManager = timezoneManager;
    
    // Configuration
    this.schedulerConfigPath = path.join(__dirname, '../../../config/scheduler.json');
    this.schedulerConfig = this.loadSchedulerConfig();
    
    // State
    this.scheduledJobs = new Map();
    this.sunsetCache = new Map();
    this.isInitialized = false;
    this.lastError = null;
    this.lastExecutedScene = null;
    this.nextSceneTimes = {};
    
    // File watching
    this.configWatcher = null;
    this.reloadDebounceTimer = null;

    // Register with ServiceRegistry
    this.serviceRegistry.register('SchedulerService', {
      instance: this,
      isCore: false,
      checkHealth: this.healthCheck.bind(this),
    });

    // Register with ServiceWatchdog
    this.serviceWatchdog.registerService('SchedulerService', {
      isCritical: false,
      monitorMemory: false,
      recoveryProcedure: this.recoveryProcedure.bind(this),
    });

    // Mark service as ready
    this.serviceRegistry.setStatus('SchedulerService', 'ready');
    logger.info('SchedulerService initialized with shade scene automation');
  }

  /**
   * Load scheduler configuration from file
   */
  loadSchedulerConfig() {
    try {
      if (fs.existsSync(this.schedulerConfigPath)) {
        const config = JSON.parse(fs.readFileSync(this.schedulerConfigPath, 'utf8'));
        logger.info('Scheduler configuration loaded successfully');
        return config;
      } else {
        logger.warn('Scheduler config file not found, using defaults');
        return this.getDefaultConfig();
      }
    } catch (error) {
      logger.error(`Failed to load scheduler config: ${error.message}`);
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default scheduler configuration
   */
  getDefaultConfig() {
    return {
      location: {
        timezone: this.timezoneManager?.getCronTimezone() || "America/Denver",
        city: "Silverthorne, CO"
      },
      scenes: {
        good_afternoon_time: "14:30",
        good_evening_offset_minutes: -60,
        good_night_offset_minutes: 0,
        good_night_timing: "civil_twilight_end"
      },
      home_away: {
        status: "home",
        away_periods: []
      }
    };
  }

  /**
   * Initialize the scheduler service
   */
  async initialize() {
    try {
      logger.info('Initializing SchedulerService...');
      
      // Calculate today's scene times
      await this.calculateSceneTimes();
      
      // Schedule all scenes
      await this.scheduleAllScenes();
      
      // Start configuration file watcher
      this.startConfigWatcher();
      
      this.isInitialized = true;
      this.lastError = null;
      
      logger.info('SchedulerService initialization completed');
      return true;
    } catch (error) {
      this.lastError = error.message;
      logger.error(`SchedulerService initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Calculate scene times for a given date
   */
  async calculateSceneTimes(date = new Date()) {
    try {
      const times = {};
      const dateStr = date.toLocaleDateString('en-CA', { timeZone: this.timezoneManager.getCronTimezone() });
      
      // Good Afternoon - static time (user input is in user's timezone)
      const afternoonTime = this.schedulerConfig.scenes.good_afternoon_time || "14:30";
      
      // Create a date object representing the time in the user's timezone
      // For display purposes, we'll format this as a user-timezone time
      const [hours, minutes] = afternoonTime.split(':').map(Number);
      const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const minuteStr = minutes.toString().padStart(2, '0');
      times.good_afternoon_display = `${hour12}:${minuteStr} ${ampm}`;
      
      // Also store the date for scheduling purposes
      // Create Good Afternoon time for today (daily recurring job)  
      // Create date string with proper timezone using Intl.DateTimeFormat
      const today = new Date();
      const todayDateStr = today.toISOString().split('T')[0]; // Get YYYY-MM-DD
      
      // Get current timezone offset for America/Denver (or whatever timezone is configured)
      const timezone = this.timezoneManager.getCronTimezone() || 'America/Denver';
      const testDate = new Date();
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
      });
      const parts = formatter.formatToParts(testDate);
      const offsetPart = parts.find(part => part.type === 'timeZoneName');
      const offset = offsetPart ? offsetPart.value.replace('GMT', '') : '-06:00';
      
      const afternoonDateStr = `${todayDateStr}T${afternoonTime}:00${offset}`;
      times.good_afternoon = new Date(afternoonDateStr);
      
      // Get full sun times data (includes twilight)
      const sunTimesData = await this.getSunTimesData(date);
      
      // Good Evening - before sunset
      const eveningOffset = this.schedulerConfig.scenes.good_evening_offset_minutes || -60;
      times.good_evening = new Date(sunTimesData.sunset + (eveningOffset * 60 * 1000));
      
      // Good Night - use civil twilight end or fallback to sunset + offset
      const goodNightTiming = this.schedulerConfig.scenes.good_night_timing || "civil_twilight_end";
      let baseGoodNightTime;
      
      if (goodNightTiming === "civil_twilight_end" && sunTimesData.civilTwilightEnd) {
        baseGoodNightTime = new Date(sunTimesData.civilTwilightEnd);
        logger.debug(`Using civil twilight end as base for good_night: ${this.timezoneManager.formatForDisplay(baseGoodNightTime)}`);
      } else {
        // Fallback to sunset + 30 minutes for backward compatibility
        const fallbackOffset = this.schedulerConfig.scenes.good_night_offset_minutes_legacy || 30;
        baseGoodNightTime = new Date(sunTimesData.sunset + (fallbackOffset * 60 * 1000));
        logger.debug(`Using sunset + ${fallbackOffset} minutes as base for good_night: ${this.timezoneManager.formatForDisplay(baseGoodNightTime)}`);
      }
      
      // Apply user-configurable offset to the base time
      const userOffset = this.schedulerConfig.scenes.good_night_offset_minutes || 0;
      times.good_night = new Date(baseGoodNightTime.getTime() + (userOffset * 60 * 1000));
      
      logger.debug(`Applied user offset of ${userOffset} minutes to good_night: ${this.timezoneManager.formatForDisplay(times.good_night)}`);
      
      this.nextSceneTimes = times;
      
      // No need to store separate display format - let TimezoneManager handle formatting consistently
      
      logger.info(`Scene times calculated for ${dateStr}:`, {
        good_afternoon: times.good_afternoon_display,
        good_evening: this.timezoneManager.formatForDisplay(times.good_evening),
        good_night: this.timezoneManager.formatForDisplay(times.good_night),
        sunset: this.timezoneManager.formatForDisplay(new Date(sunTimesData.sunset)),
        civil_twilight_end: sunTimesData.civilTwilightEnd ? this.timezoneManager.formatForDisplay(new Date(sunTimesData.civilTwilightEnd)) : 'N/A'
      });
      
      return times;
    } catch (error) {
      logger.error(`Failed to calculate scene times: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get complete sun times data including twilight
   */
  async getSunTimesData(date = new Date()) {
    try {
      if (!this.weatherService) {
        throw new Error('WeatherService not available');
      }
      
      const result = await this.weatherService.getSunriseSunsetTimes(date);
      
      if (!result.success || !result.data) {
        throw new Error('No sun times data available from WeatherService');
      }
      
      const data = result.data;
      
      // Return standardized data structure
      return {
        sunrise: data.sunrise,
        sunset: data.sunset,
        civilTwilightBegin: data.civilTwilightBegin ? new Date(data.civilTwilightBegin).getTime() : null,
        civilTwilightEnd: data.civilTwilightEnd ? new Date(data.civilTwilightEnd).getTime() : null,
        nauticalTwilightBegin: data.nauticalTwilightBegin ? new Date(data.nauticalTwilightBegin).getTime() : null,
        nauticalTwilightEnd: data.nauticalTwilightEnd ? new Date(data.nauticalTwilightEnd).getTime() : null,
        astronomicalTwilightBegin: data.astronomicalTwilightBegin ? new Date(data.astronomicalTwilightBegin).getTime() : null,
        astronomicalTwilightEnd: data.astronomicalTwilightEnd ? new Date(data.astronomicalTwilightEnd).getTime() : null
      };
    } catch (error) {
      logger.error(`Failed to get sun times data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sunset time with caching
   */
  async getSunsetTime(date = new Date()) {
    const cacheKey = `sunset_${date.toISOString().split('T')[0]}`;
    
    // Check cache first
    if (this.sunsetCache.has(cacheKey)) {
      const cached = this.sunsetCache.get(cacheKey);
      logger.debug(`Using cached sunset time for ${cacheKey}`);
      return cached;
    }
    
    try {
      // First try to get from cached weather data (if available)
      let sunsetTime = await this.getSunsetFromCache(date);
      
      if (!sunsetTime) {
        // Fallback to weather service API call
        sunsetTime = await this.fetchSunsetTime(date);
      }
      
      // Cache for 24 hours
      this.sunsetCache.set(cacheKey, sunsetTime);
      
      // Clear old cache entries (keep only last 3 days)
      if (this.sunsetCache.size > 3) {
        const oldestKey = Array.from(this.sunsetCache.keys())[0];
        this.sunsetCache.delete(oldestKey);
      }
      
      logger.info(`Sunset time cached for ${cacheKey}: ${this.timezoneManager.formatForDisplay(sunsetTime)}`);
      return sunsetTime;
    } catch (error) {
      logger.error(`Failed to get sunset time: ${error.message}`);
      
      // Fallback to reasonable default (8:00 PM Mountain Time)
      const fallback = new Date(date);
      fallback.setHours(20, 0, 0, 0); // 8 PM Mountain Time
      logger.warn(`Using fallback sunset time: ${this.timezoneManager.formatForDisplay(fallback)}`);
      return fallback;
    }
  }

  /**
   * Try to get sunset from WeatherService (uses same source as frontend)
   */
  async getSunsetFromCache(date = new Date()) {
    try {
      // Use the same getSunriseSunsetTimes method that the frontend uses
      // This ensures consistent data between frontend and scheduler
      const result = await this.weatherService.getSunriseSunsetTimes(date);
      
      if (result.success && result.data && result.data.sunset) {
        const sunsetTime = new Date(result.data.sunset);
        logger.debug(`Found sunset from WeatherService: ${this.timezoneManager.formatForDisplay(sunsetTime)}`);
        return sunsetTime;
      }
      
      return null;
    } catch (error) {
      logger.debug(`Could not get sunset from WeatherService: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch sunset time from existing WeatherService
   */
  async fetchSunsetTime(date = new Date()) {
    try {
      if (!this.weatherService) {
        throw new Error('WeatherService not available');
      }
      
      // Use the existing WeatherService getSunriseSunsetTimes method
      const result = await this.weatherService.getSunriseSunsetTimes(date);
      
      if (!result.success || !result.data || !result.data.sunset) {
        throw new Error('No sunset data available from WeatherService');
      }
      
      const sunsetTime = new Date(result.data.sunset);
      logger.debug(`Fetched sunset time from WeatherService: ${sunsetTime.toLocaleTimeString()}`);
      return sunsetTime;
    } catch (error) {
      logger.error(`Failed to fetch sunset from WeatherService: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      // Use http for localhost, https for external URLs
      const httpModule = url.startsWith('https://') ? https : http;
      const method = options.method || 'GET';
      
      const requestOptions = {
        timeout: 10000,
        method: method,
        headers: options.headers || {}
      };
      
      const request = httpModule.request(url, requestOptions, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            if (response.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`HTTP ${response.statusCode}: ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
      
      // Write request body if provided (for POST requests)
      if (options.body) {
        request.write(options.body);
      }
      
      request.end();
    });
  }

  /**
   * Schedule all scenes using node-cron
   */
  async scheduleAllScenes() {
    try {
      logger.info(`🔍 [CONFIG_DEBUG] scheduleAllScenes() called - current good_afternoon_time: "${this.schedulerConfig.scenes.good_afternoon_time}"`);
      
      // Clear existing schedules
      this.clearAllSchedules();
      
      // Schedule Good Afternoon (static time daily)
      const afternoonTime = this.schedulerConfig.scenes.good_afternoon_time || "14:30";
      const [hours, minutes] = afternoonTime.split(':').map(Number);
      const afternoonCron = `${minutes} ${hours} * * *`;
      
      const afternoonJob = cron.schedule(afternoonCron, () => {
        this.executeScene('good_afternoon');
      }, {
        scheduled: true,
        timezone: this.timezoneManager.getCronTimezone()
      });
      
      this.scheduledJobs.set('good_afternoon', afternoonJob);
      logger.info(`Scheduled Good Afternoon scene at ${afternoonTime} daily`);
      
      // Schedule daily sunset calculation and dynamic scene scheduling
      const midnightJob = cron.schedule('0 0 * * *', () => {
        this.calculateAndScheduleDynamicScenes();
      }, {
        scheduled: true,
        timezone: this.timezoneManager.getCronTimezone()
      });
      
      this.scheduledJobs.set('midnight_recalc', midnightJob);
      logger.info('Scheduled daily sunset recalculation at midnight');
      
      // Schedule wake up alarm if enabled
      this.scheduleWakeUp();
      
      // Schedule today's dynamic scenes
      await this.scheduleSubsetBasedScenes();
      
    } catch (error) {
      logger.error(`Failed to schedule scenes: ${error.message}`);
      this.lastError = error.message;
    }
  }

  /**
   * Schedule sunset-based scenes for today
   */
  async scheduleSubsetBasedScenes() {
    try {
      const times = await this.calculateSceneTimes();
      const now = new Date();
      
      // Schedule Good Evening if it hasn't passed today
      if (times.good_evening > now) {
        const eveningDate = times.good_evening;
        
        // Convert to Mountain Time for cron scheduling
        const eveningMT = this.timezoneManager.toUserTime(eveningDate);
        const eveningCron = `${eveningMT.getMinutes()} ${eveningMT.getHours()} ${eveningMT.getDate()} ${eveningMT.getMonth() + 1} *`;
        
        const eveningJob = cron.schedule(eveningCron, () => {
          this.executeScene('good_evening');
        }, {
          scheduled: true,
          timezone: this.timezoneManager.getCronTimezone()
        });
        
        this.scheduledJobs.set('good_evening_today', eveningJob);
        logger.info(`Scheduled Good Evening scene at ${this.timezoneManager.formatForDisplay(eveningDate, 'datetime')}`);
      }
      
      // Schedule Good Night if it hasn't passed today
      if (times.good_night > now) {
        const nightDate = times.good_night;
        
        // Convert to Mountain Time for cron scheduling
        const nightMT = this.timezoneManager.toUserTime(nightDate);
        const nightCron = `${nightMT.getMinutes()} ${nightMT.getHours()} ${nightMT.getDate()} ${nightMT.getMonth() + 1} *`;
        
        const nightJob = cron.schedule(nightCron, () => {
          this.executeScene('good_night');
        }, {
          scheduled: true,
          timezone: this.timezoneManager.getCronTimezone()
        });
        
        this.scheduledJobs.set('good_night_today', nightJob);
        logger.info(`Scheduled Good Night scene at ${this.timezoneManager.formatForDisplay(nightDate, 'datetime')}`);
      }
      
    } catch (error) {
      logger.error(`Failed to schedule sunset-based scenes: ${error.message}`);
    }
  }

  /**
   * Calculate and schedule dynamic scenes (called daily at midnight)
   */
  async calculateAndScheduleDynamicScenes() {
    try {
      logger.info('Recalculating sunset-based scene times for new day');
      
      // Clear existing dynamic schedules
      if (this.scheduledJobs.has('good_evening_today')) {
        this.scheduledJobs.get('good_evening_today').stop();
        this.scheduledJobs.delete('good_evening_today');
      }
      if (this.scheduledJobs.has('good_night_today')) {
        this.scheduledJobs.get('good_night_today').stop();
        this.scheduledJobs.delete('good_night_today');
      }
      
      // Clear existing wake up schedules
      this.clearWakeUpSchedules();
      
      // Schedule new dynamic scenes
      await this.scheduleSubsetBasedScenes();
      
      // Schedule wake up alarm for new day
      this.scheduleWakeUp();
      
    } catch (error) {
      logger.error(`Failed to recalculate dynamic scenes: ${error.message}`);
    }
  }

  /**
   * Execute a shade scene
   */
  async executeScene(sceneName) {
    try {
      logger.info(`Executing scene: ${sceneName}`);
      
      // Check home/away status
      if (!this.isHomeStatusActive()) {
        logger.info(`Skipping scene '${sceneName}' - status is away`);
        return { success: false, reason: 'away_status' };
      }
      
      // Check if music should be started for this scene
      await this.handleSceneMusic(sceneName);
      
      // Call ShadeCommander API
      const result = await this.callShadeCommander(sceneName);
      
      this.lastExecutedScene = {
        name: sceneName,
        timestamp: new Date(),
        success: result.success,
        message: result.message || (result.success ? 'Scene executed successfully' : 'Scene execution failed')
      };
      
      if (result.success) {
        logger.info(`Scene '${sceneName}' executed successfully: ${result.message}`);
      } else {
        logger.error(`Scene '${sceneName}' failed: ${result.message}`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Error executing scene '${sceneName}': ${error.message}`);
      
      this.lastExecutedScene = {
        name: sceneName,
        timestamp: new Date(),
        success: false,
        message: error.message
      };
      
      return { success: false, message: error.message };
    }
  }

  /**
   * Handle music integration for scenes with pianobar and Bluetooth status awareness
   */
  async handleSceneMusic(sceneName) {
    try {
      const musicConfig = this.schedulerConfig.music || {};
      
      // Determine if this scene should start music
      let shouldStartMusic = false;
      
      if (sceneName === 'good_morning') {
        shouldStartMusic = musicConfig.enabled_for_morning === true;
      } else if (sceneName === 'good_evening') {
        shouldStartMusic = musicConfig.enabled_for_evening === true;
      } else if (sceneName === 'good_afternoon') {
        shouldStartMusic = musicConfig.enabled_for_afternoon === true;
      } else if (sceneName === 'good_night') {
        shouldStartMusic = musicConfig.enabled_for_night === true;
      }
      
      if (!shouldStartMusic) {
        logger.debug(`Scene '${sceneName}' - music not enabled for this scene type`);
        return { skipped: true, reason: 'music_disabled' };
      }
      
      // Use the comprehensive music startup logic
      const triggerSource = `Scene '${sceneName}'`;
      const result = await this.startMusicIfSafe(triggerSource);
      
      return result;
      
    } catch (error) {
      logger.error(`Error handling scene music for '${sceneName}': ${error.message}`);
      // Don't throw - music failure shouldn't stop scene execution
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if pianobar is currently running
   */
  async checkPianobarStatus() {
    try {
      // Check if pianobar process exists
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('pgrep pianobar');
      const pids = stdout.trim().split('\n').filter(pid => pid.length > 0);
      
      if (pids.length > 0) {
        logger.debug(`Pianobar process detected: PIDs ${pids.join(', ')}`);
        return true;
      }
      
      logger.debug('No pianobar process detected');
      return false;
      
    } catch (error) {
      // pgrep returns exit code 1 when no processes found
      if (error.code === 1) {
        logger.debug('No pianobar process detected (pgrep exit 1)');
        return false;
      }
      
      logger.warn(`Error checking pianobar status: ${error.message}`);
      return false; // Default to not running on error
    }
  }

  /**
   * Comprehensive music startup with pianobar and Bluetooth status awareness
   */
  async startMusicIfSafe(triggerSource) {
    try {
      // 1. Check if pianobar already running (right of way protection)
      const pianobarRunning = await this.checkPianobarStatus();
      if (pianobarRunning) {
        logger.info(`🎵 ${triggerSource} skipped - pianobar already running (respecting existing session)`);
        return { skipped: true, reason: "pianobar_running" };
      }
      
      // 2. Check Bluetooth status quickly using bt-connect.sh
      logger.debug(`🔊 ${triggerSource} checking Bluetooth status...`);
      const btStatus = await this.checkBluetoothStatus();
      
      if (btStatus.connected) {
        // Already connected and ready - just start pianobar
        logger.info(`🎵 ${triggerSource} starting pianobar - Bluetooth already connected (${btStatus.device})`);
        return await this.startPianobarDirect();
      }
      
      // 3. Need full Bluetooth connection sequence
      logger.info(`🔊 ${triggerSource} connecting Bluetooth then starting pianobar`);
      const btConnectResult = await this.connectBluetoothDirect();
      
      if (!btConnectResult.success) {
        logger.error(`🔊 ${triggerSource} Bluetooth connection failed: ${btConnectResult.message}`);
        return { success: false, reason: "bluetooth_connection_failed", error: btConnectResult.message };
      }
      
      logger.info(`🔊 ${triggerSource} Bluetooth connected successfully, starting pianobar`);
      return await this.startPianobarDirect();
      
    } catch (error) {
      logger.error(`🎵 ${triggerSource} music startup failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check Bluetooth status using BluetoothService (the proper new implementation)
   */
  async checkBluetoothStatus() {
    try {
      // Import BluetoothService - we'll get it from the ServiceFactory
      const { createBluetoothService } = require('../utils/ServiceFactory');
      const bluetoothService = createBluetoothService();
      
      const statusResult = await bluetoothService.getStatus();
      
      if (statusResult.success) {
        // Parse the status result from BluetoothService
        const statusData = statusResult.data;
        logger.debug(`🔊 Bluetooth status check via BluetoothService: connected=${statusData.isConnected}, audioReady=${statusData.isAudioReady}`);
        
        return {
          connected: statusData.isConnected && statusData.isAudioReady,
          device: statusData.device || 'Bluetooth Speaker',
          message: statusData.message || 'Connected via BluetoothService'
        };
      } else {
        logger.debug(`🔊 Bluetooth not connected via BluetoothService: ${statusResult.message}`);
        return {
          connected: false,
          message: statusResult.message || 'BluetoothService error'
        };
      }
    } catch (error) {
      logger.warn(`🔊 Error checking Bluetooth status: ${error.message}`);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Connect Bluetooth using BluetoothService (the proper new implementation)
   */
  async connectBluetoothDirect() {
    try {
      // Import BluetoothService - we'll get it from the ServiceFactory
      const { createBluetoothService } = require('../utils/ServiceFactory');
      const bluetoothService = createBluetoothService();
      
      logger.info('🔊 Initiating Bluetooth connection via BluetoothService...');
      const connectResult = await bluetoothService.connect();
      
      if (connectResult.success) {
        logger.info(`🔊 Bluetooth connection successful via BluetoothService: ${connectResult.message}`);
        return {
          success: true,
          message: connectResult.message
        };
      } else {
        logger.error(`🔊 Bluetooth connection failed via BluetoothService: ${connectResult.message}`);
        return {
          success: false,
          message: connectResult.message
        };
      }
    } catch (error) {
      logger.error(`🔊 Error during Bluetooth connection: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Start pianobar using the PianobarService (the correct working implementation)
   */
  async startPianobarDirect() {
    try {
      // Use the PianobarService endpoint, not the legacy music service
      const url = `http://localhost:3001/api/pianobar/start`;
      
      const response = await this.makeHttpRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      logger.info('🎵 Pianobar started successfully via PianobarService');
      return { success: true, message: 'Pianobar started successfully' };
      
    } catch (error) {
      logger.error(`🎵 Failed to start pianobar via PianobarService: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if home status is active (not away)
   */
  isHomeStatusActive() {
    try {
      // Use configManager's computed status which handles both manual status and away periods
      return this.configManager.getCurrentHomeStatus() === 'home';
    } catch (error) {
      logger.error(`Error checking home/away status: ${error.message}`);
      return true; // Default to home if error
    }
  }

  /**
   * Call ShadeCommander API to execute scene
   */
  async callShadeCommander(sceneName) {
    try {
      const url = `http://192.168.0.15:8000/scenes/${sceneName}/execute`;
      
      return new Promise((resolve, reject) => {
        const postData = JSON.stringify({});
        
        const options = {
          hostname: '192.168.0.15',
          port: 8000,
          path: `/scenes/${sceneName}/execute`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 30000
        };
        
        const request = http.request(options, (response) => {
          let data = '';
          
          response.on('data', (chunk) => {
            data += chunk;
          });
          
          response.on('end', () => {
            try {
              if (response.statusCode === 200) {
                const result = JSON.parse(data);
                resolve({
                  success: true,
                  message: result.message || 'Scene executed successfully',
                  data: result
                });
              } else {
                resolve({
                  success: false,
                  message: `HTTP ${response.statusCode}: ${data}`
                });
              }
            } catch (parseError) {
              resolve({
                success: false,
                message: `Failed to parse response: ${parseError.message}`
              });
            }
          });
        });
        
        request.on('error', (error) => {
          resolve({
            success: false,
            message: `ShadeCommander connection error: ${error.message}`
          });
        });
        
        request.on('timeout', () => {
          request.destroy();
          resolve({
            success: false,
            message: 'ShadeCommander request timeout'
          });
        });
        
        request.write(postData);
        request.end();
      });
    } catch (error) {
      return {
        success: false,
        message: `Error calling ShadeCommander: ${error.message}`
      };
    }
  }

  /**
   * Schedule wake up alarm if enabled
   */
  scheduleWakeUp() {
    try {
      logger.debug('🔍 [WAKE_UP_DEBUG] scheduleWakeUp() method called');
      
      const wakeUpConfig = this.getWakeUpConfig();
      logger.debug(`🔍 [WAKE_UP_DEBUG] Wake up config: ${JSON.stringify(wakeUpConfig)}`);
      
      if (!wakeUpConfig.enabled || !wakeUpConfig.time) {
        logger.info('❌ [WAKE_UP_DEBUG] Wake up alarm not set - skipping morning scenes');
        logger.debug(`🔍 [WAKE_UP_DEBUG] Enabled: ${wakeUpConfig.enabled}, Time: ${wakeUpConfig.time}`);
        return;
      }
      
      logger.debug('✅ [WAKE_UP_DEBUG] Wake up is enabled and has time set');
      
      // Check home/away status
      const homeStatus = this.isHomeStatusActive();
      logger.debug(`🔍 [WAKE_UP_DEBUG] Home status check: ${homeStatus}`);
      
      if (!homeStatus) {
        logger.info('❌ [WAKE_UP_DEBUG] Wake up alarm skipped - status is away');
        return;
      }
      
      logger.debug('✅ [WAKE_UP_DEBUG] Home status is active, proceeding with scheduling');
      
      // Parse wake up time - schedule for next occurrence (today if future, tomorrow if past)
      const [hours, minutes] = wakeUpConfig.time.split(':').map(Number);
      logger.debug(`🔍 [WAKE_UP_DEBUG] Parsed time: hours=${hours}, minutes=${minutes}`);
      
      const now = new Date();
      logger.debug(`🔍 [WAKE_UP_DEBUG] Current UTC time: ${now.toISOString()}`);
      
      // Get current time in Mountain Time for comparison
      const nowMT = this.timezoneManager.toUserTime(now);
      const currentMTHour = nowMT.getHours();
      const currentMTMinute = nowMT.getMinutes();
      logger.debug(`🔍 [WAKE_UP_DEBUG] Current MT time: ${currentMTHour}:${currentMTMinute.toString().padStart(2, '0')}`);
      
      // Both times need to be compared in the same timezone (Mountain Time)
      // Config time (hours:minutes) is already in Mountain Time
      // Current time (currentMTHour:currentMTMinute) is also in Mountain Time
      const wakeUpMinutesFromMidnight = hours * 60 + minutes;
      const currentMinutesFromMidnight = currentMTHour * 60 + currentMTMinute;
      logger.debug(`🔍 [WAKE_UP_DEBUG] Wake up minutes from midnight (MT): ${wakeUpMinutesFromMidnight} (${hours}:${minutes.toString().padStart(2, '0')})`);
      logger.debug(`🔍 [WAKE_UP_DEBUG] Current minutes from midnight (MT): ${currentMinutesFromMidnight} (${currentMTHour}:${currentMTMinute.toString().padStart(2, '0')})`);
      
      if (wakeUpMinutesFromMidnight > currentMinutesFromMidnight) {
        // Wake up time is later today - schedule for today
        logger.info(`✅ [WAKE_UP_DEBUG] Scheduling wake up for today at ${wakeUpConfig.time} MT`);
      } else {
        // Wake up time has passed today - check if it was recently missed
        const minutesSinceMissed = currentMinutesFromMidnight - wakeUpMinutesFromMidnight;
        logger.info(`⏰ [WAKE_UP_DEBUG] Wake up time ${wakeUpConfig.time} MT has passed today by ${minutesSinceMissed} minutes`);
        
        // Check if this was a recently missed alarm (within 60 minutes) and wasn't already triggered
        const wasRecentlyMissed = minutesSinceMissed <= 60;
        const wasAlreadyTriggered = wakeUpConfig.last_triggered && 
          new Date(wakeUpConfig.last_triggered).toDateString() === now.toDateString();
        
        if (wasRecentlyMissed && !wasAlreadyTriggered) {
          logger.warn(`🚨 [WAKE_UP_DEBUG] MISSED ALARM DETECTED! Wake up was ${minutesSinceMissed} minutes ago, triggering recovery`);
          
          // Create UTC Date objects for both times to avoid timezone mixing
          // Convert the wake-up time (MT) to UTC for consistent comparison
          const wakeUpTimeUTC = this.timezoneManager.toUTC(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`, now);
          
          // Trigger missed alarm recovery with both times in UTC
          this.handleMissedAlarm(wakeUpTimeUTC, now);
          return; // Don't schedule for tomorrow since we're handling the missed alarm
        } else {
          if (wasAlreadyTriggered) {
            logger.info(`✅ [WAKE_UP_DEBUG] Wake up was already triggered today, scheduling for tomorrow`);
          } else {
            logger.info(`⏰ [WAKE_UP_DEBUG] Wake up was too long ago (${minutesSinceMissed} min), scheduling for tomorrow`);
          }
        }
      }
      
      // Generate cron expression
      const riseNShineCron = `${minutes} ${hours} * * *`;
      logger.debug(`🔍 [WAKE_UP_DEBUG] Generated cron expression: "${riseNShineCron}"`);
      
      // Validate cron expression format
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        logger.error(`❌ [WAKE_UP_DEBUG] Invalid time format: hours=${hours}, minutes=${minutes}`);
        return;
      }
      
      logger.debug('✅ [WAKE_UP_DEBUG] Cron expression validated, proceeding to schedule');
      
      // Get timezone configuration
      const timezone = this.timezoneManager.getCronTimezone();
      logger.debug(`🔍 [WAKE_UP_DEBUG] Using timezone: ${timezone}`);
      
      logger.debug('🔍 [WAKE_UP_DEBUG] About to call cron.schedule()...');
      
      // Schedule Rise'n'Shine at wake up time (use original hours/minutes for cron)
      const riseNShineJob = cron.schedule(riseNShineCron, () => {
        logger.info('🚨 [WAKE_UP_DEBUG] CRON JOB TRIGGERED! Executing wake up sequence...');
        this.executeWakeUpSequence();
      }, {
        scheduled: true,
        timezone: this.timezoneManager.getCronTimezone()
      });
      
      logger.debug('🔍 [WAKE_UP_DEBUG] cron.schedule() returned, checking result...');
      logger.debug(`🔍 [WAKE_UP_DEBUG] Cron job object type: ${typeof riseNShineJob}`);
      logger.debug(`🔍 [WAKE_UP_DEBUG] Cron job object created: ${riseNShineJob ? 'SUCCESS' : 'FAILED'}`);
      
      if (!riseNShineJob) {
        logger.error('❌ [WAKE_UP_DEBUG] cron.schedule() returned null/undefined!');
        return;
      }
      
      logger.debug('✅ [WAKE_UP_DEBUG] Cron job created successfully, adding to scheduledJobs map');
      
      // Check current scheduledJobs size before adding
      const beforeSize = this.scheduledJobs.size;
      logger.debug(`🔍 [WAKE_UP_DEBUG] scheduledJobs size before adding: ${beforeSize}`);
      
      this.scheduledJobs.set('rise_n_shine', riseNShineJob);
      
      // Check size after adding
      const afterSize = this.scheduledJobs.size;
      logger.debug(`🔍 [WAKE_UP_DEBUG] scheduledJobs size after adding: ${afterSize}`);
      
      if (afterSize <= beforeSize) {
        logger.error('❌ [WAKE_UP_DEBUG] scheduledJobs.set() failed to increase map size!');
      } else {
        logger.debug('✅ [WAKE_UP_DEBUG] Successfully added cron job to scheduledJobs map');
      }
      
      // Verify the job was stored
      const storedJob = this.scheduledJobs.get('rise_n_shine');
      logger.debug(`🔍 [WAKE_UP_DEBUG] Retrieved stored job: ${storedJob ? 'EXISTS' : 'NULL'}`);
      
      logger.info(`✅ [WAKE_UP_DEBUG] Scheduled wake up sequence at ${wakeUpConfig.time} (Rise'n'Shine → Good Morning)`);
      logger.info(`✅ [WAKE_UP_DEBUG] Total scheduled jobs: ${this.scheduledJobs.size}`);
      
      // List all scheduled jobs for debugging
      logger.debug('🔍 [WAKE_UP_DEBUG] All scheduled jobs:');
      for (const [name, job] of this.scheduledJobs) {
        logger.debug(`🔍 [WAKE_UP_DEBUG] - ${name}: ${job ? 'ACTIVE' : 'NULL'}`);
      }
      
    } catch (error) {
      logger.error(`❌ [WAKE_UP_DEBUG] Failed to schedule wake up alarm: ${error.message}`);
      logger.error(`❌ [WAKE_UP_DEBUG] Error stack: ${error.stack}`);
    }
  }

  /**
   * Handle missed alarm scenarios (server was down during alarm time)
   */
  handleMissedAlarm(alarmTime, currentTime) {
    try {
      const wakeUpConfig = this.getWakeUpConfig();
      
      // Check if this alarm was actually missed (never triggered)
      const wasMissed = !wakeUpConfig.last_triggered || 
                       new Date(wakeUpConfig.last_triggered).toDateString() !== alarmTime.toDateString();
      
      if (wasMissed) {
        // Convert both times to UTC for accurate comparison
        const currentTimeUTC = new Date(currentTime).getTime();
        const alarmTimeUTC = new Date(alarmTime).getTime();
        const timeSinceMissed = Math.floor((currentTimeUTC - alarmTimeUTC) / (1000 * 60)); // minutes
        
        logger.warn(`🚨 MISSED ALARM DETECTED! Alarm was set for ${wakeUpConfig.time}, missed by ${timeSinceMissed} minutes`);
        
        // Recovery options based on how long ago the alarm was missed
        if (timeSinceMissed <= 60) { // Within 1 hour
          logger.info('Missed alarm within 1 hour - triggering immediate wake up sequence');
          this.executeWakeUpSequence();
        } else if (timeSinceMissed <= 180) { // Within 3 hours  
          logger.info('Missed alarm within 3 hours - triggering Rise\'n\'Shine only (skip Good Morning)');
          this.executeScene('rise_n_shine');
          this.markWakeUpTriggered();
        } else {
          logger.warn('Missed alarm too long ago (>3 hours) - logging and resetting for next day');
          this.markWakeUpTriggered();
        }
        
        // Log missed alarm for monitoring/debugging
        this.lastExecutedScene = {
          name: 'missed_alarm_recovery',
          timestamp: currentTime,
          success: true,
          message: `Missed alarm recovered: ${timeSinceMissed} minutes late`
        };
        
      } else {
        logger.info(`Wake up time ${wakeUpConfig.time} has already passed today - skipping`);
      }
      
    } catch (error) {
      logger.error(`Error handling missed alarm: ${error.message}`);
    }
  }

  /**
   * Execute wake up sequence: Rise'n'Shine → 15 min delay → Good Morning
   */
  async executeWakeUpSequence() {
    try {
      logger.info('Starting wake up sequence...');
      
      // Check home/away status again (in case it changed)
      if (!this.isHomeStatusActive()) {
        logger.info('Wake up sequence skipped - status is away');
        return;
      }
      
      // 1. Execute Rise'n'Shine scene
      const riseResult = await this.executeScene('rise_n_shine');
      
      if (riseResult.success) {
        logger.info('Rise\'n\'Shine scene executed successfully');
      } else {
        logger.error(`Rise'n'Shine scene failed: ${riseResult.message}`);
      }
      
      // 2. Schedule Good Morning for +15 minutes (or custom delay)
      const delayMinutes = this.getWakeUpConfig().good_morning_delay_minutes || 15;
      const delayMs = delayMinutes * 60 * 1000;
      
      logger.info(`Scheduling Good Morning scene in ${delayMinutes} minutes...`);
      
      // Schedule Good Morning as a one-time cron job instead of setTimeout for better reliability
      const goodMorningTime = new Date(Date.now() + delayMs);
      const goodMorningUserTime = this.timezoneManager.toUserTime(goodMorningTime);
      const goodMorningCron = `${goodMorningUserTime.getMinutes()} ${goodMorningUserTime.getHours()} ${goodMorningUserTime.getDate()} ${goodMorningUserTime.getMonth() + 1} *`;
      
      const goodMorningJob = cron.schedule(goodMorningCron, async () => {
        try {
          logger.info('Good Morning scene triggered by cron job');
          
          // Check home/away status again before Good Morning
          if (!this.isHomeStatusActive()) {
            logger.info('Good Morning scene skipped - status is away');
            return;
          }
          
          const morningResult = await this.executeScene('good_morning');
          
          if (morningResult.success) {
            logger.info('Good Morning scene executed successfully');
          } else {
            logger.error(`Good Morning scene failed: ${morningResult.message}`);
          }
          
          logger.info('Wake up sequence completed');
          
          // Clean up the one-time job
          if (this.scheduledJobs.has('good_morning_wakeup')) {
            this.scheduledJobs.get('good_morning_wakeup').stop();
            this.scheduledJobs.delete('good_morning_wakeup');
          }
        } catch (error) {
          logger.error(`Error during Good Morning execution: ${error.message}`);
        }
      }, {
        scheduled: true,
        timezone: this.timezoneManager.getCronTimezone()
      });
      
      this.scheduledJobs.set('good_morning_wakeup', goodMorningJob);
      
      // 3. Mark alarm as triggered and disable
      this.markWakeUpTriggered();
      
    } catch (error) {
      logger.error(`Wake up sequence failed: ${error.message}`);
    }
  }

  /**
   * Mark wake up alarm as triggered and disable it
   */
  markWakeUpTriggered() {
    try {
      // Update config to disable alarm and record trigger time
      this.schedulerConfig.wake_up.enabled = false;
      this.schedulerConfig.wake_up.last_triggered = new Date().toISOString();
      
      // Save config to file
      this.saveSchedulerConfig();
      
      // Remove from scheduled jobs
      if (this.scheduledJobs.has('rise_n_shine')) {
        this.scheduledJobs.get('rise_n_shine').stop();
        this.scheduledJobs.delete('rise_n_shine');
      }
      
      logger.info('Wake up alarm triggered and reset - alarm disabled until manually set again');
      
    } catch (error) {
      logger.error(`Failed to mark wake up as triggered: ${error.message}`);
    }
  }

  /**
   * Handle dynamic Good Morning rescheduling when delay changes
   */
  async handleGoodMorningDelayChange(oldConfig, newConfig) {
    try {
      const wakeUpConfig = this.getWakeUpConfig();
      
      // Only reschedule if wake-up was triggered today and there's an active Good Morning job
      if (!wakeUpConfig.last_triggered) {
        logger.debug('No wake-up triggered recently, skipping Good Morning rescheduling');
        return;
      }
      
      const lastTriggered = new Date(wakeUpConfig.last_triggered);
      const now = new Date();
      const wasTriggeredToday = lastTriggered.toDateString() === now.toDateString();
      
      if (!wasTriggeredToday) {
        logger.debug('Wake-up was not triggered today, skipping Good Morning rescheduling');
        return;
      }
      
      // Check if there's currently a Good Morning job scheduled
      if (!this.scheduledJobs.has('good_morning_wakeup')) {
        logger.debug('No active Good Morning job found, skipping rescheduling');
        return;
      }
      
      const oldDelay = oldConfig.wake_up?.good_morning_delay_minutes || 15;
      const newDelay = newConfig.wake_up?.good_morning_delay_minutes || 15;
      
      logger.info(`Rescheduling Good Morning: delay changed from ${oldDelay} to ${newDelay} minutes`);
      
      // Cancel the existing Good Morning job
      const existingJob = this.scheduledJobs.get('good_morning_wakeup');
      existingJob.stop();
      this.scheduledJobs.delete('good_morning_wakeup');
      
      // Calculate new Good Morning time based on actual trigger time + new delay
      const newGoodMorningTime = new Date(lastTriggered.getTime() + (newDelay * 60 * 1000));
      
      // Only reschedule if the new time is still in the future
      if (newGoodMorningTime > now) {
        const goodMorningUserTime = this.timezoneManager.toUserTime(newGoodMorningTime);
        const goodMorningCron = `${goodMorningUserTime.getMinutes()} ${goodMorningUserTime.getHours()} ${goodMorningUserTime.getDate()} ${goodMorningUserTime.getMonth() + 1} *`;
        
        const newGoodMorningJob = cron.schedule(goodMorningCron, async () => {
          try {
            logger.info('Good Morning scene triggered by rescheduled cron job');
            
            if (!this.isHomeStatusActive()) {
              logger.info('Good Morning scene skipped - status is away');
              return;
            }
            
            const morningResult = await this.executeScene('good_morning');
            
            if (morningResult.success) {
              logger.info('Good Morning scene executed successfully');
            } else {
              logger.error(`Good Morning scene failed: ${morningResult.message}`);
            }
            
            logger.info('Wake up sequence completed');
            
            // Clean up the job
            if (this.scheduledJobs.has('good_morning_wakeup')) {
              this.scheduledJobs.get('good_morning_wakeup').stop();
              this.scheduledJobs.delete('good_morning_wakeup');
            }
          } catch (error) {
            logger.error(`Error during rescheduled Good Morning execution: ${error.message}`);
          }
        }, {
          scheduled: true,
          timezone: this.timezoneManager.getCronTimezone()
        });
        
        this.scheduledJobs.set('good_morning_wakeup', newGoodMorningJob);
        logger.info(`Good Morning rescheduled for ${this.timezoneManager.formatForDisplay(newGoodMorningTime, 'datetime')}`);
      } else {
        logger.info(`New Good Morning time ${this.timezoneManager.formatForDisplay(newGoodMorningTime, 'datetime')} has already passed, not rescheduling`);
      }
      
    } catch (error) {
      logger.error(`Failed to handle Good Morning delay change: ${error.message}`);
    }
  }

  /**
   * Get wake up configuration
   */
  getWakeUpConfig() {
    return this.schedulerConfig.wake_up || {
      enabled: false,
      time: null,
      last_triggered: null,
      good_morning_delay_minutes: 15
    };
  }

  /**
   * Clear wake up scheduled jobs
   */
  clearWakeUpSchedules() {
    const wakeUpJobs = ['rise_n_shine', 'good_morning_wakeup'];
    
    for (const jobName of wakeUpJobs) {
      if (this.scheduledJobs.has(jobName)) {
        this.scheduledJobs.get(jobName).stop();
        this.scheduledJobs.delete(jobName);
        logger.debug(`Stopped wake up job: ${jobName}`);
      }
    }
  }

  /**
   * Save scheduler configuration to file
   */
  saveSchedulerConfig() {
    try {
      fs.writeFileSync(this.schedulerConfigPath, JSON.stringify(this.schedulerConfig, null, 2));
      logger.debug('Scheduler configuration saved to file');
    } catch (error) {
      logger.error(`Failed to save scheduler config: ${error.message}`);
    }
  }

  /**
   * Get next wake up time
   */
  getNextWakeUpTime() {
    const wakeUpConfig = this.getWakeUpConfig();
    
    if (!wakeUpConfig.enabled || !wakeUpConfig.time) {
      return null;
    }
    
    // Format the user's configured time directly as a display string
    const [hours, minutes] = wakeUpConfig.time.split(':').map(Number);
    const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const minuteStr = minutes.toString().padStart(2, '0');
    return `${hour12}:${minuteStr} ${ampm}`;
  }

  /**
   * Check if wake up is enabled
   */
  isWakeUpEnabled() {
    const wakeUpConfig = this.getWakeUpConfig();
    return wakeUpConfig.enabled && wakeUpConfig.time !== null;
  }

  /**
   * Get last wake up triggered time
   */
  getLastWakeUpTime() {
    const wakeUpConfig = this.getWakeUpConfig();
    
    if (wakeUpConfig.last_triggered) {
      return this.timezoneManager.formatForDisplay(new Date(wakeUpConfig.last_triggered), 'datetime');
    }
    
    return null;
  }

  /**
   * Clear all scheduled jobs
   */
  clearAllSchedules() {
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      logger.debug(`Stopped scheduled job: ${name}`);
    }
    this.scheduledJobs.clear();
  }

  /**
   * Cleanup method for service shutdown
   */
  cleanup() {
    try {
      logger.info('SchedulerService cleanup initiated');
      
      // Stop configuration file watcher
      this.stopConfigWatcher();
      
      // Clear all scheduled jobs
      this.clearAllSchedules();
      
      // Clear caches
      this.sunsetCache.clear();
      
      this.isInitialized = false;
      logger.info('SchedulerService cleanup completed');
    } catch (error) {
      logger.error(`SchedulerService cleanup failed: ${error.message}`);
    }
  }

  /**
   * Get next scheduled scene
   */
  getNextScheduledScene() {
    try {
      const now = new Date();
      const times = this.nextSceneTimes;
      const wakeUpConfig = this.getWakeUpConfig();
      
      // Build list of upcoming scenes - only include if scheduled job exists
      const sceneTimes = [];
      
      // Check Good Afternoon - daily recurring job with name 'good_afternoon'
      if (times.good_afternoon && this.scheduledJobs.has('good_afternoon')) {
        sceneTimes.push({ name: 'Good Afternoon', time: times.good_afternoon });
      }
      
      // Check Good Evening - job name is 'good_evening_today' 
      if (times.good_evening && this.scheduledJobs.has('good_evening_today')) {
        sceneTimes.push({ name: 'Good Evening', time: times.good_evening });
      }
      
      // Check Good Night - job name is 'good_night_today'
      if (times.good_night && this.scheduledJobs.has('good_night_today')) {
        sceneTimes.push({ name: 'Good Night', time: times.good_night });
      }
      
      // Add wake up time if enabled
      if (wakeUpConfig.enabled && wakeUpConfig.time) {
        const [hours, minutes] = wakeUpConfig.time.split(':').map(Number);
        const wakeUpTime = new Date();
        wakeUpTime.setHours(hours, minutes, 0, 0);
        
        // If wake up time hasn't passed today, add it for tomorrow if needed
        let targetWakeUpTime = wakeUpTime;
        if (wakeUpTime <= now) {
          targetWakeUpTime = new Date(wakeUpTime);
          targetWakeUpTime.setDate(targetWakeUpTime.getDate() + 1);
        }
        
        sceneTimes.push({ name: 'Wake Up (Rise\'n\'Shine)', time: targetWakeUpTime });
        
        // Also add Good Morning time (Wake Up + delay)
        const delayMinutes = wakeUpConfig.good_morning_delay_minutes || 15;
        const goodMorningTime = new Date(targetWakeUpTime.getTime() + (delayMinutes * 60 * 1000));
        sceneTimes.push({ name: 'Good Morning', time: goodMorningTime });
      }
      
      // Check if Good Morning is still pending today (even if wake up was triggered and disabled)
      if (!wakeUpConfig.enabled && wakeUpConfig.last_triggered && wakeUpConfig.time) {
        const lastTriggered = new Date(wakeUpConfig.last_triggered);
        
        // Get user timezone times for comparison
        const nowUserTime = this.timezoneManager.toUserTime(now);
        const lastTriggeredUserTime = this.timezoneManager.toUserTime(lastTriggered);
        
        // Check if wake up was triggered today in user timezone
        if (lastTriggeredUserTime.toDateString() === nowUserTime.toDateString()) {
          const delayMinutes = wakeUpConfig.good_morning_delay_minutes || 15;
          
          // Calculate Good Morning time based on actual trigger time
          const goodMorningTime = new Date(lastTriggered.getTime() + (delayMinutes * 60 * 1000));
          
          // Only add if it hasn't happened yet
          if (goodMorningTime > now) {
            sceneTimes.push({ name: 'Good Morning', time: goodMorningTime });
          }
        }
      }
      
      // Filter and sort upcoming scenes
      const upcomingScenes = sceneTimes
        .filter(scene => scene.time && scene.time > now)
        .sort((a, b) => a.time - b.time);
      
      if (upcomingScenes.length > 0) {
        const next = upcomingScenes[0];
        // For Good Afternoon and Good Morning, convert to user timezone for display
        // For wake up (system timezone times), format directly  
        // For sun-based times (evening, night), use timezone manager
        if (next.name.includes('Good Afternoon') || next.name.includes('Good Morning')) {
          const userTime = this.timezoneManager.toUserTime(next.time);
          const [h, m] = [userTime.getHours(), userTime.getMinutes()];
          const hour12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const minuteStr = m.toString().padStart(2, '0');
          return `${next.name} at ${hour12}:${minuteStr} ${ampm}`;
        } else if (next.name.includes('Wake Up')) {
          const [h, m] = [next.time.getHours(), next.time.getMinutes()];
          const hour12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const minuteStr = m.toString().padStart(2, '0');
          return `${next.name} at ${hour12}:${minuteStr} ${ampm}`;
        } else {
          return `${next.name} at ${this.timezoneManager.formatForDisplay(next.time)}`;
        }
      }
      
      return 'Next scenes calculated at midnight';
    } catch (error) {
      return 'Scene calculation pending';
    }
  }

  /**
   * Health check for ServiceRegistry
   */
  async healthCheck() {
    const uptime = process.uptime();
    const status = this.isInitialized ? 'ok' : 'initializing';
    
    return {
      status,
      message: this.lastError || `Scheduler active, next: ${this.getNextScheduledScene()}`,
      uptime: Math.floor(uptime),
      metrics: {
        scheduledJobs: this.scheduledJobs.size,
        homeAwayStatus: this.configManager.get('homeStatus.status', 'home'),
        lastExecutedScene: this.lastExecutedScene,
        nextSceneTimes: Object.keys(this.nextSceneTimes).reduce((acc, key) => {
          if (key === 'good_afternoon_display') {
            acc['good_afternoon'] = this.nextSceneTimes[key];
          } else if (key !== 'good_afternoon') {
            acc[key] = this.nextSceneTimes[key] ? this.timezoneManager.formatForDisplay(this.nextSceneTimes[key]) : null;
          }
          return acc;
        }, {}),
        sunsetCacheSize: this.sunsetCache.size,
        wakeUpEnabled: this.isWakeUpEnabled(),
        nextWakeUpTime: this.getNextWakeUpTime(),
        lastWakeUpTriggered: this.getLastWakeUpTime()
      }
    };
  }

  /**
   * Recovery procedure for ServiceWatchdog
   */
  async recoveryProcedure() {
    try {
      logger.warn('SchedulerService recovery procedure initiated');
      
      // Stop config watcher first
      this.stopConfigWatcher();
      
      // Clear all schedules and reinitialize
      this.clearAllSchedules();
      this.isInitialized = false;
      
      // Reinitialize the service
      await this.initialize();
      
      logger.info('SchedulerService recovery completed');
      return true;
    } catch (error) {
      logger.error(`SchedulerService recovery failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get home/away status
   */
  getHomeAwayStatus() {
    return this.configManager.getCurrentHomeStatus();
  }

  /**
   * Start configuration file watcher
   */
  startConfigWatcher() {
    try {
      if (this.configWatcher) {
        logger.debug('Config watcher already exists, stopping it first');
        this.stopConfigWatcher();
      }

      logger.info(`Starting configuration file watcher for: ${this.schedulerConfigPath}`);
      
      this.configWatcher = chokidar.watch(this.schedulerConfigPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,  // Wait 500ms for file writes to finish
          pollInterval: 100
        }
      });

      this.configWatcher.on('change', (filePath) => {
        logger.info(`Configuration file changed: ${filePath}`);
        this.debouncedReloadConfig();
      });

      this.configWatcher.on('error', (error) => {
        logger.error(`Configuration file watcher error: ${error.message}`);
      });

      logger.info('Configuration file watcher started successfully');
    } catch (error) {
      logger.error(`Failed to start configuration file watcher: ${error.message}`);
    }
  }

  /**
   * Stop configuration file watcher
   */
  stopConfigWatcher() {
    if (this.configWatcher) {
      try {
        this.configWatcher.close();
        this.configWatcher = null;
        logger.info('Configuration file watcher stopped');
      } catch (error) {
        logger.error(`Error stopping configuration file watcher: ${error.message}`);
      }
    }

    // Clear any pending reload timer
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
      this.reloadDebounceTimer = null;
    }
  }

  /**
   * Debounced configuration reload to avoid multiple rapid reloads
   */
  debouncedReloadConfig() {
    // Clear any existing timer
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }

    // Set new timer for 1 second delay
    this.reloadDebounceTimer = setTimeout(async () => {
      try {
        await this.reloadConfigurationAndReschedule();
      } catch (error) {
        logger.error(`Debounced config reload failed: ${error.message}`);
      } finally {
        this.reloadDebounceTimer = null;
      }
    }, 1000);

    logger.debug('Configuration reload debounced for 1 second');
  }

  /**
   * Reload configuration and reschedule jobs
   */
  async reloadConfigurationAndReschedule() {
    try {
      logger.info('Reloading scheduler configuration and rescheduling jobs...');
      
      const oldConfig = JSON.parse(JSON.stringify(this.schedulerConfig)); // Deep copy for comparison
      
      // Reload configuration from file
      const newConfig = this.loadSchedulerConfig();
      
      // Validate the new configuration
      if (!this.validateConfiguration(newConfig)) {
        logger.error('New configuration is invalid, keeping existing configuration');
        return false;
      }
      
      // Compare configurations to see what changed
      const changes = this.detectConfigChanges(oldConfig, newConfig);
      
      if (changes.length === 0) {
        logger.info('No significant configuration changes detected');
        return true;
      }
      
      logger.info(`Configuration changes detected: ${changes.join(', ')}`);
      
      // Update configuration
      this.schedulerConfig = newConfig;
      
      // Handle dynamic Good Morning rescheduling if delay changed
      if (changes.some(change => change.includes('good_morning_delay_minutes'))) {
        await this.handleGoodMorningDelayChange(oldConfig, newConfig);
      }
      
      // Recalculate scene times if needed
      if (changes.some(change => change.includes('scene') || change.includes('offset'))) {
        await this.calculateSceneTimes();
      }
      
      // Reschedule all jobs
      await this.scheduleAllScenes();
      
      logger.info('Configuration reloaded and jobs rescheduled successfully');
      return true;
      
    } catch (error) {
      logger.error(`Failed to reload configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate configuration structure
   */
  validateConfiguration(config) {
    try {
      // Basic structure validation
      if (!config || typeof config !== 'object') {
        logger.error('Configuration is not a valid object');
        return false;
      }
      
      // Check required sections exist
      if (!config.scenes || typeof config.scenes !== 'object') {
        logger.error('Configuration missing scenes section');
        return false;
      }
      
      // Validate scene time format
      if (config.scenes.good_afternoon_time && 
          !/^\d{2}:\d{2}$/.test(config.scenes.good_afternoon_time)) {
        logger.error('Invalid good_afternoon_time format, must be HH:MM');
        return false;
      }
      
      // Validate offsets are numbers
      if (config.scenes.good_evening_offset_minutes !== undefined && 
          typeof config.scenes.good_evening_offset_minutes !== 'number') {
        logger.error('good_evening_offset_minutes must be a number');
        return false;
      }
      
      if (config.scenes.good_night_offset_minutes !== undefined && 
          typeof config.scenes.good_night_offset_minutes !== 'number') {
        logger.error('good_night_offset_minutes must be a number');
        return false;
      }
      
      logger.debug('Configuration validation passed');
      return true;
      
    } catch (error) {
      logger.error(`Configuration validation error: ${error.message}`);
      return false;
    }
  }

  /**
   * Detect what changed between old and new configuration
   */
  detectConfigChanges(oldConfig, newConfig) {
    const changes = [];
    
    try {
      // Check scene changes
      if (oldConfig.scenes?.good_afternoon_time !== newConfig.scenes?.good_afternoon_time) {
        changes.push(`good_afternoon_time: ${oldConfig.scenes?.good_afternoon_time} → ${newConfig.scenes?.good_afternoon_time}`);
      }
      
      if (oldConfig.scenes?.good_evening_offset_minutes !== newConfig.scenes?.good_evening_offset_minutes) {
        changes.push(`good_evening_offset_minutes: ${oldConfig.scenes?.good_evening_offset_minutes} → ${newConfig.scenes?.good_evening_offset_minutes}`);
      }
      
      if (oldConfig.scenes?.good_night_offset_minutes !== newConfig.scenes?.good_night_offset_minutes) {
        changes.push(`good_night_offset_minutes: ${oldConfig.scenes?.good_night_offset_minutes} → ${newConfig.scenes?.good_night_offset_minutes}`);
      }
      
      // Check wake up changes
      if (oldConfig.wake_up?.enabled !== newConfig.wake_up?.enabled) {
        changes.push(`wake_up.enabled: ${oldConfig.wake_up?.enabled} → ${newConfig.wake_up?.enabled}`);
      }
      
      if (oldConfig.wake_up?.time !== newConfig.wake_up?.time) {
        changes.push(`wake_up.time: ${oldConfig.wake_up?.time} → ${newConfig.wake_up?.time}`);
      }
      
      if (oldConfig.wake_up?.good_morning_delay_minutes !== newConfig.wake_up?.good_morning_delay_minutes) {
        changes.push(`wake_up.good_morning_delay_minutes: ${oldConfig.wake_up?.good_morning_delay_minutes} → ${newConfig.wake_up?.good_morning_delay_minutes}`);
      }
      
      // Check music changes
      if (oldConfig.music?.enabled_for_morning !== newConfig.music?.enabled_for_morning) {
        changes.push(`music.enabled_for_morning: ${oldConfig.music?.enabled_for_morning} → ${newConfig.music?.enabled_for_morning}`);
      }
      
      if (oldConfig.music?.enabled_for_evening !== newConfig.music?.enabled_for_evening) {
        changes.push(`music.enabled_for_evening: ${oldConfig.music?.enabled_for_evening} → ${newConfig.music?.enabled_for_evening}`);
      }
      
    } catch (error) {
      logger.error(`Error detecting configuration changes: ${error.message}`);
    }
    
    return changes;
  }

  /**
   * Reload configuration (existing method - enhanced)
   */
  async reloadConfig() {
    return await this.reloadConfigurationAndReschedule();
  }
}

module.exports = SchedulerService;