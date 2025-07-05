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
const { logger: loggerModule } = require('../utils/enhancedLogger');
const { LOG_ACTIONS, TRIGGER_TYPES, PERFORMANCE_THRESHOLDS } = require('../utils/loggingStandards');
const prometheusMetrics = require('./PrometheusMetricsService');

class WeatherService extends IWeatherService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog, timezoneManager) {
    super();
    // Use Enhanced Logger with module context
    this.logger = loggerModule;
    this.logger.setContext({ module: 'weather-service' });
    
    
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;
    this.timezoneManager = timezoneManager;
    
    // Configuration - Load API key securely from environment
    this.apiKey = process.env.OPENWEATHERMAP_API_KEY || this.configManager.get('weather.apiKey');
    this.city = this.configManager.get('weather.city', 'Silverthorne');
    this.latitude = this.configManager.get('weather.latitude', 39.66336894676102);
    this.longitude = this.configManager.get('weather.longitude', -106.06774195949477);
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
    this.logger.info('WeatherService v2.0 initialized with full integration', {
      action: LOG_ACTIONS.SYSTEM.STARTUP,
      config: {
        city: this.city,
        units: this.units,
        useOneCallAPI: this.useOneCallAPI,
        cacheTimeout: this.cacheTimeout
      }
    });
    this.logger.info(`API usage loaded: ${this.apiUsage.dailyCount}/${this.dailyLimit} calls for ${this.apiUsage.lastResetDate}`);
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
      
      this.logger.info('WeatherService initialized successfully');
      return { success: true, message: 'WeatherService initialized' };
    } catch (error) {
      this.lastError = error.message;
      this.serviceRegistry.setStatus('WeatherService', 'error');
      prometheusMetrics.setServiceHealth('WeatherService', 'error');
      
      this.logger.error(`Failed to initialize WeatherService: ${error.message}`);
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
        // getOneCallData handles all timing, logging, and cache tracking
        await this.getOneCallData(forceRefresh);
        return this.cache.current;
      } catch (error) {
        const trigger = forceRefresh ? TRIGGER_TYPES.MANUAL : TRIGGER_TYPES.SCHEDULED;
        this.logger.warn('One Call API failed, falling back to legacy API', {
          action: LOG_ACTIONS.WEATHER.ERROR,
          error: error.message,
          trigger
        });
        // Fall through to legacy API
      }
    }
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Check cache first (unless forced refresh)
          if (!forceRefresh && this.isCacheValid() && this.cache.current) {
            const cacheAgeMinutes = Math.round(this.getCacheAge() / 60000);
            
            this.logger.info('Weather cache hit', {
              action: LOG_ACTIONS.WEATHER.CACHE_HIT,
              cache_age_minutes: cacheAgeMinutes,
              data_type: 'current',
              trigger,
              cache_status: {
                exists: true,
                age_minutes: cacheAgeMinutes,
                stale: false
              },
              correlation_id: this.logger.correlationId
            });
            prometheusMetrics.recordOperation('weather-current-cache', true);
            return this.cache.current;
          }

          this.logger.info('Fetching current weather', {
            action: LOG_ACTIONS.WEATHER.API_CALL,
            trigger,
            location: this.city,
            api_type: 'legacy'
          });
          
          const url = `https://api.openweathermap.org/data/2.5/weather?q=${this.city}&appid=${this.apiKey}&units=${this.units}`;
          const data = await this.makeHttpRequest(url);
          
          this.cache.current = this.formatCurrentWeather(data);
          this.cache.lastFetch = Date.now();
          this.lastError = null;
          
          prometheusMetrics.recordOperation('weather-current-fetch', true);
          prometheusMetrics.setServiceHealth('WeatherService', 'ok');
          
          this.logger.debug('Current weather data fetched and cached', {
            action: LOG_ACTIONS.WEATHER.API_CALL,
            trigger,
            quota_remaining: this.dailyLimit - this.apiUsage.dailyCount
          });
          return this.cache.current;
        } catch (error) {
          prometheusMetrics.recordOperation('weather-current-fetch', false);
          this.lastError = error.message;
          
          this.logger.error('Weather API call failed', {
            action: LOG_ACTIONS.WEATHER.ERROR,
            error: error.message,
            trigger,
            quota_remaining: this.dailyLimit - this.apiUsage.dailyCount
          });
          
          // Return cached data if available, even if stale
          if (this.cache.current) {
            this.logger.warn('Returning stale cached weather data due to fetch error', {
              action: LOG_ACTIONS.WEATHER.CACHE_HIT,
              cache_age: this.getCacheAge(),
              trigger
            });
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
        this.logger.warn(`One Call API failed, falling back to legacy API: ${error.message}`);
        // Fall through to legacy API
      }
    }
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Check cache first (unless forced refresh)
          if (!forceRefresh && this.isCacheValid() && this.cache.forecast) {
            this.logger.debug('Returning cached forecast data');
            prometheusMetrics.recordOperation('weather-forecast-cache', true);
            return this.cache.forecast;
          }

          this.logger.info(`Fetching weather forecast for ${this.city} (legacy API)`);
          
          const url = `https://api.openweathermap.org/data/2.5/forecast?q=${this.city}&appid=${this.apiKey}&units=${this.units}`;
          const data = await this.makeHttpRequest(url);
          
          this.cache.forecast = this.formatForecast(data);
          this.cache.lastFetch = Date.now();
          this.lastError = null;
          
          prometheusMetrics.recordOperation('weather-forecast-fetch', true);
          prometheusMetrics.setServiceHealth('WeatherService', 'ok');
          
          this.logger.debug('Forecast data fetched and cached');
          return this.cache.forecast;
        } catch (error) {
          prometheusMetrics.recordOperation('weather-forecast-fetch', false);
          this.lastError = error.message;
          
          // Return cached data if available, even if stale
          if (this.cache.forecast) {
            this.logger.warn('Returning stale cached forecast data due to fetch error');
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
    const timer = this.logger.startTimer('weather-onecall');
    const trigger = forceRefresh ? TRIGGER_TYPES.MANUAL : TRIGGER_TYPES.SCHEDULED;
    const correlationId = this.logger.correlationId;

    // CRITICAL: Prevent duplicate concurrent API calls
    if (this.ongoingRequest) {
      this.logger.debug('One Call API request already in progress - waiting for result', {
        action: LOG_ACTIONS.WEATHER.API_CALL,
        trigger,
        correlation_id: correlationId,
        concurrent_request: true
      });
      return await this.ongoingRequest;
    }

    // Check cache first (unless forced refresh)
    if (!forceRefresh && this.isCacheValid() && this.cache.oneCallData) {
      const cacheAgeMinutes = Math.round(this.getCacheAge() / 60000);
      
      this.logger.info('Weather cache hit', {
        action: LOG_ACTIONS.WEATHER.CACHE_HIT,
        cache_age_minutes: cacheAgeMinutes,
        data_type: 'onecall',
        trigger,
        cache_status: {
          exists: true,
          age_minutes: cacheAgeMinutes,
          stale: false
        },
        correlation_id: correlationId
      });
      
      prometheusMetrics.recordOperation('weather-onecall-cache', true);
      return this.cache.oneCallData;
    }

    // Create the API request promise and store it to prevent duplicates
    this.ongoingRequest = this.retryHelper.retryOperation(
      async () => {
        try {
          const apiStartTime = Date.now();
          const cacheAgeMinutes = this.cache.lastFetch ? Math.round((Date.now() - this.cache.lastFetch) / 60000) : null;
          
          this.logger.info('Weather API call initiated', {
            action: LOG_ACTIONS.WEATHER.API_CALL,
            trigger,
            cache_status: {
              exists: !!this.cache.oneCallData,
              age_minutes: cacheAgeMinutes,
              stale: cacheAgeMinutes > 5 // 5 minute cache timeout
            },
            quota: {
              daily_used: this.apiUsage.dailyCount,
              daily_limit: this.dailyLimit,
              percent_used: Math.round((this.apiUsage.dailyCount / this.dailyLimit) * 100),
              cost_per_call: 0.001,
              daily_cost: Math.round(this.apiUsage.dailyCount * 0.001 * 100) / 100
            },
            location: {
              city: this.city,
              lat: this.latitude,
              lon: this.longitude
            },
            correlation_id: correlationId
          });
          
          // One Call API 3.0 URL with all data types
          const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${this.latitude}&lon=${this.longitude}&appid=${this.apiKey}&units=${this.units}&exclude=minutely`;
          const maskedUrl = url.replace(this.apiKey, '***API_KEY***');
          console.log('🌐 Making API request to:', maskedUrl);
          const data = await this.makeHttpRequest(url);
          
          // Enhanced API response logging
          const current = data.current || {};
          const alerts = data.alerts || [];
          console.log('📡 ONE CALL API RESPONSE:', {
            location: { lat: data.lat, lon: data.lon, timezone: data.timezone },
            current_conditions: {
              temp: current.temp,
              feels_like: current.feels_like,
              humidity: current.humidity,
              pressure: current.pressure,
              uv_index: current.uvi,
              visibility: current.visibility,
              clouds: current.clouds,
              weather: current.weather?.[0]?.description,
              wind: { speed: current.wind_speed, direction: current.wind_deg }
            },
            forecasts: {
              hourly_count: data.hourly?.length || 0,
              daily_count: data.daily?.length || 0
            },
            alerts_count: alerts.length,
            data_size_kb: Math.round(JSON.stringify(data).length / 1024)
          });
          
          // Track API usage for cost management
          this.trackApiUsage(forceRefresh);
          
          const apiDuration = Date.now() - apiStartTime;
          
          this.logger.info('OpenWeatherMap API request completed', {
            action: LOG_ACTIONS.WEATHER.API_CALL,
            trigger,
            duration_ms: apiDuration,
            quota_usage: {
              daily: this.apiUsage.dailyCount,
              limit: this.dailyLimit,
              remaining: this.dailyLimit - this.apiUsage.dailyCount,
              cost_today: Math.round(this.apiUsage.dailyCount * 0.001 * 100) / 100
            },
            data_size_kb: Math.round(JSON.stringify(data).length / 1024),
            correlation_id: correlationId
          });
          
          this.cache.oneCallData = data;
          this.cache.lastFetch = Date.now();
          this.lastError = null;
          
          // Update individual caches from One Call data
          this.cache.current = this.formatCurrentWeatherFromOneCall(data);
          this.cache.forecast = this.formatForecastFromOneCall(data);
          
          prometheusMetrics.recordOperation('weather-onecall-fetch', true);
          prometheusMetrics.setServiceHealth('WeatherService', 'ok');
          
          this.logger.debug('One Call API data fetched and cached', {
            action: LOG_ACTIONS.WEATHER.API_CALL,
            trigger,
            cache_age: 0
          });
          return data;
        } catch (error) {
          prometheusMetrics.recordOperation('weather-onecall-fetch', false);
          this.lastError = error.message;
          
          this.logger.error('One Call API request failed', {
            action: LOG_ACTIONS.WEATHER.ERROR,
            error: {
              message: error.message,
              code: error.code || 'UNKNOWN',
              stack: error.stack
            },
            trigger,
            quota: {
              daily_used: this.apiUsage.dailyCount,
              daily_limit: this.dailyLimit,
              remaining: this.dailyLimit - this.apiUsage.dailyCount
            },
            retry_context: {
              attempt: this.retryHelper.currentAttempt || 1,
              max_attempts: this.retryHelper.maxAttempts || 3
            },
            correlation_id: correlationId
          });
          
          // Return cached data if available, even if stale
          if (this.cache.oneCallData) {
            const staleAgeMinutes = Math.round(this.getCacheAge() / 60000);
            
            this.logger.warn('Returning stale cached One Call API data due to fetch error', {
              action: LOG_ACTIONS.WEATHER.CACHE_HIT,
              cache_age_minutes: staleAgeMinutes,
              data_type: 'onecall_stale',
              trigger,
              fallback_reason: 'api_error',
              correlation_id: correlationId
            });
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
      timer.end({
        action: LOG_ACTIONS.WEATHER.API_CALL,
        trigger,
        cache_status: forceRefresh ? 'forced' : 'miss'
      });
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
    this.logger.debug('Weather cache cleared');
    prometheusMetrics.recordOperation('weather-cache-clear', true);
  }

  /**
   * Track API usage and persist to file
   * @param {boolean} isManual - Whether this was a manual refresh
   */
  trackApiUsage(isManual) {
    const now = Date.now();
    const todayInUserTz = this.timezoneManager.getCurrentUserTime().toDateString();
    
    // Reset counter if it's a new day
    if (this.apiUsage.lastResetDate !== todayInUserTz) {
      this.logger.info('Resetting API usage counter for new day', {
        action: LOG_ACTIONS.WEATHER.API_CALL,
        previous_count: this.apiUsage.dailyCount,
        new_count: 0
      });
      this.apiUsage = {
        dailyCount: 0,
        lastResetDate: todayInUserTz,
        lastManualRefresh: 0,
        totalCost: 0
      };
    }
    
    // Update usage
    this.apiUsage.dailyCount++;
    if (isManual) {
      this.apiUsage.lastManualRefresh = now;
    }
    
    // Calculate cost (assuming $0.001 per call)
    this.apiUsage.totalCost += 0.001;
    
    // Check for quota warnings
    const usagePercent = (this.apiUsage.dailyCount / this.dailyLimit) * 100;
    const remaining = this.dailyLimit - this.apiUsage.dailyCount;
    
    if (usagePercent >= 90) {
      this.logger.warn('Weather API quota approaching limit', {
        action: LOG_ACTIONS.WEATHER.QUOTA_EXCEEDED,
        quota: {
          daily_used: this.apiUsage.dailyCount,
          daily_limit: this.dailyLimit,
          percent_used: Math.round(usagePercent),
          remaining: remaining,
          cost_today: Math.round(this.apiUsage.totalCost * 100) / 100
        },
        trigger_type: isManual ? 'manual' : 'automatic',
        correlation_id: this.logger.correlationId
      });
    } else if (usagePercent >= 70) {
      this.logger.info('Weather API quota at 70% threshold', {
        action: LOG_ACTIONS.WEATHER.API_CALL,
        quota: {
          daily_used: this.apiUsage.dailyCount,
          daily_limit: this.dailyLimit,
          percent_used: Math.round(usagePercent),
          remaining: remaining,
          cost_today: Math.round(this.apiUsage.totalCost * 100) / 100
        },
        trigger_type: isManual ? 'manual' : 'automatic',
        correlation_id: this.logger.correlationId
      });
    } else {
      this.logger.debug('API usage updated', {
        action: LOG_ACTIONS.WEATHER.API_CALL,
        quota: {
          daily_used: this.apiUsage.dailyCount,
          daily_limit: this.dailyLimit,
          percent_used: Math.round(usagePercent),
          remaining: remaining,
          cost_today: Math.round(this.apiUsage.totalCost * 100) / 100
        },
        trigger_type: isManual ? 'manual' : 'automatic',
        correlation_id: this.logger.correlationId
      });
    }
    
    // Persist to file
    try {
      fs.writeFileSync(this.apiUsageFile, JSON.stringify(this.apiUsage, null, 2));
    } catch (error) {
      this.logger.error('Failed to persist API usage data', {
        action: LOG_ACTIONS.WEATHER.ERROR,
        error: error.message
      });
    }
  }

  /**
   * Load API usage data from persistent storage
   * @returns {Object} API usage data
   */
  loadApiUsage() {
    try {
      if (fs.existsSync(this.apiUsageFile)) {
        const data = JSON.parse(fs.readFileSync(this.apiUsageFile, 'utf8'));
        const todayInUserTz = this.timezoneManager.getCurrentUserTime().toDateString();
        
        // Reset if new day in user timezone
        if (data.lastResetDate !== todayInUserTz) {
          this.logger.info(`New day detected. Resetting API usage counter from ${data.dailyCount} to 0`);
          return {
            dailyCount: 0,
            lastResetDate: todayInUserTz,
            lastManualRefresh: 0,
            totalCost: 0
          };
        }
        
        this.logger.info(`API usage restored from file: ${data.dailyCount} calls for ${data.lastResetDate}`);
        return data;
      }
    } catch (error) {
      this.logger.warn(`Failed to load API usage file: ${error.message}`);
    }
    
    // Default values if file doesn't exist or can't be read
    return {
      dailyCount: 0,
      lastResetDate: this.timezoneManager.getCurrentUserTime().toDateString(),
      lastManualRefresh: 0,
      totalCost: 0
    };
  }

  /**
   * Get cache age in milliseconds
   * @returns {number} Cache age in milliseconds
   */
  getCacheAge() {
    if (!this.cache.lastFetch) return null;
    return Date.now() - this.cache.lastFetch;
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
      // Apply timezone offset to convert UTC to local time
      const localTimestamp = (item.dt + data.timezone) * 1000;
      const date = new Date(localTimestamp);
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
        timestamp: date.toISOString(),
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
        datetime: new Date((item.dt + data.timezone) * 1000).toISOString(),
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
    
    // DEBUG: Log raw temperature values from API
    console.log('🌡️ RAW API TEMPERATURE DATA:', {
      raw_temp: current.temp,
      raw_feels_like: current.feels_like,
      rounded_temp: Math.round(current.temp),
      rounded_feels_like: Math.round(current.feels_like),
      api_timestamp: current.dt,
      timezone_offset: data.timezone_offset
    });
    
    // Apply timezone offset to convert UTC to local time
    const localCurrentTimestamp = (current.dt + data.timezone_offset) * 1000;
    const localCurrentTime = new Date(localCurrentTimestamp);
    // Use current local time for lastUpdated
    const localNow = new Date(Date.now() + (data.timezone_offset * 1000));
    
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
      currentTime: localCurrentTime.toISOString().replace('Z', ''),
      lastUpdated: localNow.toISOString().replace('Z', '')
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
      // Apply timezone offset to convert UTC to local time for display
      const localTimestamp = (hour.dt + data.timezone_offset) * 1000;
      const localDate = new Date(localTimestamp);
      return {
        timestamp: localDate.toISOString().replace('Z', ''), // Local time without Z suffix
        time: localDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' }),
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
      // Use user timezone for proper day grouping
      const userTimeDate = this.timezoneManager.toUserTime(new Date(hour.timestamp));
      const mountainDate = new Date(userTimeDate);
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
      // Apply timezone offset to convert UTC to local time
      const localDayTimestamp = (day.dt + data.timezone_offset) * 1000;
      return {
        date: new Date(localDayTimestamp).toISOString().split('T')[0],
        dayOfWeek: new Date(localDayTimestamp).toLocaleDateString('en-US', { weekday: 'short' }),
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
      const userTimeDate = this.timezoneManager.toUserTime(dailyDate);
      const dayKey = userTimeDate.toDateString();
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
        datetime: new Date((hour.dt + data.timezone_offset) * 1000).toISOString(),
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
        datetime: new Date((day.dt + data.timezone_offset) * 1000).toISOString(),
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
   * Get sunrise and sunset times for a specific date with caching
   * @param {Date} date - The date to get times for (defaults to today)
   * @returns {Promise<Object>} Sunrise and sunset data
   */
  async getSunriseSunsetTimes(date = new Date()) {
    // Use user's timezone for date calculation
    const formattedDate = date.toLocaleDateString('en-CA', { timeZone: this.timezoneManager.getCronTimezone() });
    
    // Check cache first
    const cachedData = this.getSunTimesFromCache(formattedDate);
    if (cachedData) {
      this.logger.debug(`Using cached sun times for ${formattedDate}`);
      return {
        success: true,
        data: cachedData
      };
    }
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Use sunrise-sunset.org API for all dates (includes twilight data)
          const lat = 39.66336894676102; // Silverthorne, CO
          const lon = -106.06774195949477; // Silverthorne, CO
          
          const url = `https://api.sunrise-sunset.org/json?tzid=America/Denver&lat=${lat}&lng=${lon}&date=${formattedDate}&formatted=0`;
          console.log('🌐 Making API request to:', url);
          const data = await this.makeHttpRequest(url);
          
          // Log sunrise-sunset API response
          if (data.status === 'OK') {
            console.log('☀️ SUNRISE-SUNSET API RESPONSE:', {
              date: formattedDate,
              sunrise: data.results.sunrise,
              sunset: data.results.sunset,
              civil_twilight_begin: data.results.civil_twilight_begin,
              civil_twilight_end: data.results.civil_twilight_end,
              day_length: data.results.day_length,
              solar_noon: data.results.solar_noon
            });
          }
          
          if (data.status === 'OK') {
            const sunriseDate = new Date(data.results.sunrise);
            const sunsetDate = new Date(data.results.sunset);
            
            const sunTimesData = {
              date: formattedDate,
              sunrise: sunriseDate.getTime(),
              sunset: sunsetDate.getTime(),
              sunriseTime: this.timezoneManager.formatForDisplay(sunriseDate),
              sunsetTime: this.timezoneManager.formatForDisplay(sunsetDate),
              // Store additional twilight and solar timing data
              civilTwilightBegin: data.results.civil_twilight_begin,
              civilTwilightEnd: data.results.civil_twilight_end,
              nauticalTwilightBegin: data.results.nautical_twilight_begin,
              nauticalTwilightEnd: data.results.nautical_twilight_end,
              astronomicalTwilightBegin: data.results.astronomical_twilight_begin,
              astronomicalTwilightEnd: data.results.astronomical_twilight_end,
              solarNoon: data.results.solar_noon,
              dayLength: data.results.day_length
            };
            
            // Cache the result
            this.cacheSunTimes(formattedDate, sunTimesData);
            
            return {
              success: true,
              data: sunTimesData
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
   * Get sun times from cache
   * @param {string} dateKey - Date in YYYY-MM-DD format
   * @returns {Object|null} Cached sun times data or null
   */
  getSunTimesFromCache(dateKey) {
    try {
      const cacheFile = path.join(__dirname, '../../../data/cache/sun_times_cache.json');
      
      if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const dayData = cache[dateKey];
        
        if (dayData) {
          // Check if cache is still valid (24 hours)
          const now = Date.now();
          const expiresAt = dayData.expires_at || 0;
          
          if (now < expiresAt) {
            return dayData;
          } else {
            this.logger.debug(`Sun times cache expired for ${dateKey}`);
            // Remove expired entry
            delete cache[dateKey];
            fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`Error reading sun times cache: ${error.message}`);
      return null;
    }
  }

  /**
   * Cache sun times data
   * @param {string} dateKey - Date in YYYY-MM-DD format
   * @param {Object} sunTimesData - Sun times data to cache
   */
  cacheSunTimes(dateKey, sunTimesData) {
    try {
      const cacheFile = path.join(__dirname, '../../../data/cache/sun_times_cache.json');
      const cacheDir = path.dirname(cacheFile);
      
      // Ensure cache directory exists
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // Load existing cache or create new
      let cache = {};
      if (fs.existsSync(cacheFile)) {
        try {
          cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        } catch (parseError) {
          this.logger.warn(`Failed to parse sun times cache, creating new: ${parseError.message}`);
          cache = {};
        }
      }
      
      // Add expiration time (24 hours from now)
      const now = Date.now();
      const expiresAt = now + (24 * 60 * 60 * 1000); // 24 hours
      
      // Store data with metadata
      cache[dateKey] = {
        ...sunTimesData,
        cached_at: now,
        expires_at: expiresAt
      };
      
      // Clean up old cache entries (keep only last 7 days)
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      Object.keys(cache).forEach(key => {
        if (cache[key].cached_at < sevenDaysAgo) {
          delete cache[key];
        }
      });
      
      // Write cache file
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
      this.logger.info(`Sun times cached for ${dateKey}, expires in 24 hours`);
      
    } catch (error) {
      this.logger.error(`Error caching sun times: ${error.message}`);
    }
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
    this.logger.info(`Recovery procedure called for WeatherService (attempt ${attemptNumber})`);
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
      this.logger.error(`Recovery failed: ${error.message}`);
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