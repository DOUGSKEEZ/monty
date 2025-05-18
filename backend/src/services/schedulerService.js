const cron = require('node-cron');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment');
const logger = require('../utils/logger').getModuleLogger('scheduler-service');
const configManager = require('../utils/config');
const weatherService = require('./weatherService');
const shadeService = require('./shadeService');

class SchedulerService {
  constructor() {
    this.schedules = {};
    this.sunsetData = {};
    this.sunriseData = {};
    this.initialized = false;
    this.sunsetDataPath = path.join(__dirname, '../../../data/sunset_data.csv');
    
    // Initialize scheduler
    this.init();
  }
  
  /**
   * Initialize the scheduler service
   */
  async init() {
    try {
      // Load sunset data
      await this.loadSunsetData();
      
      // Initialize daily schedules
      this.initializeSchedules();
      
      // Set up daily refresh at midnight
      cron.schedule('0 0 * * *', () => {
        logger.info('Running midnight schedule refresh');
        this.refreshSchedules();
      });
      
      this.initialized = true;
      logger.info('Scheduler service initialized');
    } catch (error) {
      logger.error(`Error initializing scheduler service: ${error.message}`);
    }
  }
  
  /**
   * Load sunset data from CSV file
   */
  async loadSunsetData() {
    try {
      if (!fs.existsSync(this.sunsetDataPath)) {
        logger.error(`Sunset data file not found at ${this.sunsetDataPath}`);
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
      
      logger.info(`Loaded ${Object.keys(this.sunsetData).length} sunset records`);
    } catch (error) {
      logger.error(`Error loading sunset data: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Initialize daily schedules
   */
  async initializeSchedules() {
    // Cancel any existing schedules
    this.cancelAllSchedules();
    
    // Set up schedules for today
    await this.setupDailySchedules();
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
      
      // Get sun times from a variety of sources
      let sunriseTime;
      let sunsetTime;
      
      // 1. Try to get from weather service
      try {
        const sunTimes = await weatherService.getSunriseSunsetTimes();
        if (sunTimes.success) {
          sunriseTime = moment(sunTimes.data.sunrise);
          sunsetTime = moment(sunTimes.data.sunset);
          logger.info(`Using sun times from weather service: Rise ${sunriseTime.format('HH:mm')}, Set ${sunsetTime.format('HH:mm')}`);
        }
      } catch (error) {
        logger.warn(`Could not get sun times from weather service: ${error.message}`);
      }
      
      // 2. Fall back to sunset data file
      if (!sunsetTime && this.sunsetData[today]) {
        sunsetTime = moment(this.sunsetData[today], 'HH:mm');
        logger.info(`Using sunset time from data file: ${sunsetTime.format('HH:mm')}`);
      }
      
      // 3. If still no data, use hardcoded reasonable defaults for Silverthorne
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
      
      // Schedule Good Morning - Based on Wake Up time or default
      await this.scheduleGoodMorning();
      
      // Schedule Good Afternoon - Based on sun position (mid-day)
      await this.scheduleGoodAfternoon(sunriseTime, sunsetTime);
      
      // Schedule Good Evening - Based on time before sunset
      await this.scheduleGoodEvening(sunsetTime);
      
      // Schedule Good Night - Based on time after sunset
      await this.scheduleGoodNight(sunsetTime);
      
      // If a wake-up time is set, schedule the bedroom shade scenes
      await this.scheduleWakeUp();
      
      logger.info('All daily schedules have been set up');
    } catch (error) {
      logger.error(`Error setting up daily schedules: ${error.message}`);
    }
  }
  
  /**
   * Schedule the Good Morning scene
   */
  async scheduleGoodMorning() {
    try {
      // Get wake-up time from config, or use default
      const wakeUpTime = configManager.getWakeUpTimeForTomorrow();
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
        try {
          const result = await shadeService.triggerShadeScene('good-morning');
          logger.info(`Good Morning scene execution ${result.success ? 'succeeded' : 'failed'}`);
        } catch (error) {
          logger.error(`Error executing Good Morning scene: ${error.message}`);
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
        try {
          const result = await shadeService.triggerShadeScene('good-afternoon');
          logger.info(`Good Afternoon scene execution ${result.success ? 'succeeded' : 'failed'}`);
        } catch (error) {
          logger.error(`Error executing Good Afternoon scene: ${error.message}`);
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
        try {
          const result = await shadeService.triggerShadeScene('good-evening');
          logger.info(`Good Evening scene execution ${result.success ? 'succeeded' : 'failed'}`);
        } catch (error) {
          logger.error(`Error executing Good Evening scene: ${error.message}`);
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
        try {
          const result = await shadeService.triggerShadeScene('good-night');
          logger.info(`Good Night scene execution ${result.success ? 'succeeded' : 'failed'}`);
        } catch (error) {
          logger.error(`Error executing Good Night scene: ${error.message}`);
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
        try {
          const result = await shadeService.triggerShadeScene('rise-and-shine');
          logger.info(`Rise and Shine scene execution ${result.success ? 'succeeded' : 'failed'}`);
          
          // Also trigger Good Morning scene at the same time
          const morningResult = await shadeService.triggerShadeScene('good-morning');
          logger.info(`Good Morning scene execution ${morningResult.success ? 'succeeded' : 'failed'}`);
          
          // Clear the next wake-up time since it's been used
          configManager.set('wakeUpTime.nextWakeUpTime', null);
        } catch (error) {
          logger.error(`Error executing Rise and Shine scene: ${error.message}`);
        }
      });
      
      // Calculate Let the Sun In time (7 minutes after wake-up)
      const letTheSunInDelay = configManager.get('shadeScenes.letTheSunInDelay', 7);
      const letTheSunInTime = new Date(riseAndShineTime.getTime() + (letTheSunInDelay * 60 * 1000));
      
      // Schedule Let the Sun In
      this.schedules.letTheSunIn = schedule.scheduleJob(letTheSunInTime, async () => {
        logger.info(`Executing scheduled Let the Sun In scene at ${new Date().toLocaleTimeString()}`);
        try {
          const result = await shadeService.triggerShadeScene('let-the-sun-in');
          logger.info(`Let the Sun In scene execution ${result.success ? 'succeeded' : 'failed'}`);
        } catch (error) {
          logger.error(`Error executing Let the Sun In scene: ${error.message}`);
        }
      });
      
      // Calculate Start the Day time (20 minutes after wake-up)
      const startTheDayDelay = configManager.get('shadeScenes.startTheDayDelay', 20);
      const startTheDayTime = new Date(riseAndShineTime.getTime() + (startTheDayDelay * 60 * 1000));
      
      // Schedule Start the Day
      this.schedules.startTheDay = schedule.scheduleJob(startTheDayTime, async () => {
        logger.info(`Executing scheduled Start the Day scene at ${new Date().toLocaleTimeString()}`);
        try {
          const result = await shadeService.triggerShadeScene('start-the-day');
          logger.info(`Start the Day scene execution ${result.success ? 'succeeded' : 'failed'}`);
        } catch (error) {
          logger.error(`Error executing Start the Day scene: ${error.message}`);
        }
      });
      
      logger.info(`Scheduled Wake Up sequence: Rise and Shine at ${riseAndShineTime.toLocaleTimeString()}, Let the Sun In at ${letTheSunInTime.toLocaleTimeString()}, Start the Day at ${startTheDayTime.toLocaleTimeString()}`);
    } catch (error) {
      logger.error(`Error scheduling Wake Up sequence: ${error.message}`);
    }
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
      this.scheduleWakeUp();
      
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
          })
        };
      }
    }
    
    return {
      success: true,
      data: scheduleDetails
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
      const result = await shadeService.triggerShadeScene(sceneMap[sceneName]);
      
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
}

// Create and export a singleton instance
const schedulerService = new SchedulerService();
module.exports = schedulerService;