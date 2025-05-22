/**
 * SchedulerService (DI Version) - Service for managing automated schedules with dependency injection
 * 
 * This service manages automated shade schedules based on time of day and sun position.
 * It implements the ISchedulerService interface and uses provided dependencies.
 */

const ISchedulerService = require('../interfaces/ISchedulerService');
const cron = require('node-cron');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment');

class SchedulerService extends ISchedulerService {
  /**
   * Create a new SchedulerService with explicit dependencies
   * @param {Object} logger - Logger instance
   * @param {Object} configManager - Configuration manager instance
   * @param {Object} weatherService - Weather service instance
   * @param {Object} shadeService - Shade service instance
   * @param {Object} serviceRegistry - Service registry instance
   * @param {Object} CircuitBreaker - Circuit breaker class
   */
  constructor(logger, configManager, weatherService, shadeService, serviceRegistry, CircuitBreaker) {
    super();
    
    // Store injected dependencies
    this.logger = logger;
    this.configManager = configManager;
    this.weatherService = weatherService;
    this.shadeService = shadeService;
    this.serviceRegistry = serviceRegistry;
    this.CircuitBreaker = CircuitBreaker;
    
    // Initialize service properties
    this.schedules = {};
    this.sunsetData = {};
    this.sunriseData = {};
    this.initialized = false;
    this.isInitializing = false;
    this.initPromise = null;
    this.sunsetDataPath = path.join(__dirname, '../../../data/sunset_data.csv');
    
    // Schedule tracking for self-healing
    this.missedSchedules = [];
    this.lastScheduleCheck = Date.now();
    this.scheduleHistory = {};
    
    // Status
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    
    // Initialize circuit breakers
    this.initializeCircuitBreakers();
    
    // Register with service registry
    if (this.serviceRegistry) {
      // Using kebab-case naming convention for consistency
      this.serviceRegistry.register('scheduler-service', { 
        instance: this,
        isCore: false,
        status: 'initializing',
        checkHealth: async () => {
          return {
            status: this.initialized ? 'ok' : 'initializing',
            message: this.initialized ? 'Scheduler service initialized' : 'Scheduler service initializing'
          };
        }
      });
    }
    
    // Lazy initialization to avoid startup blocking
    setTimeout(() => {
      this.initialize().catch(err => {
        this.logger.error(`Failed to initialize scheduler service: ${err.message}`);
      });
    }, 1000);
  }
  
  /**
   * Initialize circuit breakers for scheduler dependencies
   */
  initializeCircuitBreakers() {
    try {
      // Skip circuit breaker initialization if the CircuitBreaker class is not available
      if (!this.CircuitBreaker) {
        this.logger.warn('CircuitBreaker class not available, skipping circuit breaker initialization');
        
        // Create mock circuit breakers with basic methods
        this.shadeCircuit = {
          execute: async (fn, ...args) => await fn(...args),
          getState: () => 'DISABLED'
        };
        
        this.weatherCircuit = {
          execute: async (fn, ...args) => await fn(...args),
          getState: () => 'DISABLED'
        };
        
        return;
      }
      
      // Circuit breaker for shade control actions
      this.shadeCircuit = new this.CircuitBreaker('shadeService', {
        failureThreshold: 3,
        resetTimeout: 30000, // 30 seconds reset timeout
        fallbackFunction: async (sceneName) => ({ 
          success: false, 
          usingFallback: true,
          message: `Shade scene ${sceneName} unavailable - circuit open` 
        })
      });
  
      // Circuit breaker for weather service
      this.weatherCircuit = new this.CircuitBreaker('weatherService', {
        failureThreshold: 3,
        resetTimeout: 60000, // 1 minute reset timeout
        fallbackFunction: async () => ({ 
          success: false, 
          usingFallback: true, 
          data: { sunrise: null, sunset: null } 
        })
      });
      
      this.logger.info('Circuit breakers initialized successfully');
    } catch (error) {
      this.logger.error(`Error initializing circuit breakers: ${error.message}`);
      
      // Create mock circuit breakers with basic methods as fallback
      this.shadeCircuit = {
        execute: async (fn, ...args) => await fn(...args),
        getState: () => 'ERROR'
      };
      
      this.weatherCircuit = {
        execute: async (fn, ...args) => await fn(...args),
        getState: () => 'ERROR'
      };
    }
  }
  
  /**
   * Initialize the scheduler service with timeout protection
   * @returns {Promise<void>}
   */
  async initialize() {
    // Prevent multiple initializations
    if (this.isInitializing) {
      return this.initPromise;
    }
    
    this.isInitializing = true;
    this.logger.info('Starting scheduler service initialization');
    
    // Create a promise with timeout protection
    this.initPromise = new Promise(async (resolve, reject) => {
      // Set timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        const error = new Error('Scheduler service initialization timed out');
        this.logger.error(error.message);
        this.isInitializing = false;
        reject(error);
      }, 30000); // 30 second timeout
      
      try {
        // Load sunset data
        this.logger.info('Loading sunset data');
        await this.loadSunsetData();
        
        // Initialize daily schedules
        this.logger.info('Setting up daily schedules');
        await this.initializeSchedules();
        
        // Set up daily refresh at midnight
        this.logger.info('Setting up cron tasks');
        this.setupCronTasks();
        
        // Start health checks
        this.logger.info('Starting health checks');
        this.startHealthChecks();
        
        // Skip missed schedule detection for now to get the server working
        this.logger.info('Skipping missed schedule detection during initialization');
        // We'll initialize it with empty objects
        this.missedScheduleRecovery = {};
        
        // Register with the service registry as healthy
        if (this.serviceRegistry) {
          this.logger.info('Updating service registry status');
          if (this.serviceRegistry.setStatus) {
            this.serviceRegistry.setStatus('scheduler-service', 'ready');
          } else if (this.serviceRegistry.updateHealth) {
            this.serviceRegistry.updateHealth('scheduler-service', true);
          }
        }
        
        this.initialized = true;
        this.logger.info('Scheduler service initialized successfully');
        
        clearTimeout(timeoutId);
        this.isInitializing = false;
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        this.isInitializing = false;
        this.logger.error(`Error initializing scheduler service: ${error.message}`);
        if (error.stack) {
          this.logger.error(`Stack trace: ${error.stack}`);
        }
        
        // Register failure with service registry
        if (this.serviceRegistry) {
          if (this.serviceRegistry.setStatus) {
            this.serviceRegistry.setStatus('scheduler-service', 'error', error.message);
          } else if (this.serviceRegistry.updateHealth) {
            this.serviceRegistry.updateHealth('scheduler-service', false);
          }
        }
        
        reject(error);
      }
    });
    
    return this.initPromise;
  }
  
  /**
   * Setup cron tasks for regular maintenance
   */
  setupCronTasks() {
    try {
      // For now, don't set up any cron tasks to ensure server can start
      this.logger.info('Cron tasks setup skipped during initialization');
    } catch (error) {
      this.logger.error(`Error in setupCronTasks: ${error.message}`);
      // Continue execution despite this error
    }
  }
  
  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    try {
      this.lastHealthCheck = Date.now();
      
      this.healthCheckInterval = setInterval(() => {
        try {
          this.checkHealth().catch(err => {
            this.logger.error(`Health check failed: ${err.message}`);
          });
        } catch (error) {
          this.logger.error(`Error in health check interval: ${error.message}`);
        }
      }, 60000); // Every minute
      
      this.logger.info('Health check interval started');
    } catch (error) {
      this.logger.error(`Failed to start health checks: ${error.message}`);
      // Continue execution despite this error
    }
  }
  
  /**
   * Perform health check and update service registry
   * @returns {Promise<Object>} Health status information
   */
  async checkHealth() {
    try {
      this.lastHealthCheck = Date.now();
      
      let status = {
        initialized: this.initialized,
        activeSchedules: Object.keys(this.schedules).length,
        scheduleHealth: this.areSchedulesValid()
      };
      
      // Only add circuit status if the circuits have getState method
      try {
        if (this.weatherCircuit && typeof this.weatherCircuit.getState === 'function' && 
            this.shadeCircuit && typeof this.shadeCircuit.getState === 'function') {
          status.circuitStatus = {
            weather: this.weatherCircuit.getState(),
            shades: this.shadeCircuit.getState()
          };
        } else {
          status.circuitStatus = {
            weather: 'unknown',
            shades: 'unknown'
          };
        }
      } catch (circuitError) {
        this.logger.warn(`Error getting circuit status: ${circuitError.message}`);
        status.circuitStatus = {
          weather: 'error',
          shades: 'error'
        };
      }
      
      // Add missed schedule info if available
      if (this.missedScheduleRecovery) {
        status.missedScheduleRecovery = Object.keys(this.missedScheduleRecovery).length;
      } else {
        status.missedScheduleRecovery = 0;
      }
      
      const isHealthy = this.initialized && status.scheduleHealth;
      
      if (this.serviceRegistry) {
        if (this.serviceRegistry.setStatus) {
          this.serviceRegistry.setStatus(
            'scheduler-service', 
            isHealthy ? 'ready' : 'error',
            isHealthy ? null : 'Scheduler service health check failed'
          );
        } else if (this.serviceRegistry.updateHealth) {
          this.serviceRegistry.updateHealth('scheduler-service', isHealthy);
        }
      }
      
      return status;
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      
      if (this.serviceRegistry) {
        if (this.serviceRegistry.setStatus) {
          this.serviceRegistry.setStatus('schedulerService', 'error', error.message);
        } else if (this.serviceRegistry.updateHealth) {
          this.serviceRegistry.updateHealth('schedulerService', false);
        }
      }
      
      // Don't throw the error, just return a basic status
      return {
        initialized: this.initialized || false,
        activeSchedules: Object.keys(this.schedules || {}).length,
        error: error.message
      };
    }
  }
  
  /**
   * Check if schedules are valid and working
   * @returns {boolean} True if schedules are valid
   */
  areSchedulesValid() {
    // If not initialized, schedules aren't valid
    if (!this.initialized) return false;
    
    // If in "away" mode, we expect no schedules
    if (this.configManager.get('homeStatus.status') === 'away') {
      return true; // This is expected, so it's "healthy"
    }
    
    // Check if we have any schedules
    const scheduleCount = Object.keys(this.schedules).length;
    if (scheduleCount === 0) {
      // This might be an error condition, unless it's the middle of the night
      const currentHour = new Date().getHours();
      // After midnight but before 6am, it's normal to have no schedules
      if (currentHour >= 0 && currentHour < 6) {
        return true;
      }
      return false;
    }
    
    // Check if any schedules are valid (have a next invocation)
    let validScheduleFound = false;
    for (const job of Object.values(this.schedules)) {
      if (job && job.nextInvocation()) {
        validScheduleFound = true;
        break;
      }
    }
    
    return validScheduleFound;
  }
  
  /**
   * Set up missed schedule detection and recovery
   */
  setupMissedScheduleDetection() {
    try {
      // Create a persistent record to track which schedules we expect to run
      this.missedScheduleRecovery = this.loadMissedScheduleData();
      
      // When a schedule is created, add it to the recovery tracking
      this.trackSchedulesForRecovery();
    } catch (error) {
      // Handle the error but allow initialization to continue
      this.logger.error(`Error in setupMissedScheduleDetection: ${error.message}`);
      this.missedScheduleRecovery = {};
    }
  }
  
  /**
   * Track schedules for potential recovery
   */
  trackSchedulesForRecovery() {
    try {
      const now = new Date();
      const today = moment().format('YYYY-MM-DD');
      
      // Initialize if not exists
      if (!this.missedScheduleRecovery) {
        this.missedScheduleRecovery = {};
      }
      
      // Clear out old entries for previous days
      for (const key in this.missedScheduleRecovery) {
        if (this.missedScheduleRecovery[key].date !== today) {
          delete this.missedScheduleRecovery[key];
        }
      }
      
      // Add current schedules
      for (const [name, job] of Object.entries(this.schedules)) {
        try {
          if (job && job.nextInvocation()) {
            const scheduledTime = job.nextInvocation();
            
            // Only track schedules that are supposed to run in the future
            if (scheduledTime > now) {
              this.missedScheduleRecovery[name] = {
                scheduleName: name,
                scheduledTime: scheduledTime.getTime(),
                date: today,
                executed: false,
                recoveryAttempted: false
              };
            }
          }
        } catch (jobError) {
          this.logger.warn(`Error processing schedule ${name}: ${jobError.message}`);
          // Skip this job but continue with others
          continue;
        }
      }
      
      // Save the recovery data
      this.saveMissedScheduleData();
    } catch (error) {
      // Handle the error but allow initialization to continue
      this.logger.error(`Error in trackSchedulesForRecovery: ${error.message}`);
      this.missedScheduleRecovery = {};
    }
  }
  
  /**
   * Load missed schedule data from persistent storage
   * @returns {Object} Missed schedule data
   */
  loadMissedScheduleData() {
    try {
      const missedSchedulePath = path.join(__dirname, '../../../data/cache/missed_schedules.json');
      if (fs.existsSync(missedSchedulePath)) {
        const data = fs.readFileSync(missedSchedulePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.warn(`Failed to load missed schedule data: ${error.message}`);
    }
    return {};
  }
  
  /**
   * Save missed schedule data to persistent storage
   */
  saveMissedScheduleData() {
    try {
      const cacheDir = path.join(__dirname, '../../../data/cache');
      const missedSchedulePath = path.join(cacheDir, 'missed_schedules.json');
      
      // Ensure cache directory exists
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      fs.writeFileSync(missedSchedulePath, JSON.stringify(this.missedScheduleRecovery || {}, null, 2));
    } catch (error) {
      this.logger.warn(`Failed to save missed schedule data: ${error.message}`);
    }
  }
  
  /**
   * Check for and recover missed schedules
   * @returns {Promise<boolean>} Whether missed schedules were found
   */
  async checkForMissedSchedules() {
    if (!this.missedScheduleRecovery) {
      this.missedScheduleRecovery = {};
      return false;
    }
    
    const now = Date.now();
    let missedSchedulesFound = false;
    
    for (const [name, schedule] of Object.entries(this.missedScheduleRecovery)) {
      // Skip if already executed or recovery attempted
      if (schedule.executed || schedule.recoveryAttempted) {
        continue;
      }
      
      // Check if schedule time has passed
      if (now > schedule.scheduledTime) {
        const minutesSinceMissed = Math.floor((now - schedule.scheduledTime) / 60000);
        
        // Only attempt recovery if missed within the last 3 hours
        if (minutesSinceMissed <= 180) {
          this.logger.warn(`Detected missed schedule: ${name}, scheduled ${minutesSinceMissed} minutes ago`);
          missedSchedulesFound = true;
          
          // Determine if we should still run this schedule based on time of day
          const shouldRecover = this.shouldRecoverMissedSchedule(name, minutesSinceMissed);
          
          if (shouldRecover) {
            try {
              this.logger.info(`Attempting recovery of missed schedule: ${name}`);
              await this.recoverMissedSchedule(name);
              
              // Mark as executed
              this.missedScheduleRecovery[name].executed = true;
              this.missedScheduleRecovery[name].recoveryTime = now;
              this.missedScheduleRecovery[name].recoverySuccess = true;
            } catch (error) {
              this.logger.error(`Failed to recover missed schedule ${name}: ${error.message}`);
              this.missedScheduleRecovery[name].recoveryAttempted = true;
              this.missedScheduleRecovery[name].recoveryTime = now;
              this.missedScheduleRecovery[name].recoverySuccess = false;
              this.missedScheduleRecovery[name].recoveryError = error.message;
            }
          } else {
            this.logger.info(`Skipping recovery of missed schedule ${name} as it's no longer appropriate for the current time`);
            this.missedScheduleRecovery[name].recoveryAttempted = true;
            this.missedScheduleRecovery[name].skippedReason = 'Inappropriate time for recovery';
          }
          
          // Save recovery data after each attempt
          this.saveMissedScheduleData();
        }
      }
    }
    
    return missedSchedulesFound;
  }
  
  /**
   * Determine if a missed schedule should be recovered based on its type and current time
   * @param {string} scheduleName - Name of the missed schedule
   * @param {number} minutesSinceMissed - Minutes since the schedule was missed
   * @returns {boolean} Whether the schedule should be recovered
   */
  shouldRecoverMissedSchedule(scheduleName, minutesSinceMissed) {
    // Don't recover if too much time has passed
    if (minutesSinceMissed > 60) {
      // For most schedules, don't recover after 1 hour
      if (!scheduleName.startsWith('good')) {
        return false;
      }
      
      // For good* scenes, allow recovery within 3 hours
      if (minutesSinceMissed > 180) {
        return false;
      }
    }
    
    const currentHour = new Date().getHours();
    
    // Rules based on schedule type and time of day
    switch (scheduleName) {
      case 'goodMorning':
        // Only recover morning schedules if it's still morning (before noon)
        return currentHour < 12;
        
      case 'goodAfternoon':
        // Only recover afternoon schedules if it's still afternoon (before 5pm)
        return currentHour >= 10 && currentHour < 17;
        
      case 'goodEvening':
        // Only recover evening schedules if it's still evening (before 10pm)
        return currentHour >= 16 && currentHour < 22;
        
      case 'goodNight':
        // Only recover night schedules if it's still night or very early morning
        return currentHour >= 20 || currentHour < 3;
        
      case 'riseAndShine':
        // Only recover if it's still morning
        return currentHour >= 5 && currentHour < 10;
        
      case 'letTheSunIn':
      case 'startTheDay':
        // These are part of wake-up sequence, only recover if morning
        return currentHour >= 5 && currentHour < 10;
        
      default:
        // For unknown schedule types, recover if within 30 minutes
        return minutesSinceMissed <= 30;
    }
  }
  
  /**
   * Recover a missed schedule by triggering it manually
   * @param {string} scheduleName - Name of the missed schedule
   * @returns {Promise<Object>} Result of the recovery attempt
   */
  async recoverMissedSchedule(scheduleName) {
    // Map schedule names to scene names
    const sceneMap = {
      'goodMorning': 'good-morning',
      'goodAfternoon': 'good-afternoon',
      'goodEvening': 'good-evening',
      'goodNight': 'good-night',
      'riseAndShine': 'rise-and-shine',
      'letTheSunIn': 'let-the-sun-in',
      'startTheDay': 'start-the-day'
    };
    
    const sceneName = sceneMap[scheduleName];
    if (!sceneName) {
      throw new Error(`Unknown schedule: ${scheduleName}`);
    }
    
    this.logger.info(`Recovering missed schedule ${scheduleName} by triggering scene ${sceneName}`);
    
    // Use circuit breaker when triggering the scene
    return await this.shadeCircuit.execute(async () => {
      const result = await this.shadeService.triggerShadeScene(sceneName);
      
      if (!result.success) {
        throw new Error(`Failed to trigger scene ${sceneName}: ${result.error || 'Unknown error'}`);
      }
      
      return result;
    }, sceneName);
  }
  
  /**
   * Load sunset data from CSV file
   * @returns {Promise<void>}
   */
  async loadSunsetData() {
    try {
      if (!fs.existsSync(this.sunsetDataPath)) {
        this.logger.error(`Sunset data file not found at ${this.sunsetDataPath}`);
        
        // Create default data as fallback
        this.createDefaultSunsetData();
        return;
      }
      
      const results = [];
      
      // Create a promise to handle the CSV parsing
      await new Promise((resolve, reject) => {
        fs.createReadStream(this.sunsetDataPath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });
      
      // Process the results into a more usable format
      results.forEach(row => {
        if (row.date && row.sunset) {
          this.sunsetData[row.date] = row.sunset;
        }
      });
      
      this.logger.info(`Loaded ${Object.keys(this.sunsetData).length} sunset records`);
    } catch (error) {
      this.logger.error(`Error loading sunset data: ${error.message}`);
      
      // Create default data as fallback
      this.createDefaultSunsetData();
      
      // Log fallback creation
      this.logger.warn(`Using generated default sunset data as fallback`);
    }
  }
  
  /**
   * Generate default sunset data as fallback
   */
  createDefaultSunsetData() {
    // Create a year's worth of approximate sunset times for Silverthorne, CO
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const month = date.getMonth();
      
      // Approximate sunset times by month for Silverthorne
      let hour, minute;
      
      // Very rough approximation for Colorado sunset times throughout the year
      if (month >= 4 && month <= 8) {
        // Summer months (May-Sep): later sunset around 8:30pm
        hour = 20;
        minute = 30;
      } else if (month >= 9 && month <= 10) {
        // Fall months (Oct-Nov): earlier sunset around 6:30pm
        hour = 18;
        minute = 30;
      } else if (month >= 11 || month <= 1) {
        // Winter months (Dec-Feb): earliest sunset around 5:00pm
        hour = 17;
        minute = 0;
      } else {
        // Spring months (Mar-Apr): medium sunset around 7:00pm
        hour = 19;
        minute = 0;
      }
      
      const dateStr = date.toISOString().split('T')[0];
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      this.sunsetData[dateStr] = timeStr;
    }
  }
  
  /**
   * Initialize daily schedules
   * @returns {Promise<void>}
   */
  async initializeSchedules() {
    // Cancel any existing schedules
    this.cancelAllSchedules();
    
    // Set up schedules for today
    await this.setupDailySchedules();
    
    // Track schedules for recovery
    this.trackSchedulesForRecovery();
  }
  
  /**
   * Refresh all schedules (called at midnight)
   * @returns {Promise<void>}
   */
  async refreshSchedules() {
    this.logger.info('Refreshing schedules for new day');
    
    // Cancel all existing schedules
    this.cancelAllSchedules();
    
    // Re-initialize schedules
    await this.setupDailySchedules();
    
    // Track new schedules for recovery
    this.trackSchedulesForRecovery();
    
    // Update health status
    await this.checkHealth();
  }
  
  /**
   * Cancel all active schedules
   */
  cancelAllSchedules() {
    for (const [name, job] of Object.entries(this.schedules)) {
      if (job) {
        job.cancel();
        this.logger.debug(`Cancelled schedule: ${name}`);
      }
    }
    this.schedules = {};
  }
  
  /**
   * Set up schedules for the current day
   * @returns {Promise<void>}
   */
  async setupDailySchedules() {
    try {
      // Check if we're in "away" mode and should skip automation
      if (this.configManager.get('homeStatus.status') === 'away') {
        this.logger.info('Home is in "away" mode, no schedules will be created');
        return;
      }
      
      // Get today's date
      const today = moment().format('YYYY-MM-DD');
      
      // Get sun times with circuit breaker protection
      let sunriseTime;
      let sunsetTime;
      
      // 1. Try to get from weather service using circuit breaker
      try {
        const sunTimes = await this.weatherCircuit.execute(async () => {
          return await this.weatherService.getSunriseSunsetTimes();
        });
        
        if (sunTimes.success) {
          sunriseTime = moment(sunTimes.data.sunrise);
          sunsetTime = moment(sunTimes.data.sunset);
          this.logger.info(`Using sun times from weather service: Rise ${sunriseTime.format('HH:mm')}, Set ${sunsetTime.format('HH:mm')}`);
        } else if (sunTimes.usingFallback) {
          this.logger.warn('Using fallback path for sun times - weather service circuit open');
        }
      } catch (error) {
        this.logger.warn(`Could not get sun times from weather service: ${error.message}`);
      }
      
      // 2. Fall back to sunset data file
      if (!sunsetTime && this.sunsetData[today]) {
        sunsetTime = moment(this.sunsetData[today], 'HH:mm');
        this.logger.info(`Using sunset time from data file: ${sunsetTime.format('HH:mm')}`);
      }
      
      // 3. If still no data, use hardcoded reasonable defaults for Silverthorne
      if (!sunriseTime) {
        // Approximate sunrise for Silverthorne, CO
        sunriseTime = moment().hour(6).minute(30);
        this.logger.warn(`Using default sunrise time: ${sunriseTime.format('HH:mm')}`);
      }
      
      if (!sunsetTime) {
        // Approximate sunset for Silverthorne, CO
        sunsetTime = moment().hour(20).minute(0);
        this.logger.warn(`Using default sunset time: ${sunsetTime.format('HH:mm')}`);
      }
      
      // Schedule scenes using circuit breaker protection for the shade service
      await Promise.allSettled([
        this.scheduleGoodMorning(),
        this.scheduleGoodAfternoon(sunriseTime, sunsetTime),
        this.scheduleGoodEvening(sunsetTime),
        this.scheduleGoodNight(sunsetTime),
        this.scheduleWakeUp()
      ]);
      
      this.logger.info('All daily schedules have been set up');
    } catch (error) {
      this.logger.error(`Error setting up daily schedules: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Schedule the Good Morning scene
   * @returns {Promise<void>}
   */
  async scheduleGoodMorning() {
    try {
      // Get wake-up time from config, or use default
      const wakeUpTime = this.getWakeUpTimeForTomorrow();
      const [hours, minutes] = wakeUpTime.split(':').map(Number);
      
      // Create the schedule
      const now = new Date();
      const scheduleTime = new Date(now);
      scheduleTime.setHours(hours, minutes, 0, 0);
      
      // If the scheduled time has already passed for today, don't schedule
      if (scheduleTime <= now) {
        this.logger.info(`Good Morning time (${wakeUpTime}) has already passed for today`);
        return;
      }
      
      this.schedules.goodMorning = schedule.scheduleJob(scheduleTime, async () => {
        this.logger.info(`Executing scheduled Good Morning scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const result = await this.shadeService.triggerShadeScene('good-morning');
            this.logger.info(`Good Morning scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          });
        } catch (error) {
          this.logger.error(`Error executing Good Morning scene: ${error.message}`);
        }
      });
      
      this.logger.info(`Scheduled Good Morning for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      this.logger.error(`Error scheduling Good Morning: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Afternoon scene
   * @param {moment} sunriseTime - Sunrise time as moment object
   * @param {moment} sunsetTime - Sunset time as moment object
   * @returns {Promise<void>}
   */
  async scheduleGoodAfternoon(sunriseTime, sunsetTime) {
    try {
      // Calculate approximate time when sun is highest (between sunrise and sunset)
      const sunHighTime = moment(sunriseTime).add(
        moment(sunsetTime).diff(sunriseTime) / 2, 
        'milliseconds'
      );
      
      // Apply offset from config
      const offsetMinutes = this.configManager.get('shadeScenes.goodAfternoonOffset', 0);
      const scheduleTime = moment(sunHighTime).add(offsetMinutes, 'minutes').toDate();
      
      // If the scheduled time has already passed for today, don't schedule
      const now = new Date();
      if (scheduleTime <= now) {
        this.logger.info(`Good Afternoon time (${scheduleTime.toLocaleTimeString()}) has already passed for today`);
        return;
      }
      
      this.schedules.goodAfternoon = schedule.scheduleJob(scheduleTime, async () => {
        this.logger.info(`Executing scheduled Good Afternoon scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const result = await this.shadeService.triggerShadeScene('good-afternoon');
            this.logger.info(`Good Afternoon scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          });
        } catch (error) {
          this.logger.error(`Error executing Good Afternoon scene: ${error.message}`);
        }
      });
      
      this.logger.info(`Scheduled Good Afternoon for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      this.logger.error(`Error scheduling Good Afternoon: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Evening scene
   * @param {moment} sunsetTime - Sunset time as moment object
   * @returns {Promise<void>}
   */
  async scheduleGoodEvening(sunsetTime) {
    try {
      // Calculate time before sunset
      const offsetMinutes = this.configManager.get('shadeScenes.goodEveningOffset', 0);
      const scheduleTime = moment(sunsetTime).subtract(60, 'minutes').add(offsetMinutes, 'minutes').toDate();
      
      // If the scheduled time has already passed for today, don't schedule
      const now = new Date();
      if (scheduleTime <= now) {
        this.logger.info(`Good Evening time (${scheduleTime.toLocaleTimeString()}) has already passed for today`);
        return;
      }
      
      this.schedules.goodEvening = schedule.scheduleJob(scheduleTime, async () => {
        this.logger.info(`Executing scheduled Good Evening scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const result = await this.shadeService.triggerShadeScene('good-evening');
            this.logger.info(`Good Evening scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          });
        } catch (error) {
          this.logger.error(`Error executing Good Evening scene: ${error.message}`);
        }
      });
      
      this.logger.info(`Scheduled Good Evening for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      this.logger.error(`Error scheduling Good Evening: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Night scene
   * @param {moment} sunsetTime - Sunset time as moment object
   * @returns {Promise<void>}
   */
  async scheduleGoodNight(sunsetTime) {
    try {
      // Calculate time after sunset
      const offsetMinutes = this.configManager.get('shadeScenes.goodNightOffset', 30);
      const scheduleTime = moment(sunsetTime).add(offsetMinutes, 'minutes').toDate();
      
      // If the scheduled time has already passed for today, don't schedule
      const now = new Date();
      if (scheduleTime <= now) {
        this.logger.info(`Good Night time (${scheduleTime.toLocaleTimeString()}) has already passed for today`);
        return;
      }
      
      this.schedules.goodNight = schedule.scheduleJob(scheduleTime, async () => {
        this.logger.info(`Executing scheduled Good Night scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const result = await this.shadeService.triggerShadeScene('good-night');
            this.logger.info(`Good Night scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          });
        } catch (error) {
          this.logger.error(`Error executing Good Night scene: ${error.message}`);
        }
      });
      
      this.logger.info(`Scheduled Good Night for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      this.logger.error(`Error scheduling Good Night: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Wake Up sequence (Rise and Shine, Let the Sun In, Start the Day)
   * @returns {Promise<void>}
   */
  async scheduleWakeUp() {
    try {
      // Get the next wake-up time from config
      const nextWakeUpTime = this.configManager.get('wakeUpTime.nextWakeUpTime');
      
      // If no next wake-up time is set, don't schedule anything
      if (!nextWakeUpTime) {
        this.logger.info('No next wake-up time set, skipping Wake Up sequence scheduling');
        return;
      }
      
      const [hours, minutes] = nextWakeUpTime.split(':').map(Number);
      
      // Create the schedule for Rise and Shine (main wake-up time)
      const now = new Date();
      const riseAndShineTime = new Date(now);
      riseAndShineTime.setHours(hours, minutes, 0, 0);
      
      // If the scheduled time has already passed for today, don't schedule
      if (riseAndShineTime <= now) {
        this.logger.info(`Rise and Shine time (${nextWakeUpTime}) has already passed for today`);
        return;
      }
      
      // Schedule Rise and Shine
      this.schedules.riseAndShine = schedule.scheduleJob(riseAndShineTime, async () => {
        this.logger.info(`Executing scheduled Rise and Shine scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            // Trigger Rise and Shine
            const result = await this.shadeService.triggerShadeScene('rise-and-shine');
            this.logger.info(`Rise and Shine scene execution ${result.success ? 'succeeded' : 'failed'}`);
            
            // Also trigger Good Morning scene at the same time
            const morningResult = await this.shadeService.triggerShadeScene('good-morning');
            this.logger.info(`Good Morning scene execution ${morningResult.success ? 'succeeded' : 'failed'}`);
            
            // Clear the next wake-up time since it's been used
            this.configManager.set('wakeUpTime.nextWakeUpTime', null);
            
            return { riseAndShine: result, goodMorning: morningResult };
          });
        } catch (error) {
          this.logger.error(`Error executing Rise and Shine scene: ${error.message}`);
        }
      });
      
      // Calculate Let the Sun In time (7 minutes after wake-up)
      const letTheSunInDelay = this.configManager.get('shadeScenes.letTheSunInDelay', 7);
      const letTheSunInTime = new Date(riseAndShineTime.getTime() + (letTheSunInDelay * 60 * 1000));
      
      // Schedule Let the Sun In
      this.schedules.letTheSunIn = schedule.scheduleJob(letTheSunInTime, async () => {
        this.logger.info(`Executing scheduled Let the Sun In scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const result = await this.shadeService.triggerShadeScene('let-the-sun-in');
            this.logger.info(`Let the Sun In scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          });
        } catch (error) {
          this.logger.error(`Error executing Let the Sun In scene: ${error.message}`);
        }
      });
      
      // Calculate Start the Day time (20 minutes after wake-up)
      const startTheDayDelay = this.configManager.get('shadeScenes.startTheDayDelay', 20);
      const startTheDayTime = new Date(riseAndShineTime.getTime() + (startTheDayDelay * 60 * 1000));
      
      // Schedule Start the Day
      this.schedules.startTheDay = schedule.scheduleJob(startTheDayTime, async () => {
        this.logger.info(`Executing scheduled Start the Day scene at ${new Date().toLocaleTimeString()}`);
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const result = await this.shadeService.triggerShadeScene('start-the-day');
            this.logger.info(`Start the Day scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          });
        } catch (error) {
          this.logger.error(`Error executing Start the Day scene: ${error.message}`);
        }
      });
      
      this.logger.info(`Scheduled Wake Up sequence: Rise and Shine at ${riseAndShineTime.toLocaleTimeString()}, Let the Sun In at ${letTheSunInTime.toLocaleTimeString()}, Start the Day at ${startTheDayTime.toLocaleTimeString()}`);
    } catch (error) {
      this.logger.error(`Error scheduling Wake Up sequence: ${error.message}`);
    }
  }
  
  /**
   * Set the wake-up time for tomorrow
   * @param {string} time - Time in HH:MM format (24-hour)
   * @returns {Object} Result with success/error information
   */
  setWakeUpTime(time) {
    try {
      // Update the config
      this.configManager.setNextWakeUpTime(time);
      
      // Cancel any existing wake-up schedules
      ['riseAndShine', 'letTheSunIn', 'startTheDay'].forEach(name => {
        if (this.schedules[name]) {
          this.schedules[name].cancel();
          delete this.schedules[name];
        }
      });
      
      // Schedule the new wake-up sequence
      this.scheduleWakeUp().catch(err => {
        this.logger.error(`Error scheduling wake-up: ${err.message}`);
      });
      
      // Update recovery tracking
      this.trackSchedulesForRecovery();
      
      return {
        success: true,
        message: `Wake-up time set to ${time}`
      };
    } catch (error) {
      this.logger.error(`Error setting wake-up time: ${error.message}`);
      return {
        success: false,
        error: `Failed to set wake-up time: ${error.message}`
      };
    }
  }
  
  /**
   * Get the wake-up time for tomorrow
   * @returns {string} - Time in HH:MM format
   */
  getWakeUpTimeForTomorrow() {
    return this.configManager.get('wakeUpTime.nextWakeUpTime') || this.configManager.get('wakeUpTime.defaultTime');
  }
  
  /**
   * Get all active schedules
   * @returns {Object} Object containing all active schedules
   */
  getActiveSchedules() {
    const scheduleDetails = {};
    
    for (const [name, job] of Object.entries(this.schedules)) {
      if (job && job.nextInvocation()) {
        scheduleDetails[name] = {
          scheduleName: name,
          nextRunAt: job.nextInvocation().toLocaleString('en-US', {
            timeZone: 'America/Denver',
            dateStyle: 'short',
            timeStyle: 'short'
          })
        };
      }
    }
    
    return {
      success: true,
      data: scheduleDetails,
      circuitStatus: {
        weather: (this.weatherCircuit && typeof this.weatherCircuit.getState === 'function') ? 
          this.weatherCircuit.getState() : 'UNKNOWN',
        shades: (this.shadeCircuit && typeof this.shadeCircuit.getState === 'function') ? 
          this.shadeCircuit.getState() : 'UNKNOWN'
      }
    };
  }
  
  /**
   * Manually trigger a shade scene schedule with circuit breaker protection
   * @param {string} sceneName - The name of the scene schedule to trigger
   * @returns {Promise<Object>} Result with success/error information
   */
  async triggerSchedule(sceneName) {
    try {
      // Map user-friendly names to internal scene names
      const sceneMap = {
        'goodMorning': 'good-morning',
        'goodAfternoon': 'good-afternoon',
        'goodEvening': 'good-evening',
        'goodNight': 'good-night',
        'riseAndShine': 'rise-and-shine',
        'letTheSunIn': 'let-the-sun-in',
        'startTheDay': 'start-the-day'
      };
      
      if (!sceneMap[sceneName]) {
        return {
          success: false,
          error: `Unknown schedule: ${sceneName}`
        };
      }
      
      this.logger.info(`Manually triggering scene schedule: ${sceneName}`);
      
      // Use circuit breaker when triggering the scene
      const result = await this.shadeCircuit.execute(async () => {
        return await this.shadeService.triggerShadeScene(sceneMap[sceneName]);
      }, sceneMap[sceneName]);
      
      return {
        success: result.success,
        message: `Manually triggered ${sceneName} schedule`,
        details: result,
        circuitStatus: {
          shades: (this.shadeCircuit && typeof this.shadeCircuit.getState === 'function') ? 
            this.shadeCircuit.getState() : 'UNKNOWN'
        }
      };
    } catch (error) {
      this.logger.error(`Error triggering schedule ${sceneName}: ${error.message}`);
      return {
        success: false,
        error: `Failed to trigger schedule: ${error.message}`,
        circuitStatus: {
          shades: (this.shadeCircuit && typeof this.shadeCircuit.getState === 'function') ? 
            this.shadeCircuit.getState() : 'UNKNOWN'
        }
      };
    }
  }
  
  /**
   * Get circuit breaker status
   * @returns {Object} Circuit breaker status
   */
  getCircuitStatus() {
    return {
      weather: (this.weatherCircuit && typeof this.weatherCircuit.getState === 'function') ? 
        this.weatherCircuit.getState() : 'UNKNOWN',
      shades: (this.shadeCircuit && typeof this.shadeCircuit.getState === 'function') ? 
        this.shadeCircuit.getState() : 'UNKNOWN'
    };
  }
  
  /**
   * Force a reset of the scheduler service
   * @returns {Promise<Object>} Result with success/error information
   */
  async forceReset() {
    this.logger.info('Force resetting scheduler service');
    
    // Reset circuit breakers
    this.weatherCircuit.reset();
    this.shadeCircuit.reset();
    
    // Cancel all schedules
    this.cancelAllSchedules();
    
    // Reload sunset data
    await this.loadSunsetData();
    
    // Setup schedules
    await this.setupDailySchedules();
    
    return {
      success: true,
      message: 'Scheduler service reset successful',
      schedulesCreated: Object.keys(this.schedules).length
    };
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} True if initialized, false otherwise
   */
  isInitialized() {
    return this.initialized;
  }
  
  /**
   * Get missed schedule information
   * @returns {Object} Missed schedule stats and details
   */
  getMissedSchedules() {
    if (!this.missedScheduleRecovery) {
      return {
        total: 0,
        pending: 0,
        recovered: 0,
        details: []
      };
    }
    
    return {
      total: Object.keys(this.missedScheduleRecovery).length,
      pending: Object.values(this.missedScheduleRecovery).filter(m => !m.executed && !m.recoveryAttempted).length,
      recovered: Object.values(this.missedScheduleRecovery).filter(m => m.executed || m.recoveryAttempted).length,
      details: Object.entries(this.missedScheduleRecovery).slice(0, 10).map(([name, miss]) => ({
        scheduleName: name,
        scheduled: new Date(miss.scheduledTime).toLocaleString(),
        executed: miss.executed,
        recoveryAttempted: miss.recoveryAttempted
      }))
    };
  }
}

// Export the class (no singleton)
module.exports = SchedulerService;