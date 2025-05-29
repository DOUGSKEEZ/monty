/**
 * WeatherService - Modern v2.0 weather service with full integration
 * 
 * This service provides weather data with:
 * - ServiceRegistry integration
 * - ServiceWatchdog monitoring 
 * - RetryHelper for resilient API calls
 * - CircuitBreaker protection
 * - PrometheusMetrics collection
 * - Automatic health monitoring and recovery
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const IWeatherService = require('../interfaces/IWeatherService');
const logger = require('../utils/logger').getModuleLogger('weather-service');
const prometheusMetrics = require('./PrometheusMetricsService');

class WeatherService extends IWeatherService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog) {
    super();
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;
    
    // Configuration - Load API key securely from environment
    this.apiKey = process.env.OPENWEATHERMAP_API_KEY || this.configManager.get('weather.apiKey');
    this.city = this.configManager.get('weather.city', 'Silverthorne');
    this.latitude = this.configManager.get('weather.latitude', 39.66339791188263);
    this.longitude = this.configManager.get('weather.longitude', -106.06779952152995);
    this.units = this.configManager.get('weather.units', 'imperial');
    this.cacheTimeout = this.configManager.get('weather.cacheTimeout', 300000); // 5 minutes
    this.requestTimeout = this.configManager.get('weather.requestTimeout', 10000);
    this.useOneCallAPI = this.configManager.get('weather.useOneCallAPI', true);
    this.updateInterval = this.configManager.get('weather.updateInterval', 300000); // 5 minutes
    this.manualCooldown = this.configManager.get('weather.manualCooldown', 10000); // 10 seconds - user-friendly
    this.dailyLimit = this.configManager.get('weather.dailyLimit', 999);
    
    // State
    this.cache = {
      current: null,
      forecast: null,
      oneCallData: null, // Unified One Call API data
      lastFetch: null
    };
    this.lastError = null;
    this.isInitialized = false;
    this.ongoingRequest = null; // Prevent duplicate concurrent API calls
    
    // API Usage Tracking with persistence
    this.apiUsageFile = path.join(__dirname, '../../data/cache/api_usage.json');
    this.apiUsage = this.loadApiUsage();

    // Register with ServiceRegistry
    this.serviceRegistry.register('WeatherService', {
      instance: this,
      isCore: false,
      checkHealth: this.healthCheck.bind(this),
    });

    // Register with ServiceWatchdog
    this.serviceWatchdog.registerService('WeatherService', {
      isCritical: false,
      monitorMemory: false,
      recoveryProcedure: this.recoveryProcedure.bind(this),
    });

    // Mark service as ready
    this.serviceRegistry.setStatus('WeatherService', 'ready');
    logger.info('WeatherService v2.0 initialized with full integration');
    logger.info(`API usage loaded: ${this.apiUsage.dailyCount}/${this.dailyLimit} calls for ${this.apiUsage.lastResetDate}`);
  }

  /**
   * Initialize the weather service
   */
  async initialize() {
    try {
      if (!this.apiKey) {
        throw new Error('Weather API key not configured');
      }

      // Test API connectivity
      await this.getCurrentWeather();
      
      this.isInitialized = true;
      this.serviceRegistry.setStatus('WeatherService', 'ready');
      prometheusMetrics.setServiceHealth('WeatherService', 'ok');
      
      logger.info('WeatherService initialized successfully');
      return { success: true, message: 'WeatherService initialized' };
    } catch (error) {
      this.lastError = error.message;
      this.serviceRegistry.setStatus('WeatherService', 'error');
      prometheusMetrics.setServiceHealth('WeatherService', 'error');
      
      logger.error(`Failed to initialize WeatherService: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current weather data with retry logic and circuit breaker
   * @param {boolean} forceRefresh - Skip cache and force fresh data
   * @returns {Promise<Object>} Current weather information
   */
  async getCurrentWeather(forceRefresh = false) {
    // Use One Call API if enabled
    if (this.useOneCallAPI) {
      try {
        // SINGLE API CALL - get all weather data at once
        await this.getOneCallData(forceRefresh);
        return this.cache.current;
      } catch (error) {
        logger.warn(`One Call API failed, falling back to legacy API: ${error.message}`);
        // Fall through to legacy API
      }
    }
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Check cache first (unless forced refresh)
          if (!forceRefresh && this.isCacheValid() && this.cache.current) {
            logger.debug('Returning cached current weather data');
            prometheusMetrics.recordOperation('weather-current-cache', true);
            return this.cache.current;
          }

          logger.info(`Fetching current weather for ${this.city} (legacy API)`);
          
          const url = `https://api.openweathermap.org/data/2.5/weather?q=${this.city}&appid=${this.apiKey}&units=${this.units}`;
          const data = await this.makeHttpRequest(url);
          
          this.cache.current = this.formatCurrentWeather(data);
          this.cache.lastFetch = Date.now();
          this.lastError = null;
          
          prometheusMetrics.recordOperation('weather-current-fetch', true);
          prometheusMetrics.setServiceHealth('WeatherService', 'ok');
          
          logger.debug('Current weather data fetched and cached');
          return this.cache.current;
        } catch (error) {
          prometheusMetrics.recordOperation('weather-current-fetch', false);
          this.lastError = error.message;
          
          // Return cached data if available, even if stale
          if (this.cache.current) {
            logger.warn('Returning stale cached weather data due to fetch error');
            prometheusMetrics.recordOperation('weather-current-stale', true);
            return this.cache.current;
          }
          
          throw error;
        }
      },
      {
        operationName: 'weather-current',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Get weather forecast data with retry logic and circuit breaker
   * @param {boolean} forceRefresh - Skip cache and force fresh data
   * @returns {Promise<Object>} Weather forecast information
   */
  async getForecast(forceRefresh = false) {
    // Use One Call API if enabled  
    if (this.useOneCallAPI) {
      try {
        // REUSE SAME API CALL - no additional API request needed!
        await this.getOneCallData(forceRefresh);
        return this.cache.forecast;
      } catch (error) {
        logger.warn(`One Call API failed, falling back to legacy API: ${error.message}`);
        // Fall through to legacy API
      }
    }
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Check cache first (unless forced refresh)
          if (!forceRefresh && this.isCacheValid() && this.cache.forecast) {
            logger.debug('Returning cached forecast data');
            prometheusMetrics.recordOperation('weather-forecast-cache', true);
            return this.cache.forecast;
          }

          logger.info(`Fetching weather forecast for ${this.city} (legacy API)`);
          
          const url = `https://api.openweathermap.org/data/2.5/forecast?q=${this.city}&appid=${this.apiKey}&units=${this.units}`;
          const data = await this.makeHttpRequest(url);
          
          this.cache.forecast = this.formatForecast(data);
          this.cache.lastFetch = Date.now();
          this.lastError = null;
          
          prometheusMetrics.recordOperation('weather-forecast-fetch', true);
          prometheusMetrics.setServiceHealth('WeatherService', 'ok');
          
          logger.debug('Forecast data fetched and cached');
          return this.cache.forecast;
        } catch (error) {
          prometheusMetrics.recordOperation('weather-forecast-fetch', false);
          this.lastError = error.message;
          
          // Return cached data if available, even if stale
          if (this.cache.forecast) {
            logger.warn('Returning stale cached forecast data due to fetch error');
            prometheusMetrics.recordOperation('weather-forecast-stale', true);
            return this.cache.forecast;
          }
          
          throw error;
        }
      },
      {
        operationName: 'weather-forecast',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Get comprehensive weather data from One Call API 3.0
   * @param {boolean} forceRefresh - Skip cache and force fresh data
   * @returns {Promise<Object>} Complete weather data from One Call API
   */
  async getOneCallData(forceRefresh = false) {
    // CRITICAL: Prevent duplicate concurrent API calls
    if (this.ongoingRequest) {
      logger.debug('One Call API request already in progress - waiting for result');
      return await this.ongoingRequest;
    }

    // Check cache first (unless forced refresh)
    if (!forceRefresh && this.isCacheValid() && this.cache.oneCallData) {
      logger.debug('Returning cached One Call API data');
      prometheusMetrics.recordOperation('weather-onecall-cache', true);
      return this.cache.oneCallData;
    }

    // Create the API request promise and store it to prevent duplicates
    this.ongoingRequest = this.retryHelper.retryOperation(
      async () => {
        try {
          const requestType = forceRefresh ? 'MANUAL' : 'AUTOMATIC';
          logger.info(`🌤️ Making OpenWeatherMap One Call API request - Type: ${requestType} - Location: ${this.city} (${this.latitude}, ${this.longitude})`);
          
          // One Call API 3.0 URL with all data types (including alerts for mountain weather safety)
          const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${this.latitude}&lon=${this.longitude}&appid=${this.apiKey}&units=${this.units}&exclude=minutely`;
          const data = await this.makeHttpRequest(url);
          
          // Track API usage for cost management
          this.trackApiUsage(forceRefresh);
          
          logger.info(`✅ OpenWeatherMap API request completed - Type: ${requestType} - Daily usage: ${this.apiUsage.dailyCount}/${this.dailyLimit}`);
          
          this.cache.oneCallData = data;
          this.cache.lastFetch = Date.now();
          this.lastError = null;
          
          // Update individual caches from One Call data
          this.cache.current = this.formatCurrentWeatherFromOneCall(data);
          this.cache.forecast = this.formatForecastFromOneCall(data);
          
          prometheusMetrics.recordOperation('weather-onecall-fetch', true);
          prometheusMetrics.setServiceHealth('WeatherService', 'ok');
          
          logger.debug('One Call API data fetched and cached');
          return data;
        } catch (error) {
          prometheusMetrics.recordOperation('weather-onecall-fetch', false);
          this.lastError = error.message;
          
          // Return cached data if available, even if stale
          if (this.cache.oneCallData) {
            logger.warn('Returning stale cached One Call API data due to fetch error');
            prometheusMetrics.recordOperation('weather-onecall-stale', true);
            return this.cache.oneCallData;
          }
          
          throw error;
        }
      },
      {
        operationName: 'weather-onecall',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );

    try {
      const result = await this.ongoingRequest;
      return result;
    } finally {
      // Clear the ongoing request flag
      this.ongoingRequest = null;
    }
  }

  /**
   * Check if cached data is still valid
   * @returns {boolean} True if cache is valid
   */
  isCacheValid() {
    if (!this.cache.lastFetch) {
      return false;
    }
    
    const now = Date.now();
    const cacheAge = now - this.cache.lastFetch;
    return cacheAge < this.cacheTimeout;
  }

  /**
   * Clear the weather data cache
   */
  clearCache() {
    this.cache = {
      current: null,
      forecast: null,
      oneCallData: null,
      lastFetch: null
    };
    logger.debug('Weather cache cleared');
    prometheusMetrics.recordOperation('weather-cache-clear', true);
  }

  /**
   * Track API usage for cost management
   * @param {boolean} isManual - Whether this was a manual refresh
   */
  trackApiUsage(isManual = false) {
    const today = new Date().toDateString();
    
    // Reset daily counter if new day
    if (this.apiUsage.lastResetDate !== today) {
      this.apiUsage.dailyCount = 0;
      this.apiUsage.lastResetDate = today;
      logger.info('Daily API usage counter reset');
    }
    
    // Increment usage
    this.apiUsage.dailyCount++;
    
    // Track manual refresh timing
    if (isManual) {
      this.apiUsage.lastManualRefresh = Date.now();
    }
    
    // Calculate potential cost (free tier: 1000 calls, then $0.15 per 100)
    const overageCount = Math.max(0, this.apiUsage.dailyCount - this.dailyLimit);
    this.apiUsage.totalCost = (overageCount / 100) * 0.15;
    
    // Log usage warnings
    const usagePercent = (this.apiUsage.dailyCount / this.dailyLimit) * 100;
    if (usagePercent >= 90) {
      logger.warn(`⚠️  Weather API usage: ${this.apiUsage.dailyCount}/${this.dailyLimit} (${usagePercent.toFixed(1)}%) - Approaching daily limit!`);
    } else if (usagePercent >= 70) {
      logger.warn(`Weather API usage: ${this.apiUsage.dailyCount}/${this.dailyLimit} (${usagePercent.toFixed(1)}%) - Monitor usage`);
    }
    
    // Save to persistent storage
    this.saveApiUsage();
    
    logger.debug(`API call tracked: ${this.apiUsage.dailyCount}/${this.dailyLimit} (${usagePercent.toFixed(1)}%)`);
  }

  /**
   * Load API usage data from persistent storage
   * @returns {Object} API usage data
   */
  loadApiUsage() {
    try {
      if (fs.existsSync(this.apiUsageFile)) {
        const data = JSON.parse(fs.readFileSync(this.apiUsageFile, 'utf8'));
        const today = new Date().toDateString();
        
        // Reset if new day
        if (data.lastResetDate !== today) {
          logger.info(`New day detected. Resetting API usage counter from ${data.dailyCount} to 0`);
          return {
            dailyCount: 0,
            lastResetDate: today,
            lastManualRefresh: 0,
            totalCost: 0
          };
        }
        
        logger.info(`API usage restored from file: ${data.dailyCount} calls for ${data.lastResetDate}`);
        return data;
      }
    } catch (error) {
      logger.warn(`Failed to load API usage file: ${error.message}`);
    }
    
    // Default values if file doesn't exist or can't be read
    return {
      dailyCount: 0,
      lastResetDate: new Date().toDateString(),
      lastManualRefresh: 0,
      totalCost: 0
    };
  }

  /**
   * Save API usage data to persistent storage
   */
  saveApiUsage() {
    try {
      const dir = path.dirname(this.apiUsageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.apiUsageFile, JSON.stringify(this.apiUsage, null, 2));
    } catch (error) {
      logger.error(`Failed to save API usage file: ${error.message}`);
    }
  }

  /**
   * Check if manual refresh is allowed (respects cooldown and daily limits)
   * @returns {Object} Refresh status with details
   */
  canManualRefresh() {
    const now = Date.now();
    const timeSinceLastManual = now - this.apiUsage.lastManualRefresh;
    const cooldownRemaining = Math.max(0, this.manualCooldown - timeSinceLastManual);
    
    // Check daily limit (disable at 900+ calls)
    const approachingLimit = this.apiUsage.dailyCount >= 900;
    
    // Check cooldown
    const inCooldown = cooldownRemaining > 0;
    
    return {
      allowed: !inCooldown && !approachingLimit,
      reason: approachingLimit ? 'daily_limit' : inCooldown ? 'cooldown' : 'allowed',
      cooldownRemaining: Math.ceil(cooldownRemaining / 1000), // seconds
      dailyUsage: this.apiUsage.dailyCount,
      dailyLimit: this.dailyLimit,
      usagePercent: (this.apiUsage.dailyCount / this.dailyLimit) * 100
    };
  }

  /**
   * Get comprehensive usage statistics for dashboard
   * @returns {Object} Usage statistics
   */
  getUsageStats() {
    const now = Date.now();
    const lastUpdateAge = this.cache.lastFetch ? now - this.cache.lastFetch : null;
    const usagePercent = (this.apiUsage.dailyCount / this.dailyLimit) * 100;
    
    // Determine status color/message
    let status, statusColor;
    if (usagePercent >= 90) {
      status = 'Approaching limit';
      statusColor = 'red';
    } else if (usagePercent >= 70) {
      status = 'Monitor usage';
      statusColor = 'yellow';
    } else {
      status = 'Well within limits';
      statusColor = 'green';
    }
    
    return {
      dailyCount: this.apiUsage.dailyCount,
      dailyLimit: this.dailyLimit,
      usagePercent: Math.round(usagePercent * 10) / 10, // Round to 1 decimal
      status,
      statusColor,
      estimatedMonthlyCost: this.apiUsage.totalCost,
      lastUpdated: lastUpdateAge ? Math.round(lastUpdateAge / 60000) : null, // minutes ago
      manualRefreshStatus: this.canManualRefresh(),
      cacheAge: lastUpdateAge ? Math.round(lastUpdateAge / 1000) : null // seconds
    };
  }

  /**
   * Make an HTTPS request to the weather API with timeout
   * @param {string} url - The API URL to request
   * @returns {Promise<Object>} Parsed JSON response
   */
  makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            
            if (response.statusCode === 200) {
              resolve(jsonData);
            } else {
              reject(new Error(`API request failed with status ${response.statusCode}: ${jsonData.message || 'Unknown error'}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse API response: ${parseError.message}`));
          }
        });
      });
      
      request.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });
      
      request.setTimeout(this.requestTimeout, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Format current weather data for consistent output
   * @param {Object} data - Raw API response
   * @returns {Object} Formatted weather data
   */
  formatCurrentWeather(data) {
    return {
      location: {
        name: data.name,
        country: data.sys.country
      },
      temperature: {
        current: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like)
      },
      weather: {
        icon: data.weather[0].icon,
        description: data.weather[0].description
      },
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      wind: {
        speed: data.wind.speed,
        direction: data.wind.deg
      },
      cloudiness: data.clouds.all,
      visibility: data.visibility,
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Format forecast data grouped by days with hourly breakdowns
   * @param {Object} data - Raw API response from OpenWeatherMap 5-day forecast
   * @returns {Object} Formatted forecast data grouped by days
   */
  formatForecast(data) {
    // Group forecast entries by day
    const dayGroups = {};
    
    data.list.forEach(item => {
      const date = new Date(item.dt * 1000);
      const dayKey = date.toDateString(); // Groups by day (e.g., "Wed May 29 2025")
      
      if (!dayGroups[dayKey]) {
        dayGroups[dayKey] = {
          date: date.toISOString().split('T')[0], // YYYY-MM-DD format
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
          hourly: [],
          temperatures: [],
          descriptions: [],
          icons: [],
          precipProbabilities: []
        };
      }
      
      // Add hourly entry
      dayGroups[dayKey].hourly.push({
        timestamp: new Date(item.dt * 1000).toISOString(),
        time: date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        temperature: Math.round(item.main.temp),
        feelsLike: Math.round(item.main.feels_like),
        humidity: item.main.humidity,
        pressure: item.main.pressure,
        weather: {
          description: item.weather[0].description,
          icon: item.weather[0].icon,
          main: item.weather[0].main
        },
        windSpeed: item.wind.speed,
        windDirection: item.wind.deg || 0,
        cloudiness: item.clouds.all,
        precipitationProbability: Math.round(item.pop * 100),
        rainfall: item.rain?.['3h'] || 0,
        snowfall: item.snow?.['3h'] || 0
      });
      
      // Collect daily aggregation data
      dayGroups[dayKey].temperatures.push(item.main.temp);
      dayGroups[dayKey].descriptions.push(item.weather[0].description);
      dayGroups[dayKey].icons.push(item.weather[0].icon);
      dayGroups[dayKey].precipProbabilities.push(item.pop * 100);
    });
    
    // Convert groups to daily summaries
    const days = Object.values(dayGroups).map(dayGroup => {
      const temps = dayGroup.temperatures;
      const maxPrecipProb = Math.max(...dayGroup.precipProbabilities);
      
      // Find the most common weather condition for the day
      const weatherCounts = {};
      dayGroup.descriptions.forEach(desc => {
        weatherCounts[desc] = (weatherCounts[desc] || 0) + 1;
      });
      const mostCommonWeather = Object.keys(weatherCounts).reduce((a, b) => 
        weatherCounts[a] > weatherCounts[b] ? a : b
      );
      
      // Find corresponding icon for most common weather
      const mostCommonIndex = dayGroup.descriptions.indexOf(mostCommonWeather);
      const representativeIcon = dayGroup.icons[mostCommonIndex];
      
      return {
        date: dayGroup.date,
        dayOfWeek: dayGroup.dayOfWeek,
        min: Math.round(Math.min(...temps)),
        max: Math.round(Math.max(...temps)),
        avg: Math.round(temps.reduce((sum, temp) => sum + temp, 0) / temps.length),
        weatherMain: mostCommonWeather,
        icon: representativeIcon,
        precipitationProbability: Math.round(maxPrecipProb),
        hourly: dayGroup.hourly
      };
    });
    
    return {
      location: `${data.city.name}, ${data.city.country}`,
      days,
      // Keep the original flat forecasts for backward compatibility and scheduler use
      forecasts: data.list.map(item => ({
        datetime: new Date(item.dt * 1000).toISOString(),
        temperature: Math.round(item.main.temp),
        feelsLike: Math.round(item.main.feels_like),
        humidity: item.main.humidity,
        pressure: item.main.pressure,
        description: item.weather[0].description,
        icon: item.weather[0].icon,
        main: item.weather[0].main,
        windSpeed: item.wind.speed,
        windDirection: item.wind.deg || 0,
        cloudiness: item.clouds.all,
        precipitationProbability: Math.round(item.pop * 100),
        rainfall: item.rain?.['3h'] || 0,
        snowfall: item.snow?.['3h'] || 0
      })),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Format current weather data from One Call API
   * @param {Object} data - Raw One Call API response
   * @returns {Object} Formatted current weather data
   */
  formatCurrentWeatherFromOneCall(data) {
    const current = data.current;
    return {
      location: {
        name: this.city,
        country: 'US'
      },
      temperature: {
        current: Math.round(current.temp),
        feelsLike: Math.round(current.feels_like)
      },
      weather: {
        icon: current.weather[0].icon,
        description: current.weather[0].description,
        main: current.weather[0].main
      },
      humidity: current.humidity,
      pressure: current.pressure,
      wind: {
        speed: current.wind_speed,
        direction: current.wind_deg || 0
      },
      cloudiness: current.clouds,
      visibility: current.visibility,
      uvIndex: current.uvi,
      dewPoint: current.dew_point,
      sunrise: new Date(current.sunrise * 1000).toISOString(),
      sunset: new Date(current.sunset * 1000).toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Format forecast data from One Call API with real 48-hour and 8-day data
   * @param {Object} data - Raw One Call API response
   * @returns {Object} Formatted forecast data with enhanced structure
   */
  formatForecastFromOneCall(data) {
    // Convert all hourly data (48 hours) to a flat array
    const allHourlyData = data.hourly.map((hour, index) => {
      const date = new Date(hour.dt * 1000);
      return {
        timestamp: date.toISOString(),
        time: date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        temperature: Math.round(hour.temp),
        feelsLike: Math.round(hour.feels_like),
        humidity: hour.humidity,
        pressure: hour.pressure,
        weather: {
          description: hour.weather[0].description,
          icon: hour.weather[0].icon,
          main: hour.weather[0].main
        },
        windSpeed: hour.wind_speed,
        windDirection: hour.wind_deg || 0,
        windGust: hour.wind_gust || 0,
        cloudiness: hour.clouds,
        uvIndex: hour.uvi || 0,
        dewPoint: hour.dew_point,
        precipitationProbability: Math.round(hour.pop * 100),
        rainfall: hour.rain?.['1h'] || 0,
        snowfall: hour.snow?.['1h'] || 0,
        visibility: hour.visibility || 10000
      };
    });

    // Group hourly data by days (for UI display) - using Mountain Time for proper grouping
    const dayGroups = {};
    
    allHourlyData.forEach((hour, index) => {
      // Use Mountain Time for proper day grouping
      const mountainTime = new Date(hour.timestamp).toLocaleString("en-US", {timeZone: "America/Denver"});
      const mountainDate = new Date(mountainTime);
      const dayKey = mountainDate.toDateString();
      
      if (!dayGroups[dayKey]) {
        dayGroups[dayKey] = {
          date: mountainDate.toISOString().split('T')[0],
          dayOfWeek: mountainDate.toLocaleDateString('en-US', { weekday: 'short' }),
          hourly: [],
          temperatures: [],
          descriptions: [],
          icons: [],
          precipProbabilities: []
        };
      }
      
      // Add this hour to the appropriate day
      dayGroups[dayKey].hourly.push(hour);
      
      // Collect daily aggregation data
      dayGroups[dayKey].temperatures.push(hour.temperature);
      dayGroups[dayKey].descriptions.push(hour.weather.description);
      dayGroups[dayKey].icons.push(hour.weather.icon);
      dayGroups[dayKey].precipProbabilities.push(hour.precipitationProbability);
    });
    
    // Process daily data (8 days of real data!)
    const dailyForecasts = data.daily.map((day, index) => {
      return {
        date: new Date(day.dt * 1000).toISOString().split('T')[0],
        dayOfWeek: new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' }),
        min: Math.round(day.temp.min),
        max: Math.round(day.temp.max),
        avg: Math.round((day.temp.min + day.temp.max) / 2),
        morning: Math.round(day.temp.morn),
        day: Math.round(day.temp.day),
        evening: Math.round(day.temp.eve),
        night: Math.round(day.temp.night),
        weatherMain: day.weather[0].description,
        weatherCategory: day.weather[0].main,
        icon: day.weather[0].icon,
        precipitationProbability: Math.round(day.pop * 100),
        rainfall: day.rain || 0,
        snowfall: day.snow || 0,
        humidity: day.humidity,
        pressure: day.pressure,
        windSpeed: day.wind_speed,
        windDirection: day.wind_deg || 0,
        windGust: day.wind_gust || 0,
        cloudiness: day.clouds,
        uvIndex: day.uvi,
        dewPoint: day.dew_point,
        moonPhase: day.moon_phase,
        sunrise: new Date(day.sunrise * 1000).toISOString(),
        sunset: new Date(day.sunset * 1000).toISOString(),
        // Enhanced data from One Call API
        summary: day.summary || day.weather[0].description
      };
    });
    
    // Merge hourly grouped data with daily data for complete picture
    const days = dailyForecasts.map((dailyData, index) => {
      // Convert daily date to Mountain Time to match dayGroups keys
      const dailyDate = new Date(dailyData.date + 'T12:00:00Z'); // Use noon UTC to avoid timezone issues
      const mountainTime = new Date(dailyDate.toLocaleString("en-US", {timeZone: "America/Denver"}));
      const dayKey = mountainTime.toDateString();
      const hourlyData = dayGroups[dayKey];
      
      return {
        ...dailyData,
        hourly: hourlyData ? hourlyData.hourly : []
      };
    });
    
    return {
      location: `${this.city}, US`,
      days,
      // Add flat hourly array with all 48 hours for easy frontend access
      allHourly: allHourlyData,
      // Keep flat hourly array for scheduler convenience (48 hours of real data!)
      hourly: data.hourly.map(hour => ({
        datetime: new Date(hour.dt * 1000).toISOString(),
        temperature: Math.round(hour.temp),
        feelsLike: Math.round(hour.feels_like),
        humidity: hour.humidity,
        pressure: hour.pressure,
        description: hour.weather[0].description,
        icon: hour.weather[0].icon,
        main: hour.weather[0].main,
        windSpeed: hour.wind_speed,
        windDirection: hour.wind_deg || 0,
        cloudiness: hour.clouds,
        uvIndex: hour.uvi || 0,
        precipitationProbability: Math.round(hour.pop * 100),
        rainfall: hour.rain?.['1h'] || 0,
        snowfall: hour.snow?.['1h'] || 0
      })),
      // Keep flat daily array for backward compatibility  
      forecasts: data.daily.map(day => ({
        datetime: new Date(day.dt * 1000).toISOString(),
        temperature: Math.round(day.temp.day),
        tempMin: Math.round(day.temp.min),
        tempMax: Math.round(day.temp.max),
        description: day.weather[0].description,
        icon: day.weather[0].icon,
        main: day.weather[0].main,
        precipitationProbability: Math.round(day.pop * 100),
        rainfall: day.rain || 0,
        cloudiness: day.clouds
      })),
      // Weather alerts for mountain weather safety (color-coded by severity)
      alerts: this.formatWeatherAlerts(data.alerts || []),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Format weather alerts with severity-based color coding
   * @param {Array} alerts - Raw alerts from One Call API
   * @returns {Array} Formatted alerts with color coding
   */
  formatWeatherAlerts(alerts) {
    return alerts.map(alert => {
      // Determine severity and color based on alert event type
      let severity, color, urgency;
      const event = alert.event.toLowerCase();
      
      // 🔴 Red: Severe (life-threatening)
      if (event.includes('tornado') || event.includes('flash flood') || 
          event.includes('severe thunderstorm') || event.includes('blizzard') ||
          event.includes('ice storm') || event.includes('hurricane')) {
        severity = 'severe';
        color = 'red';
        urgency = 'immediate';
      }
      // 🟡 Yellow: Moderate (significant impact)
      else if (event.includes('thunderstorm') || event.includes('hail') ||
               event.includes('flood') || event.includes('snow') ||
               event.includes('winter storm') || event.includes('high wind')) {
        severity = 'moderate';
        color = 'yellow';
        urgency = 'prepare';
      }
      // 🔵 Blue: Advisory (monitor conditions)
      else {
        severity = 'advisory';
        color = 'blue';
        urgency = 'monitor';
      }
      
      return {
        id: `alert_${alert.start}_${alert.event.replace(/\s+/g, '_')}`,
        event: alert.event,
        description: alert.description,
        start: new Date(alert.start * 1000).toISOString(),
        end: new Date(alert.end * 1000).toISOString(),
        sender: alert.sender_name,
        severity,
        color,
        urgency,
        tags: alert.tags || [],
        // User-friendly formatting
        startFormatted: new Date(alert.start * 1000).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        endFormatted: new Date(alert.end * 1000).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric', 
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        isActive: Date.now() >= (alert.start * 1000) && Date.now() <= (alert.end * 1000),
        // Mountain-specific context
        isMountainRelevant: event.includes('snow') || event.includes('wind') || 
                           event.includes('winter') || event.includes('avalanche') ||
                           event.includes('freeze') || event.includes('cold')
      };
    });
  }

  /**
   * Get sunrise and sunset times for a specific date
   * @param {Date} date - The date to get times for (defaults to today)
   * @returns {Promise<Object>} Sunrise and sunset data
   */
  async getSunriseSunsetTimes(date = new Date()) {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Try to get from current weather data first (which includes today's sun times)
          const weatherResult = await this.getCurrentWeather();
          
          if (weatherResult.success && weatherResult.data) {
            const todayDate = new Date().toISOString().split('T')[0];
            const targetDate = date.toISOString().split('T')[0];
            
            // If requesting today's data, use the weather data
            if (todayDate === targetDate) {
              const sunriseDate = new Date(weatherResult.data.sunrise);
              const sunsetDate = new Date(weatherResult.data.sunset);
              
              return {
                success: true,
                data: {
                  date: todayDate,
                  sunrise: sunriseDate.getTime(),
                  sunset: sunsetDate.getTime(),
                  sunriseTime: sunriseDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  }),
                  sunsetTime: sunsetDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: true 
                  })
                }
              };
            }
          }
          
          // For other dates, use sunrise-sunset.org API
          const lat = 39.63; // Silverthorne latitude
          const lon = -106.07; // Silverthorne longitude
          const formattedDate = date.toISOString().split('T')[0];
          
          const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${formattedDate}&formatted=0`;
          const data = await this.makeHttpRequest(url);
          
          if (data.status === 'OK') {
            const sunriseDate = new Date(data.results.sunrise);
            const sunsetDate = new Date(data.results.sunset);
            
            return {
              success: true,
              data: {
                date: formattedDate,
                sunrise: sunriseDate.getTime(),
                sunset: sunsetDate.getTime(),
                sunriseTime: sunriseDate.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: true 
                }),
                sunsetTime: sunsetDate.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  hour12: true 
                })
              }
            };
          } else {
            throw new Error('Invalid response from sunrise-sunset API');
          }
        } catch (error) {
          prometheusMetrics.recordOperation('weather-sun-times', false);
          throw error;
        }
      },
      {
        operationName: 'weather-sun-times',
        isCritical: false,
        maxRetries: 2,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    const startTime = Date.now();
    try {
      // Check if API key is configured
      if (!this.apiKey) {
        prometheusMetrics.setServiceHealth('WeatherService', 'error');
        return {
          status: 'error',
          message: 'Weather API key not configured',
          details: {
            hasApiKey: false,
            lastUpdated: Date.now(),
            responseTime: Date.now() - startTime,
          },
        };
      }

      // Check cache status
      const cacheAge = this.cache.lastFetch ? Date.now() - this.cache.lastFetch : null;
      const cacheValid = this.isCacheValid();
      
      // Determine overall health
      let status = 'ok';
      let message = 'WeatherService is operational';
      
      if (this.lastError && !cacheValid) {
        status = 'warning';
        message = `WeatherService has errors but cache is valid: ${this.lastError}`;
      } else if (this.lastError) {
        status = 'error';
        message = `WeatherService has errors: ${this.lastError}`;
      }

      prometheusMetrics.setServiceHealth('WeatherService', status);
      
      return {
        status,
        message,
        details: {
          hasApiKey: !!this.apiKey,
          city: this.city,
          units: this.units,
          isInitialized: this.isInitialized,
          cache: {
            hasCurrentWeather: !!this.cache.current,
            hasForecast: !!this.cache.forecast,
            lastFetch: this.cache.lastFetch ? new Date(this.cache.lastFetch).toISOString() : null,
            cacheAge: cacheAge,
            isValid: cacheValid
          },
          lastError: this.lastError,
          lastUpdated: Date.now(),
          responseTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      prometheusMetrics.setServiceHealth('WeatherService', 'error');
      return {
        status: 'error',
        message: `Health check failed: ${error.message}`,
        details: { 
          lastUpdated: Date.now(), 
          responseTime: Date.now() - startTime 
        },
      };
    }
  }

  /**
   * Recovery procedure for the service
   */
  async recoveryProcedure(serviceName, attemptNumber) {
    logger.info(`Recovery procedure called for WeatherService (attempt ${attemptNumber})`);
    try {
      // Clear cache to force fresh data
      this.clearCache();
      
      // Reset error state
      this.lastError = null;
      
      // Test API connectivity
      await this.getCurrentWeather();
      
      return { 
        success: true, 
        method: 'cache-clear-and-test' 
      };
    } catch (error) {
      logger.error(`Recovery failed: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Get service status and health information (legacy compatibility)
   * @returns {Object} Service status
   */
  getStatus() {
    const cacheAge = this.cache.lastFetch ? Date.now() - this.cache.lastFetch : null;
    
    return {
      service: 'WeatherService',
      status: this.apiKey ? 'ready' : 'misconfigured',
      configuration: {
        city: this.city,
        units: this.units,
        cacheTimeout: this.cacheTimeout,
        hasApiKey: !!this.apiKey
      },
      cache: {
        hasCurrentWeather: !!this.cache.current,
        hasForecast: !!this.cache.forecast,
        lastFetch: this.cache.lastFetch ? new Date(this.cache.lastFetch).toISOString() : null,
        cacheAge: cacheAge,
        isValid: this.isCacheValid()
      },
      lastError: this.lastError,
      isInitialized: this.isInitialized,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = WeatherService;