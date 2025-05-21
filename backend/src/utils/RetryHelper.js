/**
 * RetryHelper - Utility for handling retries with exponential backoff
 * 
 * This class provides methods to retry async operations with configurable
 * retry counts, delays, and backoff strategies. It's designed to be used
 * for service initialization and API calls that may fail transiently.
 */

const logger = require('./logger').getModuleLogger('retry-helper');
const prometheusMetrics = require('../services/PrometheusMetricsService');

class RetryHelper {
  /**
   * Create a new RetryHelper instance
   * @param {Object} options - Configuration options
   * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
   * @param {number} options.initialDelay - Initial delay between retries in ms (default: 1000)
   * @param {number} options.backoffFactor - Exponential backoff multiplier (default: 2)
   * @param {boolean} options.enabled - Whether retries are enabled (default: true)
   */
  constructor(options = {}) {
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.initialDelay = options.initialDelay !== undefined ? options.initialDelay : 1000;
    this.backoffFactor = options.backoffFactor !== undefined ? options.backoffFactor : 2;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.retryHistory = {}; // Tracks retry attempts for reporting
  }

  /**
   * Sleep for a specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after the delay
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry an async function with exponential backoff
   * 
   * @param {Function} fn - The async function to retry
   * @param {Object} options - Retry options for this specific operation
   * @param {string} options.operationName - Name of the operation for logging
   * @param {boolean} options.isCritical - Whether this operation is critical
   * @param {number} options.maxRetries - Override default maxRetries for this operation
   * @param {number} options.initialDelay - Override default initialDelay for this operation
   * @param {number} options.backoffFactor - Override default backoffFactor for this operation
   * @param {Function} options.onRetry - Called before each retry with (attempt, delay, error)
   * @param {Function} options.shouldRetry - Function to determine if error is retryable (err) => boolean
   * @returns {Promise<any>} - Result of the function or throws after max retries
   */
  async retryOperation(fn, options = {}) {
    if (!this.enabled) {
      logger.debug(`Retries disabled, executing ${options.operationName || 'operation'} without retries`);
      return fn();
    }

    const operationName = options.operationName || 'unnamed operation';
    const isCritical = !!options.isCritical;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
    const initialDelay = options.initialDelay !== undefined ? options.initialDelay : this.initialDelay;
    const backoffFactor = options.backoffFactor !== undefined ? options.backoffFactor : this.backoffFactor;
    const onRetry = options.onRetry || (() => {});
    const shouldRetry = options.shouldRetry || (() => true);

    // Initialize retry history for this operation
    const historyKey = `${operationName}_${Date.now()}`;
    this.retryHistory[historyKey] = {
      operationName,
      isCritical,
      startTime: Date.now(),
      attempts: 0,
      success: false,
      lastError: null,
      delays: []
    };

    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      try {
        if (attempt > 0) {
          const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
          this.retryHistory[historyKey].delays.push(delay);
          
          logger.info(`Retry ${attempt}/${maxRetries} for ${operationName} after ${delay}ms delay`);
          await this.sleep(delay);
          
          // Call onRetry callback before the retry
          onRetry(attempt, delay, lastError);
        }

        // Execute the operation
        this.retryHistory[historyKey].attempts++;
        const result = await fn();
        
        // Operation succeeded
        this.retryHistory[historyKey].success = true;
        this.retryHistory[historyKey].endTime = Date.now();

        // Record successful operation in Prometheus
        prometheusMetrics.recordRetry(operationName, true);
        
        if (attempt > 0) {
          logger.info(`Successfully completed ${operationName} after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        this.retryHistory[historyKey].lastError = error.message;
        
        // Check if we should retry this type of error
        if (!shouldRetry(error)) {
          logger.warn(`Error in ${operationName} is not retryable: ${error.message}`);
          
          // Record non-retryable error in Prometheus
          prometheusMetrics.recordRetry(operationName, false);

          throw error;
        }
        
        attempt++;
        
        if (attempt > maxRetries) {
          const errorMsg = `${operationName} failed after ${maxRetries} retries: ${error.message}`;
          this.retryHistory[historyKey].endTime = Date.now();

          // Record failed operation in Prometheus after exhausting retries
          prometheusMetrics.recordRetry(operationName, false);
          
          if (isCritical) {
            logger.error(errorMsg);
          } else {
            logger.warn(errorMsg);
          }
          
          throw error;
        } else {
          logger.warn(`${operationName} failed (attempt ${attempt}/${maxRetries + 1}): ${error.message}`);
        }
      }
    }
  }

  /**
   * Get retry statistics for reporting
   * @returns {Object} - Retry statistics and history
   */
  getRetryStats() {
    const stats = {
      operations: Object.keys(this.retryHistory).length,
      successful: 0,
      failed: 0,
      criticalFailed: 0,
      totalRetries: 0,
      details: {}
    };

    // Group retry history by operation name
    const groupedHistory = {};
    
    for (const [key, history] of Object.entries(this.retryHistory)) {
      const { operationName } = history;
      
      if (!groupedHistory[operationName]) {
        groupedHistory[operationName] = [];
      }
      
      groupedHistory[operationName].push(history);
      
      // Update stats
      if (history.success) {
        stats.successful++;
      } else {
        stats.failed++;
        if (history.isCritical) {
          stats.criticalFailed++;
        }
      }
      
      stats.totalRetries += Math.max(0, history.attempts - 1);
    }
    
    // Summarize for each operation
    for (const [opName, histories] of Object.entries(groupedHistory)) {
      stats.details[opName] = {
        attempts: histories.reduce((sum, h) => sum + h.attempts, 0),
        successes: histories.filter(h => h.success).length,
        failures: histories.filter(h => !h.success).length,
        lastError: histories.length > 0 ? histories[histories.length - 1].lastError : null,
        avgRetries: histories.length > 0 ? 
          (histories.reduce((sum, h) => sum + h.attempts, 0) / histories.length - 1).toFixed(1) : 0
      };
    }
    
    return stats;
  }

  /**
   * Clear retry history to free memory
   */
  clearHistory() {
    this.retryHistory = {};
  }
}

// Export a singleton instance with default settings
const retryHelper = new RetryHelper();
module.exports = retryHelper;

// Also export the class for creating custom instances
module.exports.RetryHelper = RetryHelper;