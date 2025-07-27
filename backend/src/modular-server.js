const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const http = require('http');
const process = require('process');
const config = require('./utils/config');
const serviceRegistry = require('./services/ServiceRegistry');
const retryHelper = require('./utils/RetryHelper');
const prometheusMetrics = require('./services/PrometheusMetricsService');
const metricsMiddleware = require('./middleware/metricsMiddleware');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure retry settings (can be loaded from config)
const RETRY_CONFIG = {
  maxRetries: config.get('server.retries.maxRetries', 3),
  initialDelay: config.get('server.retries.initialDelay', 1000),
  backoffFactor: config.get('server.retries.backoffFactor', 2),
  enabled: config.get('server.retries.enabled', true)
};

// Apply retry configuration
retryHelper.maxRetries = RETRY_CONFIG.maxRetries;
retryHelper.initialDelay = RETRY_CONFIG.initialDelay;
retryHelper.backoffFactor = RETRY_CONFIG.backoffFactor;
retryHelper.enabled = RETRY_CONFIG.enabled;

console.log(`[${new Date().toISOString()}] Starting modular server initialization...`);
logger.info('Starting modular server initialization...');
logger.info(`Retry configuration: ${JSON.stringify(RETRY_CONFIG)}`);

// Register core services
serviceRegistry.register('config', { isCore: true });
serviceRegistry.setStatus('config', config.isLoaded() ? 'ready' : 'error');

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.10.15:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(logger.httpLogger); // Add HTTP request logging
app.use(metricsMiddleware);

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
}

// Add the metrics endpoint (typically before other routes)
app.get('/metrics', prometheusMetrics.getMetricsHandler());

// Track initialized services
let initializedServices = {
  routes: {},
  services: {}
};

// Enhanced health endpoint that uses the service registry
app.get('/api/health', async (req, res) => {
  const fullCheck = req.query.full === 'true';
  
  // If full check requested, check all services first
  if (fullCheck) {
    await serviceRegistry.checkAllServices();
  }
  
  const health = serviceRegistry.getSystemHealth();
  
  // Get retry statistics
  const retryStats = retryHelper.getRetryStats();
  
  const healthStatus = {
    status: health.status,
    message: getStatusMessage(health.status),
    time: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    components: {
      config: config.isLoaded() ? 'ok' : 'error'
    },
    services: {
      total: health.services.total,
      ready: health.services.byStatus.ready,
      warning: health.services.byStatus.warning,
      error: health.services.byStatus.error,
      initializing: health.services.byStatus.initializing + health.services.byStatus.pending
    },
    retry: {
      enabled: retryHelper.enabled,
      operations: retryStats.operations,
      totalRetries: retryStats.totalRetries,
      successful: retryStats.successful,
      failed: retryStats.failed,
      criticalFailed: retryStats.criticalFailed
    }
  };
  
  // Include detailed service information for full checks
  if (fullCheck) {
    healthStatus.serviceDetails = serviceRegistry.getDetailedStatus();
    healthStatus.retryDetails = retryStats.details;
  }
  
  res.status(health.status === 'critical' ? 500 : 200).json(healthStatus);
});

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

// Debug endpoint to help with troubleshooting
app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug endpoint',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    initializedServices: initializedServices,
    retrySettings: {
      enabled: retryHelper.enabled,
      maxRetries: retryHelper.maxRetries,
      initialDelay: retryHelper.initialDelay,
      backoffFactor: retryHelper.backoffFactor
    },
    retryStats: retryHelper.getRetryStats(),
    serviceRegistry: {
      services: Object.keys(serviceRegistry.services),
      health: serviceRegistry.getSystemHealth()
    }
  });
});

// Service status dashboard (HTML)
app.get('/api/dashboard', (req, res) => {
  const health = serviceRegistry.getSystemHealth();
  const services = serviceRegistry.getDetailedStatus();
  const retryStats = retryHelper.getRetryStats();
  
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
        .status.ok { background: green; }
        .status.warning { background: orange; }
        .status.degraded { background: orange; }
        .status.critical, .status.error { background: red; }
        .status.pending, .status.initializing { background: blue; }
        .service { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .auto-refresh { float: right; }
        .retry-info { margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Monty Service Status <span class="status ${health.status}"></span></h1>
        <p>Status: ${health.status} - ${getStatusMessage(health.status)}</p>
        <p>Uptime: ${formatUptime(health.uptime)}</p>
        <p>Last Updated: ${new Date(health.lastUpdate).toLocaleString()}</p>
        <div class="auto-refresh">
          <input type="checkbox" id="auto-refresh"> Auto-refresh (10s)
        </div>
      </div>
      
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
          <td>${health.services.total}</td>
          <td>${health.services.byStatus.ready}</td>
          <td>${health.services.byStatus.warning}</td>
          <td>${health.services.byStatus.error}</td>
          <td>${health.services.byStatus.pending + health.services.byStatus.initializing}</td>
        </tr>
        <tr>
          <td>Core Services</td>
          <td>${health.coreServices.total}</td>
          <td>${health.coreServices.byStatus.ready}</td>
          <td>${health.coreServices.byStatus.warning}</td>
          <td>${health.coreServices.byStatus.error}</td>
          <td>${health.coreServices.byStatus.pending + health.coreServices.byStatus.initializing}</td>
        </tr>
      </table>
      
      <div class="retry-info">
        <h2>Retry Information</h2>
        <p>Retry Enabled: <strong>${retryHelper.enabled ? 'Yes' : 'No'}</strong></p>
        <p>Max Retries: ${retryHelper.maxRetries}</p>
        <p>Initial Delay: ${retryHelper.initialDelay}ms</p>
        <p>Backoff Factor: ${retryHelper.backoffFactor}x</p>
        <p>Total Operations: ${retryStats.operations}</p>
        <p>Total Retries: ${retryStats.totalRetries}</p>
        <p>Successful Operations: ${retryStats.successful}</p>
        <p>Failed Operations: ${retryStats.failed}</p>
        <p>Critical Failures: ${retryStats.criticalFailed}</p>
      </div>
      
      <h2>Service Details</h2>
  `;
  
  // Add service detail cards
  for (const [name, service] of Object.entries(services)) {
    html += `
      <div class="service">
        <h3>${name} <span class="status ${service.status}"></span></h3>
        <p><strong>Status:</strong> ${service.status}${service.lastError ? ` - ${service.lastError}` : ''}</p>
        <p><strong>Type:</strong> ${service.isCore ? 'Core' : 'Optional'}</p>
        <p><strong>Uptime:</strong> ${service.uptime ? formatUptime(service.uptime) : 'Not started'}</p>
        <p><strong>Metrics:</strong> Success: ${service.metrics.successCount}, Errors: ${service.metrics.errorCount}</p>
        <p><strong>Avg Response:</strong> ${service.metrics.avgResponseTime ? `${service.metrics.avgResponseTime.toFixed(2)}ms` : 'N/A'}</p>
        
        ${retryStats.details[name] ? `
        <p><strong>Retry Attempts:</strong> ${retryStats.details[name].attempts}</p>
        <p><strong>Avg Retries:</strong> ${retryStats.details[name].avgRetries}</p>
        <p><strong>Last Error:</strong> ${retryStats.details[name].lastError || 'None'}</p>
        ` : ''}
      </div>
    `;
  }
  
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

function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// Error handling middleware
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
const server = http.createServer(app);

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

// Initialize services in sequence with timeout handling
async function initializeServices() {
  try {
    console.log(`[${new Date().toISOString()}] Starting service initialization...`);
    
    // Import and initialize routes
    await initializeRoutes();
    
    console.log(`[${new Date().toISOString()}] All services initialized successfully`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR initializing services: ${error.message}`);
    logger.error(`Error initializing services: ${error.message}`);
    return false;
  }
}

// Initialize routes with proper error handling and non-blocking behavior
async function initializeRoutes() {
  console.log(`[${new Date().toISOString()}] Importing route modules...`);
  
  // Register logger service
  serviceRegistry.register('logger', { isCore: true });
  serviceRegistry.setStatus('logger', 'ready');
  
  // Import routes with retry
  await initializeConfigRoutes();
  await initializeShadeRoutes();
  await initializeWeatherRoutes();
  await initializeMusicRoutes();
  await initializeSchedulerService();
  
  // Register application status
  serviceRegistry.register('application', { 
    isCore: true,
    checkHealth: async () => {
      const memoryUsage = process.memoryUsage();
      const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      let status = 'ok';
      let message = 'Application running normally';
      
      if (heapUsedPercentage > 90) {
        status = 'warning';
        message = `High memory usage: ${heapUsedPercentage.toFixed(1)}% of heap used`;
      }
      
      return { 
        status,
        message,
        details: {
          memoryUsage,
          heapUsedPercentage: heapUsedPercentage.toFixed(1) + '%',
          uptime: process.uptime()
        }
      };
    }
  });
  serviceRegistry.setStatus('application', 'ready');
  
  // Catch-all route for client-side routing (production only)
  if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
    });
  }
  
  console.log(`[${new Date().toISOString()}] All routes registered successfully`);
}

// Initialize config routes with retry
async function initializeConfigRoutes() {
  return retryHelper.retryOperation(
    async () => {
      try {
        const configRoutes = require('./routes/config');
        serviceRegistry.register('config-routes', { isCore: true });
        serviceRegistry.setStatus('config-routes', 'initializing');
        app.use('/api/config', configRoutes);
        initializedServices.routes.config = true;
        serviceRegistry.setStatus('config-routes', 'ready');
        return true;
      } catch (error) {
        logger.error(`Error loading config routes: ${error.message}`);
        serviceRegistry.register('config-routes', { isCore: true });
        serviceRegistry.setStatus('config-routes', 'error', error.message);
        initializedServices.routes.config = false;
        throw error;
      }
    },
    {
      operationName: 'config-routes-init',
      isCritical: true,
      onRetry: (attempt, delay, error) => {
        serviceRegistry.setStatus('config-routes', 'initializing', 
          `Retry ${attempt} after ${error.message}`);
      }
    }
  );
}

// Initialize shade routes with retry
async function initializeShadeRoutes() {
  return retryHelper.retryOperation(
    async () => {
      try {
        const shadeRoutes = require('./routes/shades');
        serviceRegistry.register('shade-routes', { isCore: false });
        serviceRegistry.setStatus('shade-routes', 'initializing');
        app.use('/api/shades', shadeRoutes);
        initializedServices.routes.shades = true;
        serviceRegistry.setStatus('shade-routes', 'ready');
        return true;
      } catch (error) {
        logger.error(`Error loading shade routes: ${error.message}`);
        serviceRegistry.register('shade-routes', { isCore: false });
        serviceRegistry.setStatus('shade-routes', 'error', error.message);
        initializedServices.routes.shades = false;
        throw error;
      }
    },
    {
      operationName: 'shade-routes-init',
      isCritical: false,
      onRetry: (attempt, delay, error) => {
        serviceRegistry.setStatus('shade-routes', 'initializing', 
          `Retry ${attempt} after ${error.message}`);
      }
    }
  );
}

// Initialize weather routes with retry
async function initializeWeatherRoutes() {
  console.log(`[${new Date().toISOString()}] Loading weather routes...`);
  
  return retryHelper.retryOperation(
    async () => {
      try {
        const weatherRoutes = require('./routes/weather');
        serviceRegistry.register('weather-routes', { isCore: false });
        serviceRegistry.setStatus('weather-routes', 'initializing');
        app.use('/api/weather', weatherRoutes);
        initializedServices.routes.weather = true;
        serviceRegistry.setStatus('weather-routes', 'ready');
        return true;
      } catch (error) {
        logger.error(`Error initializing weather routes: ${error.message}`);
        serviceRegistry.register('weather-routes', { isCore: false });
        serviceRegistry.setStatus('weather-routes', 'error', error.message);
        initializedServices.routes.weather = false;
        throw error;
      }
    },
    {
      operationName: 'weather-routes-init',
      isCritical: false,
      maxRetries: 2, // Custom retry count for this service
      onRetry: (attempt, delay, error) => {
        serviceRegistry.setStatus('weather-routes', 'initializing', 
          `Retry ${attempt} after ${error.message}`);
      }
    }
  );
}

// Initialize music routes with retry
async function initializeMusicRoutes() {
  console.log(`[${new Date().toISOString()}] Registering music routes...`);
  
  return retryHelper.retryOperation(
    async () => {
      try {
        const musicRoutes = require('./routes/music');
        serviceRegistry.register('music-routes', { isCore: false });
        serviceRegistry.setStatus('music-routes', 'initializing');
        app.use('/api/music', musicRoutes);
        initializedServices.routes.music = true;
        serviceRegistry.setStatus('music-routes', 'ready');
        return true;
      } catch (error) {
        logger.error(`Error initializing music routes: ${error.message}`);
        serviceRegistry.register('music-routes', { isCore: false });
        serviceRegistry.setStatus('music-routes', 'error', error.message);
        initializedServices.routes.music = false;
        throw error;
      }
    },
    {
      operationName: 'music-routes-init',
      isCritical: false,
      // Use a custom shouldRetry function - some errors are not retryable
      shouldRetry: (error) => {
        // Don't retry syntax errors as they won't be fixed by retrying
        if (error instanceof SyntaxError) {
          logger.warn('Not retrying music routes due to syntax error');
          return false;
        }
        return true;
      },
      onRetry: (attempt, delay, error) => {
        serviceRegistry.setStatus('music-routes', 'initializing', 
          `Retry ${attempt} after ${error.message}`);
      }
    }
  );
}

// Initialize scheduler service with retry
async function initializeSchedulerService() {
  console.log(`[${new Date().toISOString()}] Setting up fixed scheduler service...`);
  
  // First initialize scheduler routes
  await retryHelper.retryOperation(
    async () => {
      try {
        const schedulerRoutes = require('./routes/scheduler');
        serviceRegistry.register('scheduler-routes', { isCore: false });
        serviceRegistry.setStatus('scheduler-routes', 'initializing');
        app.use('/api/scheduler', schedulerRoutes);
        initializedServices.routes.scheduler = true;
        serviceRegistry.setStatus('scheduler-routes', 'ready');
        return true;
      } catch (error) {
        logger.error(`Error loading scheduler routes: ${error.message}`);
        serviceRegistry.register('scheduler-routes', { isCore: false });
        serviceRegistry.setStatus('scheduler-routes', 'error', error.message);
        initializedServices.routes.scheduler = false;
        throw error;
      }
    },
    {
      operationName: 'scheduler-routes-init',
      isCritical: false,
      onRetry: (attempt, delay, error) => {
        serviceRegistry.setStatus('scheduler-routes', 'initializing', 
          `Retry ${attempt} after ${error.message}`);
      }
    }
  );
  
  // Import the fixed scheduler service
  serviceRegistry.register('scheduler-service', { 
    isCore: false,
    checkHealth: async () => {
      try {
        const schedulerService = require('./services/schedulerService.fixed');
        return { 
          status: schedulerService.isInitialized() ? 'ok' : 'initializing',
          message: schedulerService.isInitialized() ? 'Scheduler initialized' : 'Scheduler initializing'
        };
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    }
  });
  serviceRegistry.setStatus('scheduler-service', 'initializing');
  
  // Initialize the scheduler after server startup with retries
  setTimeout(() => {
    retryHelper.retryOperation(
      async () => {
        try {
          const schedulerService = require('./services/schedulerService.fixed');
          await schedulerService.initialize();
          logger.info('Scheduler service initialized successfully');
          serviceRegistry.setStatus('scheduler-service', 'ready');
          initializedServices.services.scheduler = true;
          return true;
        } catch (error) {
          logger.error(`Failed to initialize scheduler service: ${error.message}`);
          serviceRegistry.setStatus('scheduler-service', 'error', error.message);
          initializedServices.services.scheduler = false;
          throw error;
        }
      },
      {
        operationName: 'scheduler-service-init',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 2000, // Longer initial delay for this service
        backoffFactor: 3,   // Steeper backoff for complex service
        onRetry: (attempt, delay, error) => {
          serviceRegistry.setStatus('scheduler-service', 'initializing', 
            `Retry ${attempt} after ${error.message}`);
        }
      }
    ).catch(err => {
      logger.error(`All retry attempts failed for scheduler service: ${err.message}`);
      serviceRegistry.setStatus('scheduler-service', 'error', 
        `Failed after ${retryHelper.maxRetries} retries: ${err.message}`);
    });
  }, 5000); // Initial delay before first attempt
  
  console.log(`[${new Date().toISOString()}] Registered scheduler routes, delayed service initialization`);
}

// Start the server
console.log(`[${new Date().toISOString()}] Attempting to start server on port ${PORT}...`);
logger.info(`Attempting to start server on port ${PORT}...`);

// Start server first, then initialize services
server.listen(PORT, '0.0.0.0', async (err) => {
  if (err) {
    logger.error(`Failed to start server: ${err.message}`);
    console.error(`[${new Date().toISOString()}] ERROR: ${err.message}`);
    process.exit(1);
  } else {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`[${new Date().toISOString()}] Server started on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] API available at: http://localhost:${PORT}/api/health`);
    
    // Initialize services after server is listening
    // Do this in the background to avoid blocking
    initializeServices().then(success => {
      if (success) {
        logger.info('Server initialization complete');
        serviceRegistry.setStatus('application', 'ready', 'Server fully initialized');
      } else {
        logger.warn('Server initialization completed with errors');
        serviceRegistry.setStatus('application', 'warning', 'Server initialized with some errors');
      }
    });
  }
});

// Export the server for testing
module.exports = server;