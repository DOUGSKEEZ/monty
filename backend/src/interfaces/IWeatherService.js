/**
 * IWeatherService - Interface for weather service implementations
 * 
 * Defines the required methods for any weather service implementation.
 * This provides a contract that different implementations must follow.
 */

const BaseInterface = require('./BaseInterface');

class IWeatherService extends BaseInterface {
  /**
   * Check if the weather service is configured
   * @returns {boolean} - True if the service is configured
   */
  isConfigured() {
    throw new Error('Method not implemented');
  }

  /**
   * Get the current weather data
   * @param {boolean} forceRefresh - Force a refresh of the data even if cached
   * @returns {Promise<object>} - The weather data with at minimum:
   *   - success: boolean indicating success or failure
   *   - data: The weather data (when success is true)
   *   - error: Error message (when success is false)
   *   - cached: Boolean indicating if data came from cache
   */
  async getCurrentWeather(forceRefresh = false) {
    throw new Error('Method not implemented');
  }

  /**
   * Get the weather forecast
   * @param {boolean} forceRefresh - Force a refresh of the data even if cached
   * @returns {Promise<object>} - The forecast data with at minimum:
   *   - success: boolean indicating success or failure
   *   - data: The forecast data (when success is true)
   *   - error: Error message (when success is false)
   *   - cached: Boolean indicating if data came from cache
   */
  async getForecast(forceRefresh = false) {
    throw new Error('Method not implemented');
  }

  /**
   * Get sunrise and sunset times for a specific date
   * @param {Date} date - The date to get times for (defaults to today)
   * @returns {Promise<object>} - Sunrise and sunset data with at minimum:
   *   - success: boolean indicating success or failure
   *   - data: The sun times data (when success is true)
   *   - error: Error message (when success is false)
   */
  async getSunriseSunsetTimes(date = new Date()) {
    throw new Error('Method not implemented');
  }
}

module.exports = IWeatherService;