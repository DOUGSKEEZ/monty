// /home/monty/monty/backend/src/middleware/metricsMiddleware.js
const prometheusMetrics = require('../services/PrometheusMetricsService');

function metricsMiddleware(req, res, next) {
  // Record start time
  const startTime = process.hrtime();
  
  // Once the response is finished
  res.on('finish', () => {
    // Calculate duration
    const hrDuration = process.hrtime(startTime);
    const durationInSeconds = hrDuration[0] + (hrDuration[1] / 1e9);
    
    // Record metrics
    prometheusMetrics.observeHttpRequest(req, res, durationInSeconds);
  });
  
  next();
}

module.exports = metricsMiddleware;
