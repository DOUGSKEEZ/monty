/**
 * CircuitBreaker - Utility for handling fault tolerance with the circuit breaker pattern
 * 
 * This class implements a circuit breaker pattern with three states:
 * - CLOSED: Normal operation, all requests are allowed through
 * - OPEN: Circuit is tripped, all requests fail fast without calling the service
 * - HALF_OPEN: Testing if the service has recovered, allowing limited requests
 * 
 * The circuit starts in CLOSED state and transitions to OPEN when failure rate 
 * exceeds a threshold. After a reset timeout, it moves to HALF_OPEN to test recovery.
 * If tests succeed, it moves back to CLOSED; if they fail, it returns to OPEN.
 */

const EventEmitter = require('events');
const logger = require('./logger').getModuleLogger('circuit-breaker');
const prometheusMetrics = require('../services/PrometheusMetricsService');

// Circuit states
const STATES = {
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',           // Circuit is tripped (failing fast)
  HALF_OPEN: 'HALF_OPEN'  // Testing if the service has recovered
};

class CircuitBreaker extends EventEmitter {
  /**
   * Create a new CircuitBreaker
   * @param {Object} options - Configuration options
   * @param {string} options.name - Name of this circuit (for logging/metrics)
   * @param {number} options.failureThreshold - Percentage of failures to trip circuit (default: 50)
   * @param {number} options.resetTimeout - Time in ms before testing service again (default: 30000)
   * @param {number} options.halfOpenSuccessThreshold - Successful requests in half-open to close circuit (default: 5)
   * @param {number} options.rollingWindowSize - Number of recent requests to track (default: 10)
   * @param {Function} options.fallbackFunction - Function to call when circuit is open (default: throws error)
   */
  constructor(options = {}) {
    super();
    
    this.name = options.name || 'unnamed-circuit';
    this.failureThreshold = options.failureThreshold !== undefined ? options.failureThreshold : 50;
    this.resetTimeout = options.resetTimeout !== undefined ? options.resetTimeout : 30000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold !== undefined ? options.halfOpenSuccessThreshold : 5;
    this.rollingWindowSize = options.rollingWindowSize !== undefined ? options.rollingWindowSize : 10;
    this.fallbackFunction = options.fallbackFunction || this.defaultFallback;
    
    // Circuit state tracking
    this.state = STATES.CLOSED;
    this.lastStateChange = Date.now();
    this.halfOpenSuccesses = 0;
    this.resetTimer = null;
    
    // Request tracking
    this.requestCounts = {
      total: 0,
      success: 0,
      failure: 0,
      timeout: 0,
      rejected: 0,   // Rejected due to OPEN circuit
      fallback: 0    // Fallback was used
    };
    
    // Rolling window tracking
    this.rollingWindow = [];
    
    logger.info(`Circuit breaker "${this.name}" initialized in ${this.state} state`);
  }
  
  /**
   * Execute a function with circuit breaker protection
   * @param {Function} func - Async function to execute
   * @param {any} context - Context to bind to the function (this)
   * @param {Array} args - Arguments to pass to the function
   * @returns {Promise<any>} - Result of the function or fallback
   */
  async execute(func, context = null, ...args) {
    // Check circuit state before attempting execution
    if (this.state === STATES.OPEN) {
      this.requestCounts.rejected++;
      this.requestCounts.total++;
      
      logger.debug(`Circuit "${this.name}" is OPEN, rejecting request and using fallback`);
      this.emit('rejected', { circuit: this.name, state: this.state });
      
      // Use fallback instead of the actual function
      try {
        const fallbackResult = await this.fallbackFunction(...args);
        this.requestCounts.fallback++;
        return fallbackResult;
      } catch (fallbackError) {
        logger.error(`Fallback for circuit "${this.name}" failed: ${fallbackError.message}`);
        throw new Error(`Circuit open and fallback failed: ${fallbackError.message}`);
      }
    }
    
    // For HALF_OPEN, only allow limited requests to test service
    if (this.state === STATES.HALF_OPEN && this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
      this.requestCounts.rejected++;
      this.requestCounts.total++;
      
      logger.debug(`Circuit "${this.name}" is HALF_OPEN with max test requests, rejecting additional requests`);
      this.emit('rejected', { circuit: this.name, state: this.state });
      
      // Use fallback for excess requests in HALF_OPEN state
      try {
        const fallbackResult = await this.fallbackFunction(...args);
        this.requestCounts.fallback++;
        return fallbackResult;
      } catch (fallbackError) {
        throw new Error(`Circuit half-open (at capacity) and fallback failed: ${fallbackError.message}`);
      }
    }
    
    // Execute the request
    const startTime = Date.now();
    let succeeded = false;
    
    try {
      const result = await func.apply(context, args);
      succeeded = true;
      
      // Record success
      this.recordSuccess();
      
      // For HALF_OPEN state, check if we've reached success threshold
      if (this.state === STATES.HALF_OPEN) {
        this.halfOpenSuccesses++;
        
        if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
          this.closeCircuit('Success threshold met in half-open state');
        }
      }
      
      return result;
    } catch (error) {
      // Record failure and check if we need to trip the circuit
      this.recordFailure(error);
      
      // If in HALF_OPEN state, a single failure sends us back to OPEN
      if (this.state === STATES.HALF_OPEN) {
        this.openCircuit('Request failed while testing circuit in half-open state');
      } 
      // If in CLOSED state, check if we've hit the failure threshold
      else if (this.state === STATES.CLOSED) {
        const failureRate = this.calculateFailureRate();
        
        if (failureRate >= this.failureThreshold) {
          this.openCircuit(`Failure rate ${failureRate.toFixed(1)}% exceeded threshold ${this.failureThreshold}%`);
          
          // Use fallback since we just opened the circuit
          try {
            const fallbackResult = await this.fallbackFunction(...args);
            this.requestCounts.fallback++;
            return fallbackResult;
          } catch (fallbackError) {
            throw new Error(`Circuit opened and fallback failed: ${fallbackError.message}`);
          }
        }
      }
      
      // Re-throw the original error
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      
      this.emit('execution', {
        circuit: this.name,
        success: succeeded,
        time: executionTime,
        state: this.state
      });
    }
  }
  
  /**
   * Record a successful request
   */
  recordSuccess() {
    this.requestCounts.success++;
    this.requestCounts.total++;
    
    // Add to rolling window
    this.rollingWindow.push({
      time: Date.now(),
      success: true
    });
    
    // Trim rolling window if needed
    this.trimRollingWindow();
  }
  
  /**
   * Record a failed request
   * @param {Error} error - The error that occurred
   */
  recordFailure(error) {
    this.requestCounts.failure++;
    this.requestCounts.total++;
    
    // Check if it was a timeout
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      this.requestCounts.timeout++;
    }
    
    // Add to rolling window
    this.rollingWindow.push({
      time: Date.now(),
      success: false,
      error: error.message
    });
    
    // Trim rolling window if needed
    this.trimRollingWindow();
  }
  
  /**
   * Trim the rolling window to the configured size
   */
  trimRollingWindow() {
    if (this.rollingWindow.length > this.rollingWindowSize) {
      this.rollingWindow = this.rollingWindow.slice(-this.rollingWindowSize);
    }
  }
  
  /**
   * Calculate the current failure rate based on the rolling window
   * @returns {number} - Failure rate as a percentage (0-100)
   */
  calculateFailureRate() {
    if (this.rollingWindow.length === 0) {
      return 0;
    }
    
    const failures = this.rollingWindow.filter(entry => !entry.success).length;
    return (failures / this.rollingWindow.length) * 100;
  }
  
  /**
   * Open the circuit (trip the breaker)
   * @param {string} reason - Reason for opening the circuit
   */
  openCircuit(reason) {
    if (this.state !== STATES.OPEN) {
      const previousState = this.state;
      this.state = STATES.OPEN;
      this.lastStateChange = Date.now();
      this.halfOpenSuccesses = 0;
      
      // Add Prometheus metrics here
      prometheusMetrics.setCircuitBreakerState(this.name, this.state);

      logger.warn(`Circuit "${this.name}" opened: ${reason}`);
      
      // Set a timer to try again (move to HALF_OPEN) after resetTimeout
      this.resetTimer = setTimeout(() => {
        this.halfOpenCircuit('Reset timeout elapsed');
      }, this.resetTimeout);
      
      // Emit state change event
      this.emit('stateChange', {
        circuit: this.name,
        from: previousState,
        to: STATES.OPEN,
        reason,
        time: this.lastStateChange
      });
    }
  }
  
  /**
   * Move circuit to HALF_OPEN state to test if service has recovered
   * @param {string} reason - Reason for moving to half-open state
   */
  halfOpenCircuit(reason) {
    if (this.state !== STATES.HALF_OPEN) {
      const previousState = this.state;
      this.state = STATES.HALF_OPEN;
      this.lastStateChange = Date.now();
      this.halfOpenSuccesses = 0;
      
      // Add Prometheus metrics here
      prometheusMetrics.setCircuitBreakerState(this.name, this.state);

      // Clear any existing reset timer
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }
      
      logger.info(`Circuit "${this.name}" half-opened: ${reason}`);
      
      // Emit state change event
      this.emit('stateChange', {
        circuit: this.name,
        from: previousState,
        to: STATES.HALF_OPEN,
        reason,
        time: this.lastStateChange
      });
    }
  }
  
  /**
   * Close the circuit (normal operation)
   * @param {string} reason - Reason for closing the circuit
   */
  closeCircuit(reason) {
    if (this.state !== STATES.CLOSED) {
      const previousState = this.state;
      this.state = STATES.CLOSED;
      this.lastStateChange = Date.now();
      this.halfOpenSuccesses = 0;
      
      // Add Prometheus metrics here
      prometheusMetrics.setCircuitBreakerState(this.name, this.state);

      // Clear any existing reset timer
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }
      
      // Clear the rolling window to start fresh
      this.rollingWindow = [];
      
      logger.info(`Circuit "${this.name}" closed: ${reason}`);
      
      // Emit state change event
      this.emit('stateChange', {
        circuit: this.name,
        from: previousState,
        to: STATES.CLOSED,
        reason,
        time: this.lastStateChange
      });
    }
  }
  
  /**
   * Default fallback function that throws an error
   * Override this with a custom fallback when creating circuit breaker instances
   */
  defaultFallback(...args) {
    throw new Error(`Service unavailable (circuit "${this.name}" is open)`);
  }
  
  /**
   * Force the circuit to a specific state (for testing or manual recovery)
   * @param {string} newState - The state to set (OPEN, CLOSED, or HALF_OPEN)
   * @param {string} reason - Reason for the forced state change
   */
  forceState(newState, reason = 'Manually forced') {
    if (!Object.values(STATES).includes(newState)) {
      throw new Error(`Invalid circuit state: ${newState}`);
    }
    
    const previousState = this.state;
    
    // Clear any existing reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    switch (newState) {
      case STATES.OPEN:
        this.state = STATES.OPEN;
        this.lastStateChange = Date.now();
        this.halfOpenSuccesses = 0;
        
        // Add Prometheus metrics here
        prometheusMetrics.setCircuitBreakerState(this.name, this.state);

        // Set reset timer
        this.resetTimer = setTimeout(() => {
          this.halfOpenCircuit('Reset timeout elapsed');
        }, this.resetTimeout);
        break;
        
      case STATES.HALF_OPEN:
        this.state = STATES.HALF_OPEN;
        this.lastStateChange = Date.now();
        this.halfOpenSuccesses = 0;

        // Add Prometheus metrics here
        prometheusMetrics.setCircuitBreakerState(this.name, this.state);

        break;
        
      case STATES.CLOSED:
        this.state = STATES.CLOSED;
        this.lastStateChange = Date.now();
        this.halfOpenSuccesses = 0;
        this.rollingWindow = [];

        // Add Prometheus metrics here
        prometheusMetrics.setCircuitBreakerState(this.name, this.state);
        
        break;
    }
    
    logger.info(`Circuit "${this.name}" state forced from ${previousState} to ${newState}: ${reason}`);
    
    // Emit state change event
    this.emit('stateChange', {
      circuit: this.name,
      from: previousState,
      to: newState,
      reason: `Forced: ${reason}`,
      time: this.lastStateChange,
      forced: true
    });
  }
  
  /**
   * Reset the circuit to its initial closed state
   */
  reset() {
    this.forceState(STATES.CLOSED, 'Manual reset');
    this.requestCounts = {
      total: 0,
      success: 0,
      failure: 0,
      timeout: 0,
      rejected: 0,
      fallback: 0
    };
    this.rollingWindow = [];
  }
  
  /**
   * Get circuit status information
   * @returns {Object} - Status details of this circuit
   */
  getStatus() {
    const failureRate = this.calculateFailureRate();
    
    return {
      name: this.name,
      state: this.state,
      metrics: {
        total: this.requestCounts.total,
        success: this.requestCounts.success,
        failure: this.requestCounts.failure,
        timeout: this.requestCounts.timeout,
        rejected: this.requestCounts.rejected,
        fallback: this.requestCounts.fallback,
        failureRate: failureRate.toFixed(1) + '%'
      },
      config: {
        failureThreshold: this.failureThreshold + '%',
        resetTimeout: this.resetTimeout + 'ms',
        halfOpenSuccessThreshold: this.halfOpenSuccessThreshold,
        rollingWindowSize: this.rollingWindowSize
      },
      tracking: {
        windowSize: this.rollingWindow.length,
        halfOpenSuccesses: this.halfOpenSuccesses,
        lastStateChange: new Date(this.lastStateChange).toISOString(),
        uptime: Date.now() - this.lastStateChange
      }
    };
  }
}

// Export the CircuitBreaker class
module.exports = CircuitBreaker;

// Also export the state constants
module.exports.STATES = STATES;

/**
 * Create a new CircuitBreaker for a service
 * @param {string} name - Name of the service
 * @param {object} options - Circuit breaker options
 * @returns {CircuitBreaker} - A new CircuitBreaker instance
 */
module.exports.create = (name, options = {}) => {
  return new CircuitBreaker({ name, ...options });
};

/**
 * Create a CircuitBreaker with default fallback to cached data
 * @param {string} name - Name of the service
 * @param {Function} getCachedData - Function to retrieve cached data
 * @param {object} options - Additional circuit breaker options
 * @returns {CircuitBreaker} - A new CircuitBreaker instance with cache fallback
 */
module.exports.createWithCacheFallback = (name, getCachedData, options = {}) => {
  const fallbackFunction = async (...args) => {
    const cachedData = await getCachedData(...args);
    if (!cachedData) {
      throw new Error(`No cached data available for ${name}`);
    }
    return {
      ...cachedData,
      fromCache: true,
      cacheTime: cachedData.timestamp || Date.now()
    };
  };
  
  return new CircuitBreaker({
    name,
    fallbackFunction,
    ...options
  });
};