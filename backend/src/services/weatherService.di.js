/**
 * WeatherService (DI Version) - Weather data service with dependency injection
 * 
 * This service provides weather information with explicit dependency injection.
 * It implements the IWeatherService interface and uses provided dependencies
 * instead of importing them directly.
 */

const IWeatherService = require('../interfaces/IWeatherService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class WeatherService extends IWeatherService {
  /**
   * Create a new WeatherService with explicit dependencies
   * @param {Object} logger - Logger instance
   * @param {Object} configManager - Configuration manager instance
   */
  constructor(logger, configManager) {
    super();
    
    // Store injected dependencies
    this.logger = logger;
    this.configManager = configManager;
    
    // Initialize service properties
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
    const refreshInterval = this.configManager.get('weather.refreshIntervalMin', 60);
    const cacheExpiration = this.configManager.get('weather.cacheExpirationMin', 180);
    
    this.currentWeatherExpiration = refreshInterval * 60 * 1000; // minutes to ms
    this.forecastExpiration = cacheExpiration * 60 * 1000;       // minutes to ms
    
    // Add API rate limiting
    this.apiCallHistory = [];
    this.maxCallsPerMinute = 50; // Keep below 60 for safety margin
    
    // Create cache directory if it doesn't exist
    this.ensureCacheDirectory();
    
    // Load initial cache if exists
    this.weatherCache = this.loadCache(this.weatherCachePath);
    this.forecastCache = this.loadCache(this.forecastCachePath);
    
    // Set up automatic refresh with exponential backoff on failure
    // Increase the initial delay to allow server to start listening first
    setTimeout(() => this.setupPeriodicRefresh(), 10000);
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
            this.logger.warn(`Weather service is down, waiting for backoff delay (${Math.round(this.serviceStatus.backoffDelay/60000)} minutes)`);
            
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
            this.logger.debug('Running scheduled weather refresh');
            await this.getCurrentWeather(true);
            
            // Only refresh forecast occasionally to save API calls
            if (!this.forecastCache || !this.forecastCache.timestamp ||
                (Date.now() - this.forecastCache.timestamp > this.forecastExpiration)) {
              await this.getForecast(true);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error in weather refresh: ${error.message}`);
      } finally {
        // Schedule next run
        setTimeout(refreshWeather, this.currentWeatherExpiration);
      }
    };
    
    // Start the refresh cycle
    refreshWeather().catch(err => this.logger.error(`Initial weather refresh failed: ${err.message}`));
  }
  
  /**
   * Ensure the cache directory exists with fallback
   */
  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        this.logger.info(`Created cache directory at ${this.cacheDir}`);
      } catch (error) {
        this.logger.error(`Failed to create primary cache directory: ${error.message}`);
        
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
          
          this.logger.info(`Using fallback cache directory at ${this.cacheDir}`);
        } catch (fallbackError) {
          this.logger.error(`Failed to create fallback cache directory: ${fallbackError.message}`);
          this.logger.warn('Weather caching will be disabled');
          
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
      this.logger.error(`Error loading cache from ${cachePath}: ${error.message}`);
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
      this.logger.error(`Error saving cache to ${cachePath}: ${error.message}`);
      
      // Set flag indicating disk issues
      this.serviceStatus.diskIssue = true;
    }
  }
  
  /**
   * Check if the API key is configured
   * @returns {boolean} - True if the service is configured
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
    
    this.logger.warn(`API rate limit reached (${this.apiCallHistory.length} calls in the last minute)`);
    return false;
  }
  
  /**
   * Get the current weather data with resilient error handling
   * @param {boolean} forceRefresh - Force a refresh of the data even if cached
   * @returns {Promise<object>} - The weather data
   */
  async getCurrentWeather(forceRefresh = false) {
    if (!this.isConfigured()) {
      this.logger.error('OpenWeatherMap API key not configured');
      return {
        success: false,
        error: 'Weather service not configured'
      };
    }
    
    // Get location from config
    const zipCode = this.configManager.get('location.zipCode', '80498');
    const country = 'us';
    
    // Check if we have a valid cache
    if (!forceRefresh && 
        this.weatherCache && 
        this.weatherCache.data && 
        this.weatherCache.timestamp && 
        (Date.now() - this.weatherCache.timestamp < this.currentWeatherExpiration)) {
      
      this.logger.debug('Returning cached current weather data');
      return {
        success: true,
        data: this.weatherCache.data,
        cached: true,
        serviceStatus: this.serviceStatus.status
      };
    }
    
    // Fetch new data with exponential backoff
    try {
      this.logger.info(`Fetching current weather for ${zipCode}`);
      
      // Check rate limits and service status
      if ((!this.canMakeApiCall() || this.serviceStatus.status === 'down') && 
          this.serviceStatus.backoffDelay > 0 && 
          this.weatherCache && 
          this.weatherCache.data) {
        
        // Return cached data and don't attempt a fetch
        this.logger.warn(`Weather API in backoff period (${Math.round(this.serviceStatus.backoffDelay/60000)} min), using cached data`);
        return {
          success: true,
          data: this.weatherCache.data,
          cached: true,
          stale: true,
          serviceStatus: this.serviceStatus.status
        };
      }
      
      // Set request timeout and retries
      const axiosOptions = {
        timeout: 10000, // 10 second timeout
        retries: 2,
        retryDelay: 1000
      };
      
      const url = `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode},${country}&units=imperial&appid=${this.apiKey}`;
      const response = await axios.get(url, axiosOptions);
      
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
      
      return {
        success: true,
        data: weatherData,
        cached: false,
        serviceStatus: 'up'
      };
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
        
        this.logger.warn(`Weather API marked as down after ${this.serviceStatus.consecutiveFailures} failures. Backoff: ${Math.round(this.serviceStatus.backoffDelay/60000)} minutes`);
      }
      
      this.logger.error(`Error fetching current weather: ${error.message}`);
      
      // If we have a cache, return it even if expired
      if (this.weatherCache && this.weatherCache.data) {
        this.logger.info('Returning stale cached weather data due to API error');
        
        return {
          success: true,
          data: this.weatherCache.data,
          cached: true,
          stale: true,
          serviceStatus: this.serviceStatus.status,
          error: {
            message: error.message,
            retryAfter: this.serviceStatus.backoffDelay
          }
        };
      }
      
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
      this.logger.error('OpenWeatherMap API key not configured');
      return {
        success: false,
        error: 'Weather service not configured'
      };
    }
    
    // Get location from config
    const zipCode = this.configManager.get('location.zipCode', '80498');
    const country = 'us';
    
    // Check if we have a valid cache
    if (!forceRefresh && 
        this.forecastCache && 
        this.forecastCache.data && 
        this.forecastCache.timestamp && 
        (Date.now() - this.forecastCache.timestamp < this.forecastExpiration)) {
      
      this.logger.debug('Returning cached forecast data');
      return {
        success: true,
        data: this.forecastCache.data,
        cached: true
      };
    }
    
    // Fetch new data
    try {
      this.logger.info(`Fetching forecast for ${zipCode}`);
      
      // Check rate limits before making API call
      if (!this.canMakeApiCall() && this.forecastCache && this.forecastCache.data) {
        this.logger.warn('API rate limit reached, using cached forecast data');
        return {
          success: true,
          data: this.forecastCache.data,
          cached: true,
          rateLimited: true
        };
      }
      
      const url = `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode},${country}&units=imperial&appid=${this.apiKey}`;
      const response = await axios.get(url);
      
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
    } catch (error) {
      this.logger.error(`Error fetching forecast: ${error.message}`);
      
      // If we have a cache, return it even if expired
      if (this.forecastCache && this.forecastCache.data) {
        this.logger.info('Returning stale cached forecast data due to API error');
        return {
          success: true,
          data: this.forecastCache.data,
          cached: true,
          stale: true
        };
      }
      
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
    // Try to get from current weather data first (which includes today's sun times)
    try {
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
              sunrise: sunriseDate,
              sunset: sunsetDate,
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
    } catch (error) {
      this.logger.warn(`Error getting sun times from weather data: ${error.message}`);
    }
    
    // Otherwise, use the specialized API
    try {
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
      
      const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${formattedDate}&formatted=0`;
      const response = await axios.get(url);
      
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
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            }),
            sunsetTime: localSunsetDate.toLocaleTimeString('en-US', { 
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
      this.logger.error(`Error fetching sunrise/sunset data: ${error.message}`);
      return {
        success: false,
        error: `Failed to fetch sunrise/sunset data: ${error.message}`
      };
    }
  }
}

// Export only the class (no singleton)
module.exports = WeatherService;