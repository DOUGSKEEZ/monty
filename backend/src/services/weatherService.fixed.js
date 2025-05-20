/**
 * Enhanced Weather Service with Circuit Breaking and Self-Healing
 * 
 * This service provides weather data with improved resilience features:
 * - Circuit breaker for external API calls
 * - Automatic fallback to cached data
 * - Self-healing through service watchdog integration
 * - Memory usage optimization
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger').getModuleLogger('weather-service');
const configManager = require('../utils/config');
const CircuitBreaker = require('../utils/CircuitBreaker');
const serviceWatchdog = require('../utils/ServiceWatchdog');
const serviceRegistry = require('../services/ServiceRegistry');

// Circuit breaker timeout
const API_TIMEOUT = 10000; // 10 seconds

class WeatherService {
  constructor() {
    this.apiKey = process.env.OPENWEATHERMAP_API_KEY;
    this.cacheDir = path.join(__dirname, '../../../data/cache');
    this.weatherCachePath = path.join(this.cacheDir, 'weather_cache.json');
    this.forecastCachePath = path.join(this.cacheDir, 'forecast_cache.json');
    
    // Service status tracking
    this.serviceStatus = {
      status: 'unknown',
      lastSuccessfulFetch: null,
      consecutiveFailures: 0,
      lastError: null,
      backoffDelay: 0
    };
    
    // Cache expiration times (in milliseconds) - load from config if available
    // Increase refresh intervals to avoid hitting API limits
    const refreshInterval = configManager.get('weather.refreshIntervalMin', 60);
    const cacheExpiration = configManager.get('weather.cacheExpirationMin', 180);
    
    this.currentWeatherExpiration = refreshInterval * 60 * 1000; // minutes to ms
    this.forecastExpiration = cacheExpiration * 60 * 1000;        // minutes to ms
    
    // Add API rate limiting
    this.apiCallHistory = [];
    this.maxCallsPerMinute = 50; // Keep below 60 for safety margin
    
    // Create cache directory if it doesn't exist
    this.ensureCacheDirectory();
    
    // Load initial cache if exists
    this.weatherCache = this.loadCache(this.weatherCachePath);
    this.forecastCache = this.loadCache(this.forecastCachePath);
    
    // Initialize circuit breakers with fallback to cached data
    this.initializeCircuitBreakers();
    
    // Register with service registry for health monitoring
    this.registerWithServiceRegistry();
    
    // Set up automatic refresh with exponential backoff on failure
    // Increase the initial delay to allow server to start listening first
    setTimeout(() => this.setupPeriodicRefresh(), 10000);
  }
  
  /**
   * Initialize circuit breakers for different API endpoints
   */
  initializeCircuitBreakers() {
    // Circuit breaker for current weather API
    this.currentWeatherCircuit = new CircuitBreaker({
      name: 'weather-current-api',
      failureThreshold: 50,
      resetTimeout: 30000,
      halfOpenSuccessThreshold: 2,
      rollingWindowSize: 10,
      fallbackFunction: async () => {
        logger.info('Current weather circuit open, using cached data');
        
        if (!this.weatherCache || !this.weatherCache.data) {
          throw new Error('No cached weather data available');
        }
        
        // Return cached data with flag indicating it's from cache
        return {
          success: true,
          data: {
            ...this.weatherCache.data,
            fromCache: true,
            cachedAt: new Date(this.weatherCache.timestamp).toISOString()
          },
          cached: true,
          stale: true,
          serviceStatus: this.serviceStatus.status
        };
      }
    });
    
    // Circuit breaker for forecast API
    this.forecastCircuit = new CircuitBreaker({
      name: 'weather-forecast-api',
      failureThreshold: 50,
      resetTimeout: 60000, // Longer timeout for less critical forecast data
      halfOpenSuccessThreshold: 1,
      rollingWindowSize: 10,
      fallbackFunction: async () => {
        logger.info('Forecast circuit open, using cached data');
        
        if (!this.forecastCache || !this.forecastCache.data) {
          throw new Error('No cached forecast data available');
        }
        
        // Return cached data with flag indicating it's from cache
        return {
          success: true,
          data: {
            ...this.forecastCache.data,
            fromCache: true,
            cachedAt: new Date(this.forecastCache.timestamp).toISOString()
          },
          cached: true,
          stale: true
        };
      }
    });
    
    // Circuit breaker for sunrise/sunset API
    this.sunTimesCircuit = new CircuitBreaker({
      name: 'weather-sun-times-api',
      failureThreshold: 50,
      resetTimeout: 30000,
      halfOpenSuccessThreshold: 2,
      rollingWindowSize: 5,
      fallbackFunction: async (date) => {
        logger.info('Sun times circuit open, using default values');
        
        // Try to get values from weather cache first
        if (this.weatherCache && this.weatherCache.data && 
            this.weatherCache.data.sunrise && this.weatherCache.data.sunset) {
          
          const sunriseDate = new Date(this.weatherCache.data.sunrise);
          const sunsetDate = new Date(this.weatherCache.data.sunset);
          
          return {
            success: true,
            data: {
              date: date.toISOString().split('T')[0],
              sunrise: this.weatherCache.data.sunrise,
              sunset: this.weatherCache.data.sunset,
              sunriseTime: sunriseDate.toLocaleTimeString('en-US', { 
                hour: '2-digit', minute: '2-digit', hour12: true 
              }),
              sunsetTime: sunsetDate.toLocaleTimeString('en-US', { 
                hour: '2-digit', minute: '2-digit', hour12: true 
              }),
              fromCache: true
            }
          };
        }
        
        // If no cached data, return approximated values based on location
        const today = new Date();
        
        // Approximate sunrise and sunset times based on typical values
        const sunriseDate = new Date(today);
        sunriseDate.setHours(6, 30, 0, 0);
        
        const sunsetDate = new Date(today);
        sunsetDate.setHours(20, 0, 0, 0);
        
        return {
          success: true,
          data: {
            date: date.toISOString().split('T')[0],
            sunrise: sunriseDate.getTime(),
            sunset: sunsetDate.getTime(),
            sunriseTime: sunriseDate.toLocaleTimeString('en-US', { 
              hour: '2-digit', minute: '2-digit', hour12: true 
            }),
            sunsetTime: sunsetDate.toLocaleTimeString('en-US', { 
              hour: '2-digit', minute: '2-digit', hour12: true 
            }),
            fromDefault: true
          }
        };
      }
    });
    
    // Set up event handlers for circuit state changes
    [this.currentWeatherCircuit, this.forecastCircuit, this.sunTimesCircuit].forEach(circuit => {
      circuit.on('stateChange', (event) => {
        logger.info(`Circuit "${event.circuit}" state changed from ${event.from} to ${event.to}: ${event.reason}`);
        
        // Update service registry status when circuit state changes
        if (event.to === CircuitBreaker.STATES.OPEN) {
          serviceRegistry.setStatus('weather-service', 'warning', 
            `Circuit "${event.circuit}" is open: ${event.reason}`);
        } else if (event.to === CircuitBreaker.STATES.CLOSED && 
                  this.currentWeatherCircuit.state === CircuitBreaker.STATES.CLOSED && 
                  this.forecastCircuit.state === CircuitBreaker.STATES.CLOSED) {
          serviceRegistry.setStatus('weather-service', 'ready', 
            'All circuits are closed, service is healthy');
        }
      });
    });
  }
  
  /**
   * Register with service registry for health monitoring
   */
  registerWithServiceRegistry() {
    // Register with service registry
    serviceRegistry.register('weather-service', { 
      isCore: false,
      checkHealth: async () => {
        try {
          // Check cache directory health
          const cacheHealth = this.checkCacheHealth();
          
          // Check circuit status
          const currentWeatherCircuitStatus = this.currentWeatherCircuit.state;
          const forecastCircuitStatus = this.forecastCircuit.state;
          
          // Determine overall status
          let status = 'ok';
          let message = 'Weather service is operational';
          
          if (!cacheHealth.healthy) {
            status = 'warning';
            message = `Cache issue: ${cacheHealth.message}`;
          }
          
          if (currentWeatherCircuitStatus === CircuitBreaker.STATES.OPEN || 
              forecastCircuitStatus === CircuitBreaker.STATES.OPEN) {
            status = 'warning';
            message = 'One or more API circuits are open, using cached data';
          }
          
          if (!this.apiKey) {
            status = 'error';
            message = 'API key not configured';
          }
          
          return {
            status,
            message,
            details: {
              cacheHealth,
              circuits: {
                currentWeather: currentWeatherCircuitStatus,
                forecast: forecastCircuitStatus,
                sunTimes: this.sunTimesCircuit.state
              },
              cache: {
                weather: this.weatherCache ? new Date(this.weatherCache.timestamp).toISOString() : null,
                forecast: this.forecastCache ? new Date(this.forecastCache.timestamp).toISOString() : null
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
    serviceRegistry.setStatus('weather-service', this.isConfigured() ? 'ready' : 'error');
    
    // Register with service watchdog for recovery
    serviceWatchdog.registerService('weather-service', {
      isCritical: false,
      monitorMemory: true,
      memoryThresholdMB: 100,
      // Custom recovery procedure for weather service
      recoveryProcedure: async (serviceName, attemptNumber) => {
        try {
          logger.info(`Attempting weather service recovery (attempt ${attemptNumber})`);
          
          // Forcibly close all open circuits
          this.resetCircuits();
          
          // Clear API call history to reset rate limiting
          this.apiCallHistory = [];
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
          
          // Reset service status
          this.serviceStatus = {
            status: 'unknown',
            lastSuccessfulFetch: null,
            consecutiveFailures: 0,
            lastError: null,
            backoffDelay: 0
          };
          
          // Try to fetch fresh data
          const testFetch = await this.getCurrentWeather(true);
          
          return {
            success: testFetch.success,
            message: 'Weather service recovered successfully',
            refreshed: testFetch.cached ? 'using cache' : 'fresh data',
            circuits: {
              current: this.currentWeatherCircuit.state,
              forecast: this.forecastCircuit.state,
              sunTimes: this.sunTimesCircuit.state
            }
          };
        } catch (error) {
          throw new Error(`Weather service recovery failed: ${error.message}`);
        }
      }
    });
  }
  
  /**
   * Set up periodic refresh of weather data with exponential backoff on failure
   */
  setupPeriodicRefresh() {
    const refreshWeather = async () => {
      try {
        // Only refresh if we have an API key
        if (this.isConfigured()) {
          // First check service status
          if (this.serviceStatus.status === 'down' && this.serviceStatus.backoffDelay > 0) {
            logger.warn(`Weather service is down, waiting for backoff delay (${Math.round(this.serviceStatus.backoffDelay/60000)} minutes)`);
            
            // If in backoff, decrease the delay for next attempt
            if (this.serviceStatus.backoffDelay > 0) {
              this.serviceStatus.backoffDelay = Math.max(
                0, 
                this.serviceStatus.backoffDelay - Math.min(this.currentWeatherExpiration, 300000) // Decrease by refresh interval or 5 minutes max
              );
            }
            
            // If backoff is complete, reset status to unknown for next attempt
            if (this.serviceStatus.backoffDelay <= 0) {
              this.serviceStatus.status = 'unknown';
            }
          } else {
            // Attempt to refresh weather data
            logger.debug('Running scheduled weather refresh');
            await this.getCurrentWeather(true);
            
            // Only refresh forecast occasionally to save API calls
            if (!this.forecastCache || !this.forecastCache.timestamp ||
                (Date.now() - this.forecastCache.timestamp > this.forecastExpiration)) {
              await this.getForecast(true);
            }
          }
        }
      } catch (error) {
        logger.error(`Error in weather refresh: ${error.message}`);
      } finally {
        // Schedule next run
        setTimeout(refreshWeather, this.currentWeatherExpiration);
      }
    };
    
    // Start the refresh cycle
    refreshWeather().catch(err => logger.error(`Initial weather refresh failed: ${err.message}`));
  }
  
  /**
   * Reset all circuits to closed state (for recovery)
   */
  resetCircuits() {
    this.currentWeatherCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset during recovery');
    this.forecastCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset during recovery');
    this.sunTimesCircuit.forceState(CircuitBreaker.STATES.CLOSED, 'Manual reset during recovery');
    logger.info('All weather service circuits reset to CLOSED state');
  }
  
  /**
   * Check health of cache system
   * @returns {Object} Health status of cache system
   */
  checkCacheHealth() {
    if (!this.cacheDir) {
      return { healthy: false, message: 'Cache directory not configured' };
    }
    
    if (!fs.existsSync(this.cacheDir)) {
      return { healthy: false, message: 'Cache directory does not exist' };
    }
    
    // Check if we can write to the cache directory
    try {
      const testFile = path.join(this.cacheDir, '.test_write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return { healthy: true, message: 'Cache system operational' };
    } catch (error) {
      return { healthy: false, message: `Cache write test failed: ${error.message}` };
    }
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
          const tempCacheDir = path.join(require('os').tmpdir(), 'monty-cache');
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
   * Load cache from a file
   * @param {string} cachePath - Path to the cache file
   * @returns {object} - The loaded cache or an empty object
   */
  loadCache(cachePath) {
    try {
      if (fs.existsSync(cachePath)) {
        const cacheData = fs.readFileSync(cachePath, 'utf8');
        return JSON.parse(cacheData);
      }
    } catch (error) {
      logger.error(`Error loading cache from ${cachePath}: ${error.message}`);
    }
    
    return {};
  }
  
  /**
   * Save cache to a file with error handling
   * @param {string} cachePath - Path to the cache file
   * @param {object} cacheData - Data to save
   */
  saveCache(cachePath, cacheData) {
    if (!cachePath || !this.cacheDir) {
      // Cache is disabled
      return;
    }
    
    try {
      // First write to a temporary file
      const tempPath = `${cachePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(cacheData, null, 2));
      
      // Then atomically rename
      fs.renameSync(tempPath, cachePath);
    } catch (error) {
      logger.error(`Error saving cache to ${cachePath}: ${error.message}`);
      
      // Set flag indicating disk issues
      this.serviceStatus.diskIssue = true;
    }
  }
  
  /**
   * Check if the API key is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
  
  /**
   * Check if we're within API rate limits
   * @returns {boolean} - True if we can make another API call
   */
  canMakeApiCall() {
    const now = Date.now();
    // Remove calls older than 1 minute
    this.apiCallHistory = this.apiCallHistory.filter(time => (now - time) < 60000);
    
    // Check if we're under the limit
    if (this.apiCallHistory.length < this.maxCallsPerMinute) {
      this.apiCallHistory.push(now);
      return true;
    }
    
    logger.warn(`API rate limit reached (${this.apiCallHistory.length} calls in the last minute)`);
    return false;
  }
  
  /**
   * Get the current weather data with resilient error handling
   * @param {boolean} forceRefresh - Force a refresh of the data even if cached
   * @returns {Promise<object>} - The weather data
   */
  async getCurrentWeather(forceRefresh = false) {
    if (!this.isConfigured()) {
      logger.error('OpenWeatherMap API key not configured');
      return {
        success: false,
        error: 'Weather service not configured'
      };
    }
    
    // Get location from config
    const zipCode = configManager.get('location.zipCode', '80498');
    const country = 'us';
    
    // Check if we have a valid cache
    if (!forceRefresh && 
        this.weatherCache && 
        this.weatherCache.data && 
        this.weatherCache.timestamp && 
        (Date.now() - this.weatherCache.timestamp < this.currentWeatherExpiration)) {
      
      logger.debug('Returning cached current weather data');
      return {
        success: true,
        data: this.weatherCache.data,
        cached: true,
        serviceStatus: this.serviceStatus.status
      };
    }
    
    // Use circuit breaker to make the API call
    try {
      return await this.currentWeatherCircuit.execute(async () => {
        // Check rate limits and service status before attempting API call
        if (!this.canMakeApiCall()) {
          throw new Error('API rate limit reached');
        }
        
        if (this.serviceStatus.status === 'down' && this.serviceStatus.backoffDelay > 0) {
          throw new Error(`Service in backoff period (${Math.round(this.serviceStatus.backoffDelay/60000)} min)`);
        }
        
        // Fetch weather data with timeout
        const url = `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode},${country}&units=imperial&appid=${this.apiKey}`;
        
        // Using axios with timeout
        const response = await axios.get(url, { timeout: API_TIMEOUT });
        
        // Format the data for our needs
        const weatherData = {
          location: {
            name: response.data.name,
            country: response.data.sys.country,
            coordinates: {
              lat: response.data.coord.lat,
              lon: response.data.coord.lon
            }
          },
          temperature: {
            current: Math.round(response.data.main.temp),
            feelsLike: Math.round(response.data.main.feels_like),
            min: Math.round(response.data.main.temp_min),
            max: Math.round(response.data.main.temp_max)
          },
          weather: {
            main: response.data.weather[0].main,
            description: response.data.weather[0].description,
            icon: response.data.weather[0].icon
          },
          wind: {
            speed: response.data.wind.speed,
            direction: response.data.wind.deg
          },
          humidity: response.data.main.humidity,
          pressure: response.data.main.pressure,
          sunrise: response.data.sys.sunrise * 1000,  // Convert to milliseconds
          sunset: response.data.sys.sunset * 1000,    // Convert to milliseconds
          timezone: response.data.timezone,
          fetchTime: Date.now()
        };
        
        // Update cache
        this.weatherCache = {
          timestamp: Date.now(),
          data: weatherData
        };
        this.saveCache(this.weatherCachePath, this.weatherCache);
        
        // Reset service status since we had a successful fetch
        this.serviceStatus = {
          status: 'up',
          lastSuccessfulFetch: Date.now(),
          consecutiveFailures: 0,
          lastError: null,
          backoffDelay: 0
        };
        
        // Update service registry status
        serviceRegistry.setStatus('weather-service', 'ready', 'Successfully fetched weather data');
        
        return {
          success: true,
          data: weatherData,
          cached: false,
          serviceStatus: 'up'
        };
      });
    } catch (error) {
      // Update service status with failure information
      this.serviceStatus.consecutiveFailures++;
      this.serviceStatus.lastError = error.message;
      
      // Implement exponential backoff after repeated failures
      if (this.serviceStatus.consecutiveFailures >= 3) {
        this.serviceStatus.status = 'down';
        // Exponential backoff: 5 min -> 15 min -> 30 min -> 60 min max
        this.serviceStatus.backoffDelay = Math.min(
          60 * 60 * 1000, // Max 1 hour backoff
          (5 * 60 * 1000) * Math.pow(2, this.serviceStatus.consecutiveFailures - 3)
        );
        
        logger.warn(`Weather API marked as down after ${this.serviceStatus.consecutiveFailures} failures. Backoff: ${Math.round(this.serviceStatus.backoffDelay/60000)} minutes`);
      }
      
      logger.error(`Error fetching current weather: ${error.message}`);
      
      // Try to use cached data as fallback
      if (this.weatherCache && this.weatherCache.data) {
        logger.info('Using cached weather data after API error');
        return {
          success: true,
          data: {
            ...this.weatherCache.data,
            fromCache: true,
            cacheTime: this.weatherCache.timestamp
          },
          cached: true,
          stale: true,
          serviceStatus: this.serviceStatus.status,
          error: {
            message: error.message,
            retryAfter: this.serviceStatus.backoffDelay
          }
        };
      }
      
      // No cache available, return error
      return {
        success: false,
        error: `Failed to fetch weather data: ${error.message}`,
        serviceStatus: this.serviceStatus.status
      };
    }
  }
  
  /**
   * Get the weather forecast
   * @param {boolean} forceRefresh - Force a refresh of the data even if cached
   * @returns {Promise<object>} - The forecast data
   */
  async getForecast(forceRefresh = false) {
    if (!this.isConfigured()) {
      logger.error('OpenWeatherMap API key not configured');
      return {
        success: false,
        error: 'Weather service not configured'
      };
    }
    
    // Get location from config
    const zipCode = configManager.get('location.zipCode', '80498');
    const country = 'us';
    
    // Check if we have a valid cache
    if (!forceRefresh && 
        this.forecastCache && 
        this.forecastCache.data && 
        this.forecastCache.timestamp && 
        (Date.now() - this.forecastCache.timestamp < this.forecastExpiration)) {
      
      logger.debug('Returning cached forecast data');
      return {
        success: true,
        data: this.forecastCache.data,
        cached: true
      };
    }
    
    // Use circuit breaker to make the API call
    try {
      return await this.forecastCircuit.execute(async () => {
        // Check rate limits before making API call
        if (!this.canMakeApiCall()) {
          throw new Error('API rate limit reached');
        }
        
        logger.info(`Fetching forecast for ${zipCode}`);
        
        const url = `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode},${country}&units=imperial&appid=${this.apiKey}`;
        const response = await axios.get(url, { timeout: API_TIMEOUT });
        
        // Process the forecast data
        const forecastList = response.data.list;
        const forecastsByDay = {};
        
        forecastList.forEach(item => {
          // Convert timestamp to date
          const date = new Date(item.dt * 1000);
          const day = date.toISOString().split('T')[0]; // YYYY-MM-DD
          
          // Initialize the day array if it doesn't exist
          if (!forecastsByDay[day]) {
            forecastsByDay[day] = [];
          }
          
          // Add the forecast data for this time slot
          forecastsByDay[day].push({
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp: item.dt * 1000,
            temperature: Math.round(item.main.temp),
            feelsLike: Math.round(item.main.feels_like),
            weather: {
              main: item.weather[0].main,
              description: item.weather[0].description,
              icon: item.weather[0].icon
            },
            wind: {
              speed: item.wind.speed,
              direction: item.wind.deg
            },
            humidity: item.main.humidity,
            pressure: item.main.pressure
          });
        });
        
        // Process daily summaries
        const dailyForecasts = Object.keys(forecastsByDay).map(day => {
          const forecasts = forecastsByDay[day];
          const temperatures = forecasts.map(f => f.temperature);
          
          return {
            date: day,
            dayOfWeek: new Date(day).toLocaleDateString('en-US', { weekday: 'long' }),
            min: Math.min(...temperatures),
            max: Math.max(...temperatures),
            weatherMain: this.getMostFrequentWeather(forecasts),
            icon: this.getMostRepresentativeIcon(forecasts),
            hourly: forecasts
          };
        });
        
        // Format the data for our needs
        const forecastData = {
          location: {
            name: response.data.city.name,
            country: response.data.city.country,
            coordinates: {
              lat: response.data.city.coord.lat,
              lon: response.data.city.coord.lon
            }
          },
          days: dailyForecasts,
          fetchTime: Date.now()
        };
        
        // Update cache
        this.forecastCache = {
          timestamp: Date.now(),
          data: forecastData
        };
        this.saveCache(this.forecastCachePath, this.forecastCache);
        
        return {
          success: true,
          data: forecastData,
          cached: false
        };
      });
    } catch (error) {
      logger.error(`Error fetching forecast: ${error.message}`);
      
      // Try to use cached data as fallback
      if (this.forecastCache && this.forecastCache.data) {
        logger.info('Using cached forecast data after API error');
        return {
          success: true,
          data: {
            ...this.forecastCache.data,
            fromCache: true,
            cacheTime: this.forecastCache.timestamp
          },
          cached: true,
          stale: true
        };
      }
      
      // No cache available, return error
      return {
        success: false,
        error: `Failed to fetch forecast data: ${error.message}`
      };
    }
  }
  
  /**
   * Get the most frequent weather condition from a list of forecasts
   * @param {Array} forecasts - List of forecast items
   * @returns {string} - Most frequent weather condition
   */
  getMostFrequentWeather(forecasts) {
    const weatherCounts = {};
    
    forecasts.forEach(forecast => {
      const weather = forecast.weather.main;
      weatherCounts[weather] = (weatherCounts[weather] || 0) + 1;
    });
    
    let mostFrequent = '';
    let maxCount = 0;
    
    for (const [weather, count] of Object.entries(weatherCounts)) {
      if (count > maxCount) {
        mostFrequent = weather;
        maxCount = count;
      }
    }
    
    return mostFrequent;
  }
  
  /**
   * Get the most representative icon for a day based on priority
   * @param {Array} forecasts - List of forecast items
   * @returns {string} - Icon code
   */
  getMostRepresentativeIcon(forecasts) {
    // Prioritize "extreme" or "bad" weather conditions
    const iconPriority = {
      '11d': 10, // Thunderstorm
      '11n': 10,
      '13d': 9,  // Snow
      '13n': 9,
      '09d': 8,  // Rain
      '09n': 8,
      '10d': 7,  // Rain
      '10n': 7,
      '50d': 6,  // Mist
      '50n': 6,
      '04d': 5,  // Broken Clouds
      '04n': 5,
      '03d': 4,  // Scattered Clouds
      '03n': 4,
      '02d': 3,  // Few Clouds
      '02n': 3,
      '01d': 2,  // Clear Sky (day)
      '01n': 1   // Clear Sky (night)
    };
    
    // Get all icons for the day
    const icons = forecasts
      .map(forecast => forecast.weather.icon)
      .filter(icon => iconPriority[icon] !== undefined);
    
    if (icons.length === 0) {
      return '01d'; // Default to clear sky
    }
    
    // Return the highest priority icon
    return icons.reduce((highest, icon) => {
      return (iconPriority[icon] > iconPriority[highest]) ? icon : highest;
    }, icons[0]);
  }
  
  /**
   * Get sunrise and sunset times for a specific date
   * @param {Date} date - The date to get times for (defaults to today)
   * @returns {Promise<object>} - Sunrise and sunset data
   */
  async getSunriseSunsetTimes(date = new Date()) {
    // Use circuit breaker for this API call
    try {
      return await this.sunTimesCircuit.execute(async () => {
        // Try to get from current weather data first (which includes today's sun times)
        const todayDate = new Date().toISOString().split('T')[0];
        const targetDate = date.toISOString().split('T')[0];
        
        // If requesting today's data and we have current weather, use that
        if (todayDate === targetDate) {
          const weatherResult = await this.getCurrentWeather();
          
          if (weatherResult.success && weatherResult.data &&
              weatherResult.data.sunrise && weatherResult.data.sunset) {
            
            const sunriseDate = new Date(weatherResult.data.sunrise);
            const sunsetDate = new Date(weatherResult.data.sunset);
            
            return {
              success: true,
              data: {
                date: todayDate,
                sunrise: weatherResult.data.sunrise,
                sunset: weatherResult.data.sunset,
                sunriseTime: sunriseDate.toLocaleTimeString('en-US', { 
                  hour: '2-digit', minute: '2-digit', hour12: true 
                }),
                sunsetTime: sunsetDate.toLocaleTimeString('en-US', { 
                  hour: '2-digit', minute: '2-digit', hour12: true 
                })
              }
            };
          }
        }
        
        // Otherwise, use the specialized API
        // Get location coordinates from config or use defaults
        let lat = 39.63; // Default Silverthorne latitude
        let lon = -106.07; // Default Silverthorne longitude
        
        // Try to get from current weather if available
        const weatherResult = await this.getCurrentWeather();
        if (weatherResult.success && weatherResult.data && weatherResult.data.location.coordinates) {
          lat = weatherResult.data.location.coordinates.lat;
          lon = weatherResult.data.location.coordinates.lon;
        }
        
        const formattedDate = date.toISOString().split('T')[0];
        
        // Using axios with timeout
        const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${formattedDate}&formatted=0`;
        const response = await axios.get(url, { timeout: API_TIMEOUT });
        
        if (response.data.status === 'OK') {
          const sunriseDate = new Date(response.data.results.sunrise);
          const sunsetDate = new Date(response.data.results.sunset);
          
          // Adjust for timezone (the API returns UTC times)
          const offsetMs = new Date().getTimezoneOffset() * 60 * 1000;
          
          const localSunriseDate = new Date(sunriseDate.getTime() - offsetMs);
          const localSunsetDate = new Date(sunsetDate.getTime() - offsetMs);
          
          return {
            success: true,
            data: {
              date: formattedDate,
              sunrise: localSunriseDate.getTime(),
              sunset: localSunsetDate.getTime(),
              sunriseTime: localSunriseDate.toLocaleTimeString('en-US', { 
                hour: '2-digit', minute: '2-digit', hour12: true 
              }),
              sunsetTime: localSunsetDate.toLocaleTimeString('en-US', { 
                hour: '2-digit', minute: '2-digit', hour12: true 
              })
            }
          };
        } else {
          throw new Error('Invalid response from sunrise-sunset API');
        }
      }, null, date);
    } catch (error) {
      logger.error(`Error fetching sunrise/sunset data: ${error.message}`);
      return {
        success: false,
        error: `Failed to fetch sunrise/sunset data: ${error.message}`
      };
    }
  }
  
  /**
   * Get the circuit breaker statistics
   * @returns {Object} - Circuit breaker status
   */
  getCircuitStatus() {
    return {
      currentWeather: this.currentWeatherCircuit.getStatus(),
      forecast: this.forecastCircuit.getStatus(),
      sunTimes: this.sunTimesCircuit.getStatus()
    };
  }
  
  /**
   * Force a reset of the weather service
   * Used for testing and recovery
   */
  async forceReset() {
    logger.info('Force resetting weather service');
    
    // Reset all circuit breakers
    this.resetCircuits();
    
    // Clear API call history
    this.apiCallHistory = [];
    
    // Reset service status
    this.serviceStatus = {
      status: 'unknown',
      lastSuccessfulFetch: null,
      consecutiveFailures: 0,
      lastError: null,
      backoffDelay: 0
    };
    
    // Attempt to refresh data
    try {
      await this.getCurrentWeather(true);
      return { success: true, message: 'Weather service reset successful' };
    } catch (error) {
      return { success: false, error: `Reset failed: ${error.message}` };
    }
  }
}

// Create and export a singleton instance
const weatherService = new WeatherService();
module.exports = weatherService;