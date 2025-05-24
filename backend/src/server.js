console.log('[DEBUG] Loading modules...');

const prometheusMetrics = require("./services/PrometheusMetricsService");
console.log('[DEBUG] Loaded PrometheusMetricsService');

const metricsMiddleware = require("./middleware/metricsMiddleware");
console.log('[DEBUG] Loaded metricsMiddleware');

const express = require('express');
console.log('[DEBUG] Loaded express');

const cors = require('cors');
console.log('[DEBUG] Loaded cors');

const bodyParser = require('body-parser');
console.log('[DEBUG] Loaded bodyParser');

const path = require('path');
console.log('[DEBUG] Loaded path');

const dotenv = require('dotenv');
console.log('[DEBUG] Loaded dotenv');

const logger = require('./utils/logger');
console.log('[DEBUG] Loaded logger');

const http = require('http');
console.log('[DEBUG] Loaded http');

const process = require('process');
console.log('[DEBUG] Loaded process');

const config = require('./utils/config');
console.log('[DEBUG] Loaded config');

const serviceRegistry = require('./utils/ServiceRegistry');
console.log('[DEBUG] Loaded serviceRegistry');

const CircuitBreaker = require('./utils/CircuitBreaker');
console.log('[DEBUG] Loaded CircuitBreaker');

const serviceWatchdog = require('./utils/ServiceWatchdog');
console.log('[DEBUG] Loaded serviceWatchdog');

const RetryHelper = require('./utils/RetryHelper');
console.log('[DEBUG] Loaded RetryHelper');

console.log('[DEBUG] About to load PianobarWebsocketIntegration...');
const { initializePianobarWebsocket } = require('./services/PianobarWebsocketIntegration');
console.log('[DEBUG] Loaded PianobarWebsocketIntegration');

console.log('[DEBUG] About to load PianobarCommandInterface...');
const { createPianobarCommandInterface } = require('./services/PianobarCommandInterface');
console.log('[DEBUG] Loaded PianobarCommandInterface');

// Load environment variables
console.log('[DEBUG] About to load environment variables...');
dotenv.config();
console.log('[DEBUG] Environment variables loaded');

// Initialize Express app
console.log('[DEBUG] Creating Express app...');
const app = express();
const PORT = process.env.PORT || 3001;
console.log(`[DEBUG] PORT set to ${PORT}`);

// Middleware
console.log('[DEBUG] Setting up middleware...');

// Configure CORS - Allow specific origins
console.log('[DEBUG] Configuring CORS...');
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.0.15:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
console.log('[DEBUG] CORS configured');

console.log('[DEBUG] Setting up bodyParser...');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
console.log('[DEBUG] bodyParser configured');

console.log('[DEBUG] Setting up HTTP logger...');
app.use(logger.httpLogger); // Add HTTP request logging
console.log('[DEBUG] HTTP logger configured');

console.log('[DEBUG] Setting up metrics middleware...');
app.use(metricsMiddleware); // Add metrics middleware
console.log('[DEBUG] Metrics middleware configured');

// Add request logger for debugging
app.use((req, res, next) => {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Add a better error handler for debugging
process.on('uncaughtException', (err) => {
  console.error(`UNCAUGHT EXCEPTION: ${err.message}`);
  console.error(err.stack);
  logger.error(`Uncaught exception: ${err.message}`);
  logger.error(err.stack);
  
  // Don't exit, just log
});

// Serve static files from frontend build in production or frontend/public in development
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
} else {
  // In development, serve files from frontend/public for testing
  app.use(express.static(path.join(__dirname, '../../frontend/public')));
  console.log('[DEBUG] Serving static files from frontend/public in development mode');
}

// Add metrics endpoint
app.get('/metrics', prometheusMetrics.getMetricsHandler());

// Import routes
console.log('[DEBUG] Importing routes...');

console.log('[DEBUG] About to require configRoutes...');
const configRoutes = require('./routes/config');
console.log('[DEBUG] configRoutes imported');

console.log('[DEBUG] About to require shadeRoutes...');
const shadeRoutes = require('./routes/shades');
console.log('[DEBUG] shadeRoutes imported');

console.log('[DEBUG] About to require weatherRoutes...');
const weatherRoutes = require('./routes/weather');
console.log('[DEBUG] weatherRoutes imported');

console.log('[DEBUG] About to require schedulerRoutes...');
const schedulerRoutes = require('./routes/scheduler');
console.log('[DEBUG] schedulerRoutes imported');

console.log('[DEBUG] About to require musicRoutes...');
const musicRoutes = require('./routes/music');
console.log('[DEBUG] musicRoutes imported');

console.log('[DEBUG] About to require bluetoothRoutes...');
const bluetoothRoutes = require('./routes/bluetooth');
console.log('[DEBUG] bluetoothRoutes imported');

console.log('[DEBUG] About to require pianobarRoutes - THIS MIGHT BE THE PROBLEM...');
const pianobarRoutes = require('./routes/pianobar');
console.log('[DEBUG] pianobarRoutes imported successfully!');

console.log('[DEBUG] About to require stateRoutes...');
const stateRoutes = require('./routes/state');
console.log('[DEBUG] stateRoutes imported');

// API Routes
app.get('/api/health', async (req, res) => {
  // Enhanced health check that verifies key system components
  const fullCheck = req.query.full === 'true';
  
  // Get service health information
  let services = {};
  let systemHealth = { status: 'ok' };
  
  try {
    // Always check services for the health endpoint
    if (serviceRegistry.checkAllServices) {
      systemHealth = await serviceRegistry.checkAllServices();
    }
    
    // Get detailed service information
    if (serviceRegistry.getDetailedStatus) {
      services = serviceRegistry.getDetailedStatus();
    }
  } catch (error) {
    logger.warn(`Error getting service health: ${error.message}`);
  }
  
  const healthStatus = {
    status: systemHealth.status || 'ok',
    message: getHealthMessage(systemHealth.status || 'ok'),
    time: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    components: {
      config: config.isLoaded() ? 'ok' : 'error',
      services: systemHealth.status || 'ok'
    }
  };
  
  // Include detailed service information for full checks
  if (fullCheck && Object.keys(services).length > 0) {
    healthStatus.services = services;
  }

  res.json(healthStatus);
});

// Helper function to get health status message
function getHealthMessage(status) {
  switch (status) {
    case 'ok':
      return 'Monty server is running normally';
    case 'warning':
      return 'Monty server is running with warnings';
    case 'degraded':
      return 'Monty server is running in degraded state';
    case 'critical':
      return 'Monty server has critical errors';
    default:
      return 'Monty server is running';
  }
}

// Service status dashboard (HTML)
app.get('/api/dashboard', (req, res) => {
  // Get service health and status information
  let serviceHealth = { status: 'ok', services: { byStatus: { ready: 0, warning: 0, error: 0, initializing: 0, pending: 0 } } };
  let serviceDetails = {};
  let retryStats = { operations: 0, totalRetries: 0, successful: 0, failed: 0, criticalFailed: 0, details: {} };
  let circuitBreakerStats = {};
  let recoveryStats = null;
  
  try {
    // Try to get system health if available
    if (serviceRegistry.getSystemHealth) {
      serviceHealth = serviceRegistry.getSystemHealth();
    }
    
    // Try to get detailed service status if available
    if (serviceRegistry.getDetailedStatus) {
      serviceDetails = serviceRegistry.getDetailedStatus();
    }
    
    // Try to get retry statistics if RetryHelper is available
    try {
      const RetryHelper = require('./utils/RetryHelper');
      if (RetryHelper && RetryHelper.getRetryStats) {
        retryStats = RetryHelper.getRetryStats();
      }
    } catch (error) {
      console.warn(`Could not load retry stats: ${error.message}`);
    }
    
    // Try to get service watchdog recovery statistics if available
    if (serviceWatchdog && serviceWatchdog.getRecoveryStats) {
      recoveryStats = serviceWatchdog.getRecoveryStats();
    }
  } catch (error) {
    console.error(`Error gathering dashboard data: ${error.message}`);
  }
  
  // Helper function to get status message
  function getStatusMessage(status) {
    switch (status) {
      case 'ok':
        return 'All systems operational';
      case 'warning':
        return 'System operational with warnings';
      case 'degraded':
        return 'System operational in degraded state';
      case 'critical':
        return 'Critical system failure';
      default:
        return 'System status unknown';
    }
  }
  
  // Helper function to format uptime
  function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  }
  
  // Simple HTML dashboard
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Monty Service Status</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { background: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .status { display: inline-block; width: 15px; height: 15px; border-radius: 50%; margin-right: 5px; }
        .status.ok, .status.ready { background: green; }
        .status.warning, .status.degraded { background: orange; }
        .status.critical, .status.error { background: red; }
        .status.pending, .status.initializing { background: blue; }
        .service { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .auto-refresh { float: right; }
        .retry-info, .recovery-info, .circuit-info { margin-top: 20px; }
        .section { margin-bottom: 30px; }
        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Monty Service Status <span class="status ${serviceHealth.status}"></span></h1>
        <p>Status: ${serviceHealth.status} - ${getStatusMessage(serviceHealth.status)}</p>
        <p>Uptime: ${formatUptime(process.uptime())}</p>
        <p>Last Updated: ${new Date().toLocaleString()}</p>
        <div class="auto-refresh">
          <input type="checkbox" id="auto-refresh"> Auto-refresh (10s)
        </div>
      </div>
  `;
  
  // Add service summary section if available
  if (serviceHealth && serviceHealth.services) {
    html += `
      <div class="section">
        <h2>Service Summary</h2>
        <table>
          <tr>
            <th>Category</th>
            <th>Total</th>
            <th>Ready</th>
            <th>Warning</th>
            <th>Error</th>
            <th>Initializing</th>
          </tr>
          <tr>
            <td>All Services</td>
            <td>${serviceHealth.services.total || 0}</td>
            <td>${serviceHealth.services.byStatus.ready || 0}</td>
            <td>${serviceHealth.services.byStatus.warning || 0}</td>
            <td>${serviceHealth.services.byStatus.error || 0}</td>
            <td>${(serviceHealth.services.byStatus.pending || 0) + (serviceHealth.services.byStatus.initializing || 0)}</td>
          </tr>
    `;
    
    // Add core services row if available
    if (serviceHealth.coreServices) {
      html += `
          <tr>
            <td>Core Services</td>
            <td>${serviceHealth.coreServices.total || 0}</td>
            <td>${serviceHealth.coreServices.byStatus.ready || 0}</td>
            <td>${serviceHealth.coreServices.byStatus.warning || 0}</td>
            <td>${serviceHealth.coreServices.byStatus.error || 0}</td>
            <td>${(serviceHealth.coreServices.byStatus.pending || 0) + (serviceHealth.coreServices.byStatus.initializing || 0)}</td>
          </tr>
      `;
    }
    
    html += `
        </table>
      </div>
    `;
  }
  
  // Add retry information section if available
  if (retryStats) {
    html += `
      <div class="section retry-info">
        <h2>Retry Information</h2>
        <p>Retry Enabled: <strong>${retryStats.enabled ? 'Yes' : 'No'}</strong></p>
        <p>Total Operations: ${retryStats.operations}</p>
        <p>Total Retries: ${retryStats.totalRetries}</p>
        <p>Successful Operations: ${retryStats.successful}</p>
        <p>Failed Operations: ${retryStats.failed}</p>
        <p>Critical Failures: ${retryStats.criticalFailed}</p>
      </div>
    `;
  }
  
  // Add recovery information if available
  if (recoveryStats) {
    html += `
      <div class="section recovery-info">
        <h2>Self-Healing Recovery</h2>
        <p>Total Recovery Attempts: ${recoveryStats.overall.totalAttempts}</p>
        <p>Successful Recoveries: ${recoveryStats.overall.successful}</p>
        <p>Failed Recoveries: ${recoveryStats.overall.failed}</p>
        <p>Success Rate: ${recoveryStats.overall.successRate}%</p>
        
        <h3>Service-specific Recovery Stats</h3>
        <div class="dashboard-grid">
    `;
    
    // Add recovery stats for each service
    for (const [serviceName, stats] of Object.entries(recoveryStats.services)) {
      if (stats.attempts > 0) {
        html += `
          <div class="service">
            <h4>${serviceName}</h4>
            <p>Attempts: ${stats.attempts}</p>
            <p>Success Rate: ${stats.successRate}%</p>
            <p>Last Attempt: ${stats.lastAttempt ? new Date(stats.lastAttempt).toLocaleString() : 'N/A'}</p>
            <p>Last Result: ${stats.lastResult || 'N/A'}</p>
          </div>
        `;
      }
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  // Add detailed service information
  html += `
    <div class="section">
      <h2>Service Details</h2>
      <div class="dashboard-grid">
  `;
  
  // Add service detail cards
  for (const [name, service] of Object.entries(serviceDetails)) {
    html += `
      <div class="service">
        <h3>${name} <span class="status ${service.status}"></span></h3>
        <p><strong>Status:</strong> ${service.status}${service.lastError ? ` - ${service.lastError}` : ''}</p>
        <p><strong>Type:</strong> ${service.isCore ? 'Core' : 'Optional'}</p>
        <p><strong>Uptime:</strong> ${service.uptime ? formatUptime(service.uptime) : 'Not started'}</p>
    `;
    
    if (service.metrics) {
      html += `
        <p><strong>Metrics:</strong> Success: ${service.metrics.successCount || 0}, Errors: ${service.metrics.errorCount || 0}</p>
        <p><strong>Avg Response:</strong> ${service.metrics.avgResponseTime ? `${service.metrics.avgResponseTime.toFixed(2)}ms` : 'N/A'}</p>
      `;
    }
    
    if (retryStats && retryStats.details && retryStats.details[name]) {
      html += `
        <p><strong>Retry Attempts:</strong> ${retryStats.details[name].attempts}</p>
        <p><strong>Avg Retries:</strong> ${retryStats.details[name].avgRetries}</p>
        <p><strong>Last Error:</strong> ${retryStats.details[name].lastError || 'None'}</p>
      `;
    }
    
    html += `
      </div>
    `;
  }
  
  html += `
      </div>
    </div>
  `;
  
  // Add auto-refresh script
  html += `
    <script>
      let autoRefresh = false;
      let refreshTimer;
      
      document.getElementById('auto-refresh').addEventListener('change', function() {
        autoRefresh = this.checked;
        if (autoRefresh) {
          refreshTimer = setTimeout(() => location.reload(), 10000);
        } else {
          clearTimeout(refreshTimer);
        }
      });
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Register services in the service registry
serviceRegistry.register('config', { 
  isCore: true,
  status: config.isLoaded() ? 'ready' : 'error',
  checkHealth: async () => {
    return { 
      status: config.isLoaded() ? 'ok' : 'error',
      message: config.isLoaded() ? 'Configuration loaded' : 'Failed to load configuration'
    };
  }
});

serviceRegistry.register('weather-service', {
  isCore: false,
  status: 'initializing',
  checkHealth: async () => {
    try {
      // Simple check to see if weather service is operational
      const weatherService = require('./services/weatherService');
      return { 
        status: weatherService.isInitialized ? 'ok' : 'initializing',
        message: weatherService.isInitialized ? 'Weather service initialized' : 'Weather service initializing'
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
});

serviceRegistry.register('scheduler-service', {
  isCore: false,
  status: 'initializing',
  checkHealth: async () => {
    try {
      // Simple check to see if scheduler service is operational
      const schedulerService = require('./services/schedulerService');
      return { 
        status: schedulerService.isInitialized ? 'ok' : 'initializing',
        message: schedulerService.isInitialized ? 'Scheduler service initialized' : 'Scheduler service initializing'
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
});

// Note: MusicService is now registered through the DI container in ServiceFactory.js

serviceRegistry.register('shade-service', {
  isCore: false,
  status: 'initializing',
  checkHealth: async () => {
    try {
      // Simple check to see if shade service is operational
      const shadeService = require('./services/shadeService');
      return { 
        status: shadeService.isInitialized ? 'ok' : 'initializing',
        message: shadeService.isInitialized ? 'Shade service initialized' : 'Shade service initializing'
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
});

// Run an initial health check after registering services
setTimeout(() => {
  serviceRegistry.checkAllServices()
    .then(() => {
      logger.info('Initial service health check completed');
    })
    .catch(err => {
      logger.error(`Error during initial health check: ${err.message}`);
    });
}, 5000);  // Wait 5 seconds for services to initialize

// Set up periodic health checks to keep dashboard data fresh
const HEALTH_CHECK_INTERVAL = 60 * 1000; // 60 seconds
setInterval(() => {
  serviceRegistry.checkAllServices()
    .then(() => {
      logger.debug('Periodic service health check completed');
    })
    .catch(err => {
      logger.error(`Error during periodic health check: ${err.message}`);
    });
}, HEALTH_CHECK_INTERVAL);

// Register API routes
app.use('/api/config', configRoutes);
app.use('/api/shades', shadeRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/bluetooth', bluetoothRoutes);
app.use('/api/pianobar', pianobarRoutes);
app.use('/api/state', stateRoutes);

// Catch-all route for client-side routing (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
  });
}

// Error handling middleware (should be defined after all routes)
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { error: err.stack });
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'An internal server error occurred' 
      : err.message
  });
});

// Create HTTP server
console.log('[DEBUG] About to create HTTP server...');
const server = http.createServer(app);
console.log('[DEBUG] HTTP server created successfully');

// Initialize Pianobar Command Interface - with additional debug logging
console.log('DEBUG: About to create pianobarRetryHelper');

// RetryHelper is exported as a singleton, not as a constructor
// So we use the singleton directly instead of trying to create a new instance
const pianobarRetryHelper = RetryHelper;
console.log('DEBUG: Using RetryHelper singleton');

// Create PianobarCommandInterface singleton with try/catch for every step
console.log('DEBUG: About to create PianobarCommandInterface');
try {
  // Create with initialization flag set to false
  const pianobarCommandInterface = createPianobarCommandInterface(
    {
      verbose: true, // Force verbose logging for debugging
      skipAsyncInit: true // Skip automatic async initialization
    },
    pianobarRetryHelper,
    null // Skip serviceWatchdog dependency for now
  );
  console.log('DEBUG: PianobarCommandInterface created successfully');
  
  // Don't initialize automatically - we'll do it explicitly later
  console.log('DEBUG: Skipping automatic initialization of PianobarCommandInterface');
} catch (error) {
  console.error(`ERROR creating PianobarCommandInterface: ${error.message}`);
  console.error(error.stack);
}

// Initialize WebSocket for real-time pianobar updates
console.log('[DEBUG] About to initialize WebSocket for pianobar updates');
setTimeout(() => {
  console.log('[DEBUG] In setTimeout callback for WebSocket initialization');
  initializePianobarWebsocket(server)
    .then(result => {
      console.log('[DEBUG] WebSocket initialization promise resolved');
      if (result.success) {
        logger.info('PianobarWebsocketService initialized successfully');
        console.log('[DEBUG] WebSocket initialization successful');
      } else {
        logger.warn(`PianobarWebsocketService initialization warning: ${result.message}`);
        console.log(`[DEBUG] WebSocket initialization warning: ${result.message}`);
      }
    })
    .catch(err => {
      logger.error(`Error initializing PianobarWebsocketService: ${err.message}`);
      console.error(`[ERROR] WebSocket initialization failed: ${err.message}`);
    });
}, 3000); // Delay by 3 seconds to allow server to start first

// Log that we're starting with both command interface and WebSocket
logger.info('Starting with PianobarCommandInterface and WebSocket support');

// Graceful shutdown handler
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Set a timeout for forceful shutdown if graceful shutdown takes too long
  const forceShutdownTimeout = setTimeout(() => {
    logger.error('Forceful shutdown triggered after timeout');
    process.exit(1);
  }, 30000); // 30 seconds timeout

  // Try to close the server gracefully
  server.close(() => {
    logger.info('HTTP server closed successfully');
    
    // Clear the force shutdown timeout
    clearTimeout(forceShutdownTimeout);
    
    // Perform any additional cleanup here
    // e.g., close database connections, etc.
    
    logger.info('Shutdown complete, exiting process');
    process.exit(0);
  });
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { error: err.stack });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled promise rejection at: ${promise}, reason: ${reason}`);
  // Don't exit for unhandled rejections, just log them
});

// FIXED SERVER STARTUP - bind to all interfaces rather than just localhost
console.log(`Attempting to start server on port ${PORT}...`);
logger.info(`Attempting to start server on port ${PORT}...`);

// Create a simple ping route to check if server is running
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Additional debug logging for server startup
console.log(`DEBUG: About to start server on port ${PORT}...`);

// Directly start the server without specifying host (which defaults to all interfaces)
// This is important because on some Linux configurations, 127.0.0.1 binding can be restrictive
try {
  console.log(`DEBUG: Calling server.listen(${PORT}, '0.0.0.0', ...)...`);
  server.listen(PORT, '0.0.0.0', (err) => {
    console.log(`DEBUG: Inside server.listen callback, err=${err}`);
    if (err) {
      logger.error(`Failed to start server: ${err.message}`);
      console.error(`ERROR: ${err.message}`);
    } else {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`Server accessible at http://localhost:${PORT}`);
      console.log(`Server started on port ${PORT} and listening on all interfaces`);
      console.log(`API available at: http://localhost:${PORT}/api/health`);
      console.log(`Ping test available at: http://localhost:${PORT}/ping`);
    }
  });
  
  console.log(`DEBUG: Server listen called on port ${PORT} - this message should appear immediately`);
  
  // Add a log message after a short delay to see if server.listen is hanging
  setTimeout(() => {
    console.log(`DEBUG: This message appears 2 seconds after starting the server - if you see this, server.listen is non-blocking`);
  }, 2000);
} catch (error) {
  console.error(`ERROR starting server: ${error.message}`);
  logger.error(`ERROR starting server: ${error.message}`);
  logger.error(error.stack);
}

// Export the server for testing
module.exports = server;
