// /home/monty/monty/backend/src/services/PrometheusMetricsService.js
const promClient = require('prom-client');
const logger = require('../utils/logger');

// Initialize the Prometheus registry
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

class PrometheusMetricsService {
  constructor() {
    this.logger = logger.getModuleLogger('prometheus-metrics');
    this.isInitialized = false;
    
    // Create metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10] // in seconds
    });
    
    this.httpRequestCounter = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });
    
    this.serviceHealthGauge = new promClient.Gauge({
      name: 'service_health_status',
      help: 'Health status of services (0=error, 0.5=degraded, 1=ok)',
      labelNames: ['service']
    });
    
    this.circuitBreakerGauge = new promClient.Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=open, 0.5=half-open, 1=closed)',
      labelNames: ['circuit']
    });
    
    this.retryCounter = new promClient.Counter({
      name: 'retry_attempts_total',
      help: 'Total number of retry attempts',
      labelNames: ['operation', 'success']
    });
    
    this.recoveryCounter = new promClient.Counter({
      name: 'recovery_attempts_total',
      help: 'Total number of self-healing recovery attempts',
      labelNames: ['service', 'success']
    });
    
    this.apiDurationHistogram = new promClient.Histogram({
      name: 'api_call_duration_seconds',
      help: 'Duration of external API calls in seconds',
      labelNames: ['api', 'endpoint'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10] // in seconds
    });
    
    // Register metrics
    register.registerMetric(this.httpRequestDuration);
    register.registerMetric(this.httpRequestCounter);
    register.registerMetric(this.serviceHealthGauge);
    register.registerMetric(this.circuitBreakerGauge);
    register.registerMetric(this.retryCounter);
    register.registerMetric(this.recoveryCounter);
    register.registerMetric(this.apiDurationHistogram);
    
    this.isInitialized = true;
    this.logger.info('PrometheusMetricsService initialized');
  }
  
  // API to track HTTP requests
  observeHttpRequest(req, res, time) {
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;
    
    this.httpRequestDuration.labels(method, route, statusCode).observe(time);
    this.httpRequestCounter.labels(method, route, statusCode).inc();
  }
  
  // Increment the HTTP request counter directly
  incrementHttpRequestCount(method, route) {
    if (!method || !route) {
      this.logger.warn('Invalid parameters for incrementHttpRequestCount');
      return;
    }
    // We use a placeholder status code since the actual one isn't known yet
    // The actual status will be recorded by recordResponseTime when the request completes
    this.httpRequestCounter.labels(method, route, '0').inc();
  }
  
  // Record the response time directly 
  recordResponseTime(method, route, statusCode, timeMs) {
    if (!method || !route || !statusCode) {
      this.logger.warn('Invalid parameters for recordResponseTime');
      return;
    }
    
    // Convert milliseconds to seconds for the histogram
    const timeSeconds = timeMs / 1000;
    this.httpRequestDuration.labels(method, route, statusCode.toString()).observe(timeSeconds);
    
    // Also increment the counter with the actual status code
    this.httpRequestCounter.labels(method, route, statusCode.toString()).inc();
  }
  
  // Record operation success/failure
  recordOperation(operation, success) {
    this.retryCounter.labels(operation, success ? 'true' : 'false').inc();
  }
  
  // Increment error counter
  incrementErrorCount(method, route, errorMessage) {
    this.logger.debug(`Recording error for ${method} ${route}: ${errorMessage}`);
    // Could add a specific error counter here if needed
  }
  
  // API to track service health
  setServiceHealth(service, status) {
    let value = 0;
    switch(status) {
      case 'ok':
        value = 1;
        break;
      case 'warning':
      case 'degraded':
        value = 0.5;
        break;
      case 'error':
      case 'critical':
        value = 0;
        break;
    }
    this.serviceHealthGauge.labels(service).set(value);
  }
  
  // API to track circuit breaker state
  setCircuitBreakerState(circuit, state) {
    let value = 0;
    switch(state) {
      case 'CLOSED':
        value = 1;
        break;
      case 'HALF_OPEN':
        value = 0.5;
        break;
      case 'OPEN':
        value = 0;
        break;
    }
    this.circuitBreakerGauge.labels(circuit).set(value);
  }
  
  // API to track retry attempts
  recordRetry(operation, success) {
    this.retryCounter.labels(operation, success ? 'true' : 'false').inc();
  }
  
  // API to track recovery attempts
  recordRecovery(service, success) {
    this.recoveryCounter.labels(service, success ? 'true' : 'false').inc();
  }
  
  // API to measure API call duration
  measureApiCall(api, endpoint, func) {
    const end = this.apiDurationHistogram.labels(api, endpoint).startTimer();
    return Promise.resolve().then(func).finally(end);
  }
  
  // Get the metrics endpoint handler
  getMetricsHandler() {
    return async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        this.logger.error(`Error generating metrics: ${err.message}`);
        res.status(500).send('Error generating metrics');
      }
    };
  }
}

// Create and export a singleton instance
const metricsService = new PrometheusMetricsService();
module.exports = metricsService;
