// Multi-vendor metrics middleware that sends data to multiple monitoring platforms
const multiVendorMetrics = require('../services/MultiVendorMetricsService');
const prometheusMetrics = require('../services/PrometheusMetricsService');

function multiVendorMetricsMiddleware(req, res, next) {
  // Record start time
  const startTime = process.hrtime();
  const startMs = Date.now();
  
  // Once the response is finished
  res.on('finish', async () => {
    try {
      // Calculate duration
      const hrDuration = process.hrtime(startTime);
      const durationInSeconds = hrDuration[0] + (hrDuration[1] / 1e9);
      const durationInMs = Date.now() - startMs;
      
      // Get route info
      const route = req.route ? req.route.path : req.path;
      const method = req.method;
      const statusCode = res.statusCode;
      
      // Send to Prometheus (existing system)
      prometheusMetrics.observeHttpRequest(req, res, durationInSeconds);
      
      // Send to all multi-vendor monitoring platforms
      await multiVendorMetrics.recordHttpRequest(
        method,
        route,
        statusCode,
        durationInMs,
        {
          user_agent: req.get('User-Agent') || 'unknown',
          ip: req.ip || req.connection?.remoteAddress || 'unknown',
          response_size: res.get('Content-Length') || 0
        }
      );
      
      // Record business metrics for key endpoints
      if (route?.includes('/api/weather/')) {
        await multiVendorMetrics.recordBusinessMetric('weather_api_calls', 1, {
          endpoint: route,
          success: statusCode < 400
        });
      }
      
      if (route?.includes('/api/shades/')) {
        await multiVendorMetrics.recordBusinessMetric('shade_control_calls', 1, {
          endpoint: route,
          success: statusCode < 400
        });
      }
      
      if (route?.includes('/api/pianobar/')) {
        await multiVendorMetrics.recordBusinessMetric('music_control_calls', 1, {
          endpoint: route,
          success: statusCode < 400
        });
      }
      
      // Record errors as events
      if (statusCode >= 500) {
        await multiVendorMetrics.sendEvent(
          'HTTP Server Error',
          `${method} ${route} returned ${statusCode}`,
          {
            method,
            route,
            status_code: statusCode,
            duration_ms: durationInMs
          },
          'error'
        );
      }
      
    } catch (error) {
      console.error('Error in multiVendorMetricsMiddleware:', error);
      // Don't let metrics errors break the application
    }
  });
  
  next();
}

module.exports = multiVendorMetricsMiddleware;