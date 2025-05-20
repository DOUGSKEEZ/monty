/**
 * Enhanced Scheduler Service with Circuit Breaking and Self-Healing
 * 
 * This service manages scheduled events with improved resilience features:
 * - Circuit breaker for external dependencies
 * - Automatic recovery of failed schedules
 * - Self-healing through service watchdog integration
 * - Memory usage optimization
 * - Missed schedule detection and rescheduling
 */

const cron = require('node-cron');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment');
const logger = require('../utils/logger').getModuleLogger('scheduler-service');
const configManager = require('../utils/config');
const CircuitBreaker = require('../utils/CircuitBreaker');
const serviceWatchdog = require('../utils/ServiceWatchdog');
const serviceRegistry = require('../utils/ServiceRegistry');

class SchedulerService {
  constructor() {
    this.schedules = {};
    this.sunsetData = {};
    this.sunriseData = {};
    this.initialized = false;
    this.initializationPromise = null;
    this.sunsetDataPath = path.join(__dirname, '../../../data/sunset_data.csv');
    this.weatherService = null; // Lazy load to avoid circular dependency
    this.shadeService = null; // Lazy load to avoid circular dependency
    
    // Schedule tracking for self-healing
    this.missedSchedules = [];
    this.lastScheduleCheck = Date.now();
    this.scheduleHistory = {};
    
    // Initialize circuit breakers
    this.initializeCircuitBreakers();
    
    // Register with service registry
    this.registerWithServiceRegistry();
    
    // Avoid calling init directly from constructor to prevent blocking
  }
  
  /**
   * Initialize circuit breakers for scheduler dependencies
   */
  initializeCircuitBreakers() {
    // Circuit breaker for shade control actions
    this.shadeCircuit = new CircuitBreaker({
      name: 'scheduler-shade-control',
      failureThreshold: 50,
      resetTimeout: 30000,
      halfOpenSuccessThreshold: 2,
      rollingWindowSize: 10,
      fallbackFunction: async (sceneName) => {
        logger.warn(`Shade control circuit open, logging scheduled action for scene: ${sceneName}`);
        
        // Record the missed action for later recovery
        this.recordMissedSchedule(sceneName);
        
        // Return simulated success to prevent cascading failures
        return {
          success: true, 
          message: `Shade scene ${sceneName} action logged for later execution (circuit open)`,
          fromFallback: true
        };
      }
    });
    
    // Circuit breaker for weather service
    this.weatherCircuit = new CircuitBreaker({
      name: 'scheduler-weather-service',
      failureThreshold: 50,
      resetTimeout: 60000,
      halfOpenSuccessThreshold: 1,
      rollingWindowSize: 5,
      fallbackFunction: async () => {
        logger.warn('Weather service circuit open, using default sun times');
        
        const today = new Date();
        const sunriseDate = new Date(today.setHours(6, 30, 0, 0));
        const sunsetDate = new Date(today.setHours(20, 0, 0, 0));
        
        return {
          success: true,
          data: {
            sunrise: sunriseDate,
            sunset: sunsetDate
          },
          fromFallback: true
        };
      }
    });
    
    // Set up event handlers for circuit state changes
    [this.shadeCircuit, this.weatherCircuit].forEach(circuit => {
      circuit.on('stateChange', (event) => {
        logger.info(`Circuit "${event.circuit}" state changed from ${event.from} to ${event.to}: ${event.reason}`);
        
        // Update service registry status when circuit state changes
        if (event.to === CircuitBreaker.STATES.OPEN) {
          serviceRegistry.updateHealth('scheduler-service', false);
        } else if (event.to === CircuitBreaker.STATES.CLOSED && 
                  this.shadeCircuit.state === CircuitBreaker.STATES.CLOSED && 
                  this.weatherCircuit.state === CircuitBreaker.STATES.CLOSED) {
          serviceRegistry.updateHealth('scheduler-service', true);
        }
      });
    });
  }
  
  /**
   * Register with service registry for health monitoring
   */
  registerWithServiceRegistry() {
    // Register with service registry
    serviceRegistry.register('scheduler-service', { 
      isCore: false,
      checkHealth: async () => {
        try {
          // Determine overall status based on initialization and circuits
          let status = this.initialized ? 'ok' : 'initializing';
          let message = this.initialized ? 'Scheduler service operational' : 'Scheduler service initializing';
          
          // Check active schedules
          const activeScheduleCount = Object.keys(this.schedules).length;
          
          // Check circuit breaker status
          if (this.shadeCircuit.state === CircuitBreaker.STATES.OPEN ||
              this.weatherCircuit.state === CircuitBreaker.STATES.OPEN) {
            status = 'warning';
            message = 'Some dependencies are unavailable, using fallbacks';
          }
          
          // Check for missed schedules
          if (this.missedSchedules.length > 0) {
            status = 'warning';
            message = `${this.missedSchedules.length} scheduled events missed and pending recovery`;
          }
          
          // Check for memory issues
          const memoryUsage = process.memoryUsage();
          const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
          
          if (heapUsedMB > 100) { // 100MB threshold
            status = 'warning';
            message = `High memory usage: ${heapUsedMB}MB`;
          }
          
          return {
            status,
            message,
            details: {
              initialized: this.initialized,
              activeSchedules: activeScheduleCount,
              missedSchedules: this.missedSchedules.length,
              circuits: {
                shadeControl: this.shadeCircuit.state,
                weatherService: this.weatherCircuit.state
              },
              memory: {
                heapUsed: `${heapUsedMB}MB`,
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
              }
            }
          };
        } catch (error) {
          return {
            status: 'error',
            message: `Health check failed: ${error.message}`
          };
        }
      }
    });
    
    // Set initial status
    serviceRegistry.updateHealth('scheduler-service', false);
    
    // Register with service watchdog for recovery
    serviceWatchdog.registerService('scheduler-service', {
      isCritical: false,
      monitorMemory: true,
      memoryThresholdMB: 120,
      // Custom recovery procedure
      recoveryProcedure: async (serviceName, attemptNumber) => {
        try {
          logger.info(`Attempting scheduler service recovery (attempt ${attemptNumber})`);
          
          // Reload cache data
          await this.loadSunsetData();
          
          // Reset circuits
          this.shadeCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset during recovery');
          this.weatherCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset during recovery');
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
          
          // Refresh schedules
          await this.refreshSchedules();
          
          // Check for and handle missed schedules
          const recoveredCount = await this.recoverMissedSchedules();
          
          return {
            success: true,
            message: 'Scheduler service recovered successfully',
            refreshed: true,
            missedSchedulesRecovered: recoveredCount,
            activeSchedules: Object.keys(this.schedules).length,
            circuits: {
              shadeControl: this.shadeCircuit.state,
              weatherService: this.weatherCircuit.state
            }
          };
        } catch (error) {
          throw new Error(`Scheduler service recovery failed: ${error.message}`);
        }
      }
    });
  }
  
  /**
   * Initialize the scheduler service
   * This should be called explicitly, not from the constructor
   */
  initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    logger.info('Starting scheduler service initialization');
    
    this.initializationPromise = new Promise(async (resolve, reject) => {
      try {
        // Set timeout for initialization
        const timeoutId = setTimeout(() => {
          const error = new Error('Scheduler initialization timed out after 30 seconds');
          logger.error(`Scheduler initialization timeout: ${error.message}`);
          reject(error);
        }, 30000);
        
        // Load sunset data with timeout
        await this.loadSunsetDataWithTimeout();
        
        // Initialize daily schedules
        await this.initializeSchedulesWithTimeout();
        
        // Set up daily refresh at midnight
        cron.schedule('0 0 * * *', () => {
          logger.info('Running midnight schedule refresh');
          this.refreshSchedules().catch(err => {
            logger.error(`Error in midnight schedule refresh: ${err.message}`);
          });
        });
        
        // Set up missed schedule detection (every 5 minutes)
        cron.schedule('*/5 * * * *', () => {
          this.checkForMissedSchedules();
        });
        
        this.initialized = true;
        clearTimeout(timeoutId);
        
        // Update service registry
        serviceRegistry.updateHealth('scheduler-service', true);
        
        logger.info('Scheduler service initialized successfully');
        resolve();
      } catch (error) {
        logger.error(`Error initializing scheduler service: ${error.message}`);
        this.initialized = false;
        
        // Update service registry but don't reject
        // This allows the server to start even if scheduler fails
        serviceRegistry.updateHealth('scheduler-service', false);
        
        reject(error);
      }
    });
    
    // Add timeout handling to the promise
    this.initializationPromise.catch(err => {
      logger.error(`Scheduler initialization failed: ${err.message}`);
      this.initialized = false;
    });
    
    return this.initializationPromise;
  }
  
  /**
   * Lazy-load weatherService to avoid circular dependency
   */
  getWeatherService() {
    if (!this.weatherService) {
      this.weatherService = require('./weatherService.fixed');
    }
    return this.weatherService;
  }
  
  /**
   * Lazy-load shadeService to avoid circular dependency
   */
  getShadeService() {
    if (!this.shadeService) {
      this.shadeService = require('./shadeService');
    }
    return this.shadeService;
  }
  
  /**
   * Load sunset data from CSV file with timeout
   */
  async loadSunsetDataWithTimeout() {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Loading sunset data timed out after 10 seconds'));
      }, 10000);
      
      try {
        await this.loadSunsetData();
        clearTimeout(timeoutId);
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  /**
   * Initialize daily schedules with timeout
   */
  async initializeSchedulesWithTimeout() {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Initializing schedules timed out after 10 seconds'));
      }, 10000);
      
      try {
        this.cancelAllSchedules();
        await this.setupDailySchedules();
        clearTimeout(timeoutId);
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  /**
   * Load sunset data from CSV file
   */
  async loadSunsetData() {
    try {
      // Check if sunset data file exists
      if (!fs.existsSync(this.sunsetDataPath)) {
        logger.error(`Sunset data file not found at ${this.sunsetDataPath}`);
        // Use fallback empty data
        this.sunsetData = {};
        return;
      }
      
      const results = [];
      
      // Create a promise to handle the CSV parsing with timeout
      await new Promise((resolve, reject) => {
        // Set timeout for CSV parsing
        const timeoutId = setTimeout(() => {
          reject(new Error('CSV parsing timed out after 5 seconds'));
        }, 5000);
        
        const parser = fs.createReadStream(this.sunsetDataPath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => {
            clearTimeout(timeoutId);
            resolve();
          })
          .on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
      });
      
      // Process the results into a more usable format
      results.forEach(row => {
        if (row.date && row.sunset) {
          this.sunsetData[row.date] = row.sunset;
        }
      });
      
      logger.info(`Loaded ${Object.keys(this.sunsetData).length} sunset records`);
    } catch (error) {
      logger.error(`Error loading sunset data: ${error.message}`);
      // Use fallback empty data
      this.sunsetData = {};
    }
  }
  
  /**
   * Cancel all active schedules
   */
  cancelAllSchedules() {
    for (const [name, job] of Object.entries(this.schedules)) {
      if (job) {
        job.cancel();
        logger.debug(`Cancelled schedule: ${name}`);
      }
    }
    this.schedules = {};
  }
  
  /**
   * Set up schedules for the current day
   */
  async setupDailySchedules() {
    try {
      // Check if we're in "away" mode and should skip automation
      if (configManager.get('homeStatus.status') === 'away') {
        logger.info('Home is in "away" mode, no schedules will be created');
        return;
      }
      
      // Get today's date
      const today = moment().format('YYYY-MM-DD');
      
      // Get sun times from a variety of sources using the circuit breaker
      let sunriseTime;
      let sunsetTime;
      
      try {
        await this.weatherCircuit.execute(async () => {
          // Lazy load weatherService to avoid circular dependency
          const weatherService = this.getWeatherService();
          
          // Set timeout for getting sun times
          const sunTimesPromise = weatherService.getSunriseSunsetTimes();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Getting sun times timed out')), 5000);
          });
          
          // Race to see which completes first
          const sunTimes = await Promise.race([sunTimesPromise, timeoutPromise]);
          
          if (sunTimes.success) {
            sunriseTime = moment(sunTimes.data.sunrise);
            sunsetTime = moment(sunTimes.data.sunset);
            logger.info(`Using sun times from weather service: Rise ${sunriseTime.format('HH:mm')}, Set ${sunsetTime.format('HH:mm')}`);
          }
        });
      } catch (error) {
        logger.warn(`Could not get sun times from weather service: ${error.message}`);
      }
      
      // Fall back to sunset data file
      if (!sunsetTime && this.sunsetData[today]) {
        sunsetTime = moment(this.sunsetData[today], 'HH:mm');
        logger.info(`Using sunset time from data file: ${sunsetTime.format('HH:mm')}`);
      }
      
      // If still no data, use hardcoded reasonable defaults for Silverthorne
      if (!sunriseTime) {
        // Approximate sunrise for Silverthorne, CO
        sunriseTime = moment().hour(6).minute(30);
        logger.warn(`Using default sunrise time: ${sunriseTime.format('HH:mm')}`);
      }
      
      if (!sunsetTime) {
        // Approximate sunset for Silverthorne, CO
        sunsetTime = moment().hour(20).minute(0);
        logger.warn(`Using default sunset time: ${sunsetTime.format('HH:mm')}`);
      }
      
      // Schedule scenes with proper error handling
      const schedulePromises = [
        this.scheduleWithTimeout(this.scheduleGoodMorning.bind(this), 'Good Morning'),
        this.scheduleWithTimeout(
          () => this.scheduleGoodAfternoon(sunriseTime, sunsetTime), 
          'Good Afternoon'
        ),
        this.scheduleWithTimeout(
          () => this.scheduleGoodEvening(sunsetTime), 
          'Good Evening'
        ),
        this.scheduleWithTimeout(
          () => this.scheduleGoodNight(sunsetTime), 
          'Good Night'
        ),
        this.scheduleWithTimeout(this.scheduleWakeUp.bind(this), 'Wake Up')
      ];
      
      // Wait for all schedules to be set up, but continue even if some fail
      const results = await Promise.allSettled(schedulePromises);
      
      // Log the results
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      logger.info(`Daily schedules setup complete. Success: ${succeeded}, Failed: ${failed}`);
    } catch (error) {
      logger.error(`Error setting up daily schedules: ${error.message}`);
    }
  }
  
  /**
   * Schedule a function with timeout
   * @param {Function} scheduleFn - The scheduling function to call
   * @param {string} scheduleName - Name for logging
   */
  async scheduleWithTimeout(scheduleFn, scheduleName) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Scheduling ${scheduleName} timed out after 5 seconds`));
      }, 5000);
      
      try {
        await scheduleFn();
        clearTimeout(timeoutId);
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        logger.error(`Error scheduling ${scheduleName}: ${error.message}`);
        reject(error);
      }
    });
  }
  
  /**
   * Schedule the Good Morning scene
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
        logger.info(`Good Morning time (${wakeUpTime}) has already passed for today`);
        return;
      }
      
      this.schedules.goodMorning = schedule.scheduleJob(scheduleTime, async () => {
        logger.info(`Executing scheduled Good Morning scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('goodMorning');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            const result = await shadeService.triggerShadeScene('good-morning');
            logger.info(`Good Morning scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          }, null, 'good-morning');
        } catch (error) {
          logger.error(`Error executing Good Morning scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('good-morning');
          }
        }
      });
      
      logger.info(`Scheduled Good Morning for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      logger.error(`Error scheduling Good Morning: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Afternoon scene
   * @param {moment} sunriseTime - Sunrise time as moment object
   * @param {moment} sunsetTime - Sunset time as moment object
   */
  async scheduleGoodAfternoon(sunriseTime, sunsetTime) {
    try {
      // Calculate approximate time when sun is highest (between sunrise and sunset)
      const sunHighTime = moment(sunriseTime).add(
        moment(sunsetTime).diff(sunriseTime) / 2, 
        'milliseconds'
      );
      
      // Apply offset from config
      const offsetMinutes = configManager.get('shadeScenes.goodAfternoonOffset', 0);
      const scheduleTime = moment(sunHighTime).add(offsetMinutes, 'minutes').toDate();
      
      // If the scheduled time has already passed for today, don't schedule
      const now = new Date();
      if (scheduleTime <= now) {
        logger.info(`Good Afternoon time (${scheduleTime.toLocaleTimeString()}) has already passed for today`);
        return;
      }
      
      this.schedules.goodAfternoon = schedule.scheduleJob(scheduleTime, async () => {
        logger.info(`Executing scheduled Good Afternoon scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('goodAfternoon');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            const result = await shadeService.triggerShadeScene('good-afternoon');
            logger.info(`Good Afternoon scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          }, null, 'good-afternoon');
        } catch (error) {
          logger.error(`Error executing Good Afternoon scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('good-afternoon');
          }
        }
      });
      
      logger.info(`Scheduled Good Afternoon for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      logger.error(`Error scheduling Good Afternoon: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Evening scene
   * @param {moment} sunsetTime - Sunset time as moment object
   */
  async scheduleGoodEvening(sunsetTime) {
    try {
      // Calculate time before sunset
      const offsetMinutes = configManager.get('shadeScenes.goodEveningOffset', 0);
      const scheduleTime = moment(sunsetTime).subtract(60, 'minutes').add(offsetMinutes, 'minutes').toDate();
      
      // If the scheduled time has already passed for today, don't schedule
      const now = new Date();
      if (scheduleTime <= now) {
        logger.info(`Good Evening time (${scheduleTime.toLocaleTimeString()}) has already passed for today`);
        return;
      }
      
      this.schedules.goodEvening = schedule.scheduleJob(scheduleTime, async () => {
        logger.info(`Executing scheduled Good Evening scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('goodEvening');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            const result = await shadeService.triggerShadeScene('good-evening');
            logger.info(`Good Evening scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          }, null, 'good-evening');
        } catch (error) {
          logger.error(`Error executing Good Evening scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('good-evening');
          }
        }
      });
      
      logger.info(`Scheduled Good Evening for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      logger.error(`Error scheduling Good Evening: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Night scene
   * @param {moment} sunsetTime - Sunset time as moment object
   */
  async scheduleGoodNight(sunsetTime) {
    try {
      // Calculate time after sunset
      const offsetMinutes = configManager.get('shadeScenes.goodNightOffset', 30);
      const scheduleTime = moment(sunsetTime).add(offsetMinutes, 'minutes').toDate();
      
      // If the scheduled time has already passed for today, don't schedule
      const now = new Date();
      if (scheduleTime <= now) {
        logger.info(`Good Night time (${scheduleTime.toLocaleTimeString()}) has already passed for today`);
        return;
      }
      
      this.schedules.goodNight = schedule.scheduleJob(scheduleTime, async () => {
        logger.info(`Executing scheduled Good Night scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('goodNight');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            const result = await shadeService.triggerShadeScene('good-night');
            logger.info(`Good Night scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          }, null, 'good-night');
        } catch (error) {
          logger.error(`Error executing Good Night scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('good-night');
          }
        }
      });
      
      logger.info(`Scheduled Good Night for ${scheduleTime.toLocaleTimeString()}`);
    } catch (error) {
      logger.error(`Error scheduling Good Night: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Wake Up sequence (Rise and Shine, Let the Sun In, Start the Day)
   */
  async scheduleWakeUp() {
    try {
      // Get the next wake-up time from config
      const nextWakeUpTime = configManager.get('wakeUpTime.nextWakeUpTime');
      
      // If no next wake-up time is set, don't schedule anything
      if (!nextWakeUpTime) {
        logger.info('No next wake-up time set, skipping Wake Up sequence scheduling');
        return;
      }
      
      const [hours, minutes] = nextWakeUpTime.split(':').map(Number);
      
      // Create the schedule for Rise and Shine (main wake-up time)
      const now = new Date();
      const riseAndShineTime = new Date(now);
      riseAndShineTime.setHours(hours, minutes, 0, 0);
      
      // If the scheduled time has already passed for today, don't schedule
      if (riseAndShineTime <= now) {
        logger.info(`Rise and Shine time (${nextWakeUpTime}) has already passed for today`);
        return;
      }
      
      // Schedule Rise and Shine
      this.schedules.riseAndShine = schedule.scheduleJob(riseAndShineTime, async () => {
        logger.info(`Executing scheduled Rise and Shine scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('riseAndShine');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            
            // Trigger Rise and Shine
            const result = await shadeService.triggerShadeScene('rise-and-shine');
            logger.info(`Rise and Shine scene execution ${result.success ? 'succeeded' : 'failed'}`);
            
            // Also trigger Good Morning scene at the same time
            const morningResult = await shadeService.triggerShadeScene('good-morning');
            logger.info(`Good Morning scene execution ${morningResult.success ? 'succeeded' : 'failed'}`);
            
            // Clear the next wake-up time since it's been used
            configManager.set('wakeUpTime.nextWakeUpTime', null);
            
            return { riseAndShine: result, goodMorning: morningResult };
          }, null, 'rise-and-shine');
        } catch (error) {
          logger.error(`Error executing Rise and Shine scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('rise-and-shine');
          }
        }
      });
      
      // Calculate Let the Sun In time (7 minutes after wake-up)
      const letTheSunInDelay = configManager.get('shadeScenes.letTheSunInDelay', 7);
      const letTheSunInTime = new Date(riseAndShineTime.getTime() + (letTheSunInDelay * 60 * 1000));
      
      // Schedule Let the Sun In
      this.schedules.letTheSunIn = schedule.scheduleJob(letTheSunInTime, async () => {
        logger.info(`Executing scheduled Let the Sun In scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('letTheSunIn');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            const result = await shadeService.triggerShadeScene('let-the-sun-in');
            logger.info(`Let the Sun In scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          }, null, 'let-the-sun-in');
        } catch (error) {
          logger.error(`Error executing Let the Sun In scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('let-the-sun-in');
          }
        }
      });
      
      // Calculate Start the Day time (20 minutes after wake-up)
      const startTheDayDelay = configManager.get('shadeScenes.startTheDayDelay', 20);
      const startTheDayTime = new Date(riseAndShineTime.getTime() + (startTheDayDelay * 60 * 1000));
      
      // Schedule Start the Day
      this.schedules.startTheDay = schedule.scheduleJob(startTheDayTime, async () => {
        logger.info(`Executing scheduled Start the Day scene at ${new Date().toLocaleTimeString()}`);
        
        // Track schedule execution
        this.recordScheduleExecution('startTheDay');
        
        try {
          // Use circuit breaker to protect from shade service failures
          await this.shadeCircuit.execute(async () => {
            const shadeService = this.getShadeService();
            const result = await shadeService.triggerShadeScene('start-the-day');
            logger.info(`Start the Day scene execution ${result.success ? 'succeeded' : 'failed'}`);
            return result;
          }, null, 'start-the-day');
        } catch (error) {
          logger.error(`Error executing Start the Day scene: ${error.message}`);
          // Record as missed if circuit breaker didn't already handle it
          if (this.shadeCircuit.state !== CircuitBreaker.STATES.OPEN) {
            this.recordMissedSchedule('start-the-day');
          }
        }
      });
      
      logger.info(`Scheduled Wake Up sequence: Rise and Shine at ${riseAndShineTime.toLocaleTimeString()}, Let the Sun In at ${letTheSunInTime.toLocaleTimeString()}, Start the Day at ${startTheDayTime.toLocaleTimeString()}`);
    } catch (error) {
      logger.error(`Error scheduling Wake Up sequence: ${error.message}`);
    }
  }
  
  /**
   * Record a scheduled execution for monitoring
   * @param {string} scheduleName - Name of the schedule executed
   */
  recordScheduleExecution(scheduleName) {
    const time = Date.now();
    
    // Initialize history for this schedule if needed
    if (!this.scheduleHistory[scheduleName]) {
      this.scheduleHistory[scheduleName] = {
        lastExecution: time,
        executionCount: 0,
        missedCount: 0,
        attempts: []
      };
    }
    
    // Update history
    this.scheduleHistory[scheduleName].lastExecution = time;
    this.scheduleHistory[scheduleName].executionCount++;
    
    // Add to limited history array
    this.scheduleHistory[scheduleName].attempts.unshift({
      time,
      success: true
    });
    
    // Limit history length
    if (this.scheduleHistory[scheduleName].attempts.length > 10) {
      this.scheduleHistory[scheduleName].attempts.pop();
    }
  }
  
  /**
   * Record a missed schedule for recovery
   * @param {string} sceneName - Name of the scene that was missed
   */
  recordMissedSchedule(sceneName) {
    // Initialize history for this schedule if needed
    const scheduleName = this.mapSceneToSchedule(sceneName);
    
    if (!this.scheduleHistory[scheduleName]) {
      this.scheduleHistory[scheduleName] = {
        lastExecution: null,
        executionCount: 0,
        missedCount: 0,
        attempts: []
      };
    }
    
    // Update history
    this.scheduleHistory[scheduleName].missedCount++;
    
    // Add to limited history array
    this.scheduleHistory[scheduleName].attempts.unshift({
      time: Date.now(),
      success: false,
      reason: `Missed execution of ${sceneName}`
    });
    
    // Limit history length
    if (this.scheduleHistory[scheduleName].attempts.length > 10) {
      this.scheduleHistory[scheduleName].attempts.pop();
    }
    
    // Add to missed schedules list
    this.missedSchedules.push({
      sceneName,
      scheduleName,
      time: Date.now(),
      recovered: false
    });
    
    // Limit missed schedules list length
    if (this.missedSchedules.length > 50) {
      this.missedSchedules = this.missedSchedules.slice(0, 50);
    }
    
    logger.warn(`Recorded missed schedule: ${scheduleName} (scene: ${sceneName})`);
  }
  
  /**
   * Map a scene name to schedule name
   * @param {string} sceneName - Name of the scene (e.g., 'good-morning')
   * @returns {string} - Schedule name (e.g., 'goodMorning')
   */
  mapSceneToSchedule(sceneName) {
    const sceneToScheduleMap = {
      'good-morning': 'goodMorning',
      'good-afternoon': 'goodAfternoon',
      'good-evening': 'goodEvening',
      'good-night': 'goodNight',
      'rise-and-shine': 'riseAndShine',
      'let-the-sun-in': 'letTheSunIn',
      'start-the-day': 'startTheDay'
    };
    
    return sceneToScheduleMap[sceneName] || sceneName;
  }
  
  /**
   * Map a schedule name to scene name
   * @param {string} scheduleName - Name of the schedule (e.g., 'goodMorning')
   * @returns {string} - Scene name (e.g., 'good-morning')
   */
  mapScheduleToScene(scheduleName) {
    const scheduleToSceneMap = {
      'goodMorning': 'good-morning',
      'goodAfternoon': 'good-afternoon',
      'goodEvening': 'good-evening',
      'goodNight': 'good-night',
      'riseAndShine': 'rise-and-shine',
      'letTheSunIn': 'let-the-sun-in',
      'startTheDay': 'start-the-day'
    };
    
    return scheduleToSceneMap[scheduleName] || scheduleName;
  }
  
  /**
   * Check for missed schedules (called periodically)
   */
  checkForMissedSchedules() {
    // Don't check too frequently
    const now = Date.now();
    if (now - this.lastScheduleCheck < 60000) { // At least 1 minute between checks
      return;
    }
    
    this.lastScheduleCheck = now;
    
    // Check all active schedules
    for (const [name, job] of Object.entries(this.schedules)) {
      if (!job) continue;
      
      const nextExecution = job.nextInvocation();
      
      // If next execution is in the past, the schedule might have been missed
      if (nextExecution && nextExecution < now) {
        logger.warn(`Schedule ${name} appears to have been missed, next execution was ${nextExecution}`);
        
        // Record the missed schedule
        const sceneName = this.mapScheduleToScene(name);
        this.recordMissedSchedule(sceneName);
        
        // Reschedule for now + 1 minute to prevent immediate execution flood
        try {
          job.cancel();
          delete this.schedules[name];
          
          // Only reschedule certain scenes based on time of day
          const hourOfDay = new Date().getHours();
          
          // Morning scenes only before noon
          if ((name === 'goodMorning' || name === 'riseAndShine') && hourOfDay >= 12) {
            logger.info(`Not rescheduling ${name} as it's already past morning`);
            continue;
          }
          
          // Evening scenes only after noon
          if ((name === 'goodEvening' || name === 'goodNight') && hourOfDay < 12) {
            logger.info(`Not rescheduling ${name} as it's too early for evening`);
            continue;
          }
          
          logger.info(`Rescheduling missed ${name} to execute soon`);
          
          // Create a new schedule for 1 minute from now
          const rescheduleTime = new Date(now + 60000);
          this.schedules[name] = schedule.scheduleJob(rescheduleTime, async () => {
            logger.info(`Executing rescheduled ${name} scene at ${new Date().toLocaleTimeString()}`);
            
            try {
              // Use circuit breaker to protect from shade service failures
              await this.shadeCircuit.execute(async () => {
                const shadeService = this.getShadeService();
                const result = await shadeService.triggerShadeScene(sceneName);
                logger.info(`Rescheduled ${name} scene execution ${result.success ? 'succeeded' : 'failed'}`);
                return result;
              }, null, sceneName);
              
              // Mark the missed schedule as recovered
              this.markMissedScheduleRecovered(sceneName);
            } catch (error) {
              logger.error(`Error executing rescheduled ${name} scene: ${error.message}`);
            }
          });
        } catch (rescheduleError) {
          logger.error(`Failed to reschedule ${name}: ${rescheduleError.message}`);
        }
      }
    }
  }
  
  /**
   * Mark a missed schedule as recovered
   * @param {string} sceneName - Name of the scene that was recovered
   */
  markMissedScheduleRecovered(sceneName) {
    // Find any unrecovered missed schedules for this scene
    const recovered = this.missedSchedules.filter(miss => 
      miss.sceneName === sceneName && !miss.recovered
    );
    
    // Mark all as recovered
    recovered.forEach(miss => {
      miss.recovered = true;
      miss.recoveryTime = Date.now();
    });
    
    if (recovered.length > 0) {
      logger.info(`Marked ${recovered.length} missed ${sceneName} schedules as recovered`);
    }
  }
  
  /**
   * Recover all missed schedules
   * @returns {Promise<number>} - Number of schedules recovered
   */
  async recoverMissedSchedules() {
    // Get unrecovered missed schedules
    const unrecovered = this.missedSchedules.filter(miss => !miss.recovered);
    
    if (unrecovered.length === 0) {
      logger.info('No missed schedules to recover');
      return 0;
    }
    
    logger.info(`Attempting to recover ${unrecovered.length} missed schedules`);
    
    let recoveredCount = 0;
    
    // Recover each missed schedule with a delay between them
    for (const missed of unrecovered) {
      try {
        // Use circuit breaker to protect from shade service failures
        await this.shadeCircuit.execute(async () => {
          const shadeService = this.getShadeService();
          logger.info(`Recovering missed ${missed.sceneName} schedule from ${new Date(missed.time).toLocaleString()}`);
          
          const result = await shadeService.triggerShadeScene(missed.sceneName);
          logger.info(`Recovered ${missed.sceneName} execution ${result.success ? 'succeeded' : 'failed'}`);
          return result;
        }, null, missed.sceneName);
        
        // Mark as recovered
        missed.recovered = true;
        missed.recoveryTime = Date.now();
        recoveredCount++;
        
        // Add a small delay between recoveries to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Failed to recover missed ${missed.sceneName} schedule: ${error.message}`);
      }
    }
    
    logger.info(`Recovered ${recoveredCount}/${unrecovered.length} missed schedules`);
    return recoveredCount;
  }
  
  /**
   * Set the wake-up time for tomorrow
   * @param {string} time - Time in HH:MM format (24-hour)
   */
  setWakeUpTime(time) {
    try {
      // Update the config
      configManager.setNextWakeUpTime(time);
      
      // Cancel any existing wake-up schedules
      ['riseAndShine', 'letTheSunIn', 'startTheDay'].forEach(name => {
        if (this.schedules[name]) {
          this.schedules[name].cancel();
          delete this.schedules[name];
        }
      });
      
      // Schedule the new wake-up sequence
      this.scheduleWakeUp().catch(err => {
        logger.error(`Error scheduling wake-up sequence: ${err.message}`);
      });
      
      return {
        success: true,
        message: `Wake-up time set to ${time}`
      };
    } catch (error) {
      logger.error(`Error setting wake-up time: ${error.message}`);
      return {
        success: false,
        error: `Failed to set wake-up time: ${error.message}`
      };
    }
  }
  
  /**
   * Get the wake-up time for tomorrow
   * Returns the nextWakeUpTime if set, otherwise the default time
   */
  getWakeUpTimeForTomorrow() {
    return configManager.get('wakeUpTime.nextWakeUpTime') || configManager.get('wakeUpTime.defaultTime');
  }
  
  /**
   * Get all active schedules
   * @returns {object} - Object containing all active schedules
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
          }),
          history: this.scheduleHistory[name] || {
            executionCount: 0,
            missedCount: 0
          }
        };
      }
    }
    
    return {
      success: true,
      data: scheduleDetails,
      missedSchedules: {
        count: this.missedSchedules.length,
        pending: this.missedSchedules.filter(m => !m.recovered).length
      }
    };
  }
  
  /**
   * Manually trigger a shade scene schedule
   * @param {string} sceneName - The name of the scene schedule to trigger
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
      
      logger.info(`Manually triggering scene schedule: ${sceneName}`);
      
      // Use circuit breaker for manual triggers as well
      const result = await this.shadeCircuit.execute(async () => {
        const shadeService = this.getShadeService();
        return await shadeService.triggerShadeScene(sceneMap[sceneName]);
      }, null, sceneMap[sceneName]);
      
      // Record the execution
      this.recordScheduleExecution(sceneName);
      
      // If there were any missed schedules for this scene, mark them as recovered
      this.markMissedScheduleRecovered(sceneMap[sceneName]);
      
      return {
        success: result.success,
        message: `Manually triggered ${sceneName} schedule`,
        details: result
      };
    } catch (error) {
      logger.error(`Error triggering schedule ${sceneName}: ${error.message}`);
      return {
        success: false,
        error: `Failed to trigger schedule: ${error.message}`
      };
    }
  }
  
  /**
   * Get circuit breaker statistics
   */
  getCircuitStatus() {
    return {
      shadeControl: this.shadeCircuit.getStatus(),
      weatherService: this.weatherCircuit.getStatus()
    };
  }
  
  /**
   * Get missed schedule information
   */
  getMissedSchedules() {
    return {
      total: this.missedSchedules.length,
      pending: this.missedSchedules.filter(m => !m.recovered).length,
      recovered: this.missedSchedules.filter(m => m.recovered).length,
      details: this.missedSchedules.slice(0, 10).map(miss => ({
        sceneName: miss.sceneName,
        scheduleName: miss.scheduleName,
        missed: new Date(miss.time).toLocaleString(),
        recovered: miss.recovered,
        recoveryTime: miss.recoveryTime ? new Date(miss.recoveryTime).toLocaleString() : null
      }))
    };
  }
  
  /**
   * Refresh all schedules (called at midnight)
   */
  async refreshSchedules() {
    logger.info('Refreshing schedules for new day');
    
    // Cancel all existing schedules
    this.cancelAllSchedules();
    
    // Re-initialize schedules
    await this.setupDailySchedules();
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} - True if initialized, false otherwise
   */
  isInitialized() {
    return this.initialized;
  }
  
  /**
   * Force a reset of the scheduler service
   * Used for testing and recovery
   */
  async forceReset() {
    logger.info('Force resetting scheduler service');
    
    // Reset all circuit breakers
    this.shadeCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset');
    this.weatherCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset');
    
    // Cancel all schedules
    this.cancelAllSchedules();
    
    // Reload sunset data
    await this.loadSunsetData();
    
    // Recreate all schedules
    await this.setupDailySchedules();
    
    // Recover any missed schedules
    const recoveredCount = await this.recoverMissedSchedules();
    
    return { 
      success: true, 
      message: 'Scheduler service reset successful',
      schedulesCreated: Object.keys(this.schedules).length,
      missedSchedulesRecovered: recoveredCount
    };
  }
}

// Create and export a singleton instance
const schedulerService = new SchedulerService();
module.exports = schedulerService;