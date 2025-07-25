require('./monitoring');  // Must be first line!

console.log('[DEBUG] Loading modules...');
// ... rest of server.js
const prometheusMetrics = require("./services/PrometheusMetricsService");
console.log('[DEBUG] Loaded PrometheusMetricsService');

const metricsMiddleware = require("./middleware/metricsMiddleware");
console.log('[DEBUG] Loaded metricsMiddleware');

const multiVendorMetricsMiddleware = require("./middleware/multiVendorMetricsMiddleware");
console.log('[DEBUG] Loaded multiVendorMetricsMiddleware');

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

const shadeCommanderMonitor = require('./services/ShadeCommanderMonitorService');
console.log('[DEBUG] Loaded ShadeCommanderMonitorService');

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
app.use(multiVendorMetricsMiddleware); // Add multi-vendor metrics middleware
console.log('[DEBUG] Metrics middleware configured');

// Add request logger for debugging (excluding map tiles) - disabled to reduce log noise
// app.use((req, res, next) => {
//   if (!req.url.includes('/api/weather/map-tile/')) {
//     console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
//   }
//   next();
// });

// Add a better error handler for debugging
process.on('uncaughtException', (err) => {
  console.error(`UNCAUGHT EXCEPTION: ${err.message}`);
  console.error(err.stack);
  logger.logger.error(`Uncaught exception: ${err.message}`);
  logger.logger.error(err.stack);
  
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

// Initialize ServiceFactory container before loading routes
console.log('[DEBUG] Initializing ServiceFactory...');
const { initializeContainer, createSchedulerService, createActualPianobarService } = require('./utils/ServiceFactory');
initializeContainer();
console.log('[DEBUG] ServiceFactory initialized');

// CRITICAL: Create and register PianobarService BEFORE WebSocket initialization
console.log('[DEBUG] Creating PianobarService at startup...');
try {
  const pianobarService = createActualPianobarService();
  
  // Initialize the service
  pianobarService.initialize()
    .then(result => {
      if (result.success) {
        console.log('[DEBUG] ✅ PianobarService initialized successfully at startup');
        logger.logger.info('PianobarService created and initialized at server startup');
      } else {
        console.log('[DEBUG] ⚠️ PianobarService initialization warning:', result.message);
        logger.logger.warn(`PianobarService initialization warning: ${result.message}`);
      }
    })
    .catch(err => {
      console.error('[DEBUG] ❌ PianobarService initialization failed:', err.message);
      logger.logger.error(`PianobarService initialization failed: ${err.message}`);
    });
    
  console.log('[DEBUG] ✅ PianobarService created and registered in ServiceRegistry');
} catch (error) {
  console.error('[DEBUG] ❌ Error creating PianobarService at startup:', error.message);
  logger.logger.error(`Error creating PianobarService at startup: ${error.message}`);
}

// Initialize SchedulerService explicitly after server starts
console.log('[DEBUG] SchedulerService initialization will be triggered after server startup...');

// Import routes
console.log('[DEBUG] Importing routes...');

console.log('[DEBUG] About to require configRoutes...');
const configRoutes = require('./routes/config');
console.log('[DEBUG] configRoutes imported');

// Shade routes removed - React now calls ShadeCommander:8000 directly

console.log('[DEBUG] About to require weatherRoutes...');
const weatherRoutes = require('./routes/weather');
console.log('[DEBUG] weatherRoutes imported');

console.log('[DEBUG] About to require schedulerRoutes...');
const schedulerRoutes = require('./routes/scheduler');
console.log('[DEBUG] schedulerRoutes imported');

// console.log('[DEBUG] About to require musicRoutes...');
// const musicRoutes = require('./routes/music'); // REMOVED: Legacy music service replaced by PianobarService
// console.log('[DEBUG] musicRoutes imported');

console.log('[DEBUG] About to require bluetoothRoutes...');
const bluetoothRoutes = require('./routes/bluetooth');
console.log('[DEBUG] bluetoothRoutes imported');

console.log('[DEBUG] About to require pianobarRoutes - THIS MIGHT BE THE PROBLEM...');
const pianobarRoutes = require('./routes/pianobar');
console.log('[DEBUG] pianobarRoutes imported successfully!');

console.log('[DEBUG] About to require stateRoutes...');
const stateRoutes = require('./routes/state');
console.log('[DEBUG] stateRoutes imported');

console.log('[DEBUG] About to require monitoringRoutes...');
const monitoringRoutes = require('./routes/monitoring');
console.log('[DEBUG] monitoringRoutes imported');

console.log('[DEBUG] About to require systemRoutes...');
const systemRoutes = require('./routes/system');
console.log('[DEBUG] systemRoutes imported');

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
    logger.logger.warn(`Error getting service health: ${error.message}`);
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
// In server.js, replace the entire app.get('/api/dashboard', ...) route
app.get('/api/dashboard', (req, res) => {
  // Initialize data variables
  let serviceHealth = { status: 'ok', services: { byStatus: { ready: 0, warning: 0, error: 0, initializing: 0, pending: 0 } } };
  let serviceDetails = {};
  let retryStats = { operations: 0, totalRetries: 0, successful: 0, failed: 0, criticalFailed: 0, details: {} };
  let recoveryStats = null;

  // Gather data
  try {
    if (serviceRegistry.getSystemHealth) {
      serviceHealth = serviceRegistry.getSystemHealth();
    }
    if (serviceRegistry.getDetailedStatus) {
      serviceDetails = serviceRegistry.getDetailedStatus();
      if (serviceDetails['shade-commander']) {
        logger.logger.info(`🔍 Dashboard serviceDetails for shade-commander: ${JSON.stringify(serviceDetails['shade-commander'])}`);
      }
      if (serviceDetails['SystemMetrics']) {
        logger.logger.info(`🔍 Dashboard serviceDetails for SystemMetrics: ${JSON.stringify(serviceDetails['SystemMetrics'])}`);
      }
    }
    try {
      const RetryHelper = require('./utils/RetryHelper');
      if (RetryHelper && RetryHelper.getRetryStats) {
        retryStats = RetryHelper.getRetryStats();
      }
    } catch (error) {
      console.warn(`Could not load retry stats: ${error.message}`);
    }
    if (serviceWatchdog && serviceWatchdog.getRecoveryStats) {
      recoveryStats = serviceWatchdog.getRecoveryStats();
    }
  } catch (error) {
    console.error(`Error gathering dashboard data: ${error.message}`);
  }

  // Helper functions
  function getStatusMessage(status) {
    switch (status) {
      case 'ok': return 'All systems operational';
      case 'warning': return 'System operational with warnings';
      case 'degraded': return 'System operational in degraded state';
      case 'critical': return 'Critical system failure';
      default: return 'System status unknown';
    }
  }

  function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  }

  // Initialize HTML
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

  // Service Summary
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
          ${serviceHealth.coreServices ? `
            <tr>
              <td>Core Services</td>
              <td>${serviceHealth.coreServices.total || 0}</td>
              <td>${serviceHealth.coreServices.byStatus.ready || 0}</td>
              <td>${serviceHealth.coreServices.byStatus.warning || 0}</td>
              <td>${serviceHealth.coreServices.byStatus.error || 0}</td>
              <td>${(serviceHealth.coreServices.byStatus.pending || 0) + (serviceHealth.coreServices.byStatus.initializing || 0)}</td>
            </tr>
          ` : ''}
        </table>
      </div>
    `;
  }

  // Retry Information
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

  // Recovery Information
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
          ${Object.entries(recoveryStats.services)
            .filter(([_, stats]) => stats.attempts > 0)
            .map(([serviceName, stats]) => `
              <div class="service">
                <h4>${serviceName}</h4>
                <p>Attempts: ${stats.attempts}</p>
                <p>Success Rate: ${stats.successRate}%</p>
                <p>Last Attempt: ${stats.lastAttempt ? new Date(stats.lastAttempt).toLocaleString() : 'N/A'}</p>
                <p>Last Result: ${stats.lastResult || 'N/A'}</p>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }

  // Service Details
  html += `
    <div class="section">
      <h2>Service Details</h2>
      <div class="dashboard-grid">
        ${Object.entries(serviceDetails).map(([name, service]) => `
          <div class="service">
            <h3>${name === 'shade-commander' ? 'ShadeCommander' : name === 'weather-api-usage' ? 'OpenWeather-API' : name} <span class="status ${service.status}"></span></h3>
            <p><strong>Status:</strong> ${service.status}${service.lastError ? ` - ${service.lastError}` : ''}</p>
            <p><strong>Type:</strong> ${service.isCore ? 'Core' : 'Optional'}</p>
            <p><strong>Uptime:</strong> ${service.uptime ? formatUptime(service.uptime) : 'Not started'}</p>
            ${service.metrics ? (
              name === 'shade-commander' ? `
                <p><strong>Arduino:</strong> ${service.metrics.arduinoConnected ? '🟢 Connected' : '🔴 Disconnected'} (${service.metrics.arduinoPort})</p>
                <p><strong>Active Tasks:</strong> ${service.metrics.activeTasks} background retries</p>
                <p><strong>Recent Cancellations:</strong> ${service.metrics.recentCancellations}</p>
                <p><strong>External Service:</strong> FastAPI on port 8000 (no internal metrics)</p>
                <p><button onclick="reconnectArduino()" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">🔌 Reconnect Arduino</button></p>
              ` : name === 'SystemMetrics' ? `
                <p><strong>CPU Usage:</strong> ${service.metrics.cpuUsage || 'N/A'}%</p>
                <p><strong>Temperature:</strong> ${service.metrics.temperature || 'N/A'} °C</p>
                <p><strong>Disk Usage:</strong> ${service.metrics.diskUsage || 'N/A'} of ${service.metrics.diskTotal || 'N/A'}</p>
                <p><strong>Processes:</strong> ${service.metrics.processes || 'N/A'}</p>
                <p><strong>Memory Usage:</strong> ${service.metrics.memoryUsage || 'N/A'}</p>
              ` : name === 'weather-api-usage' ? `
                <p><strong>${service.metrics.usageDisplay || 'N/A'}</strong></p>
                <p style="color: ${service.metrics.usageColor || 'gray'}"><strong>${service.metrics.statusDisplay || 'N/A'}</strong></p>
                <p><strong>API Info:</strong> ${service.metrics.apiDescription || 'N/A'}</p>
                <p><strong>Manual Refresh:</strong> ${service.metrics.manualRefreshAllowed ? '✅ Allowed' : '❌ Blocked'}</p>
              ` : `
                <p><strong>Metrics:</strong> Success: ${service.metrics.successCount || 0}, Errors: ${service.metrics.errorCount || 0}</p>
                <p><strong>Avg Response:</strong> ${service.metrics.avgResponseTime ? `${service.metrics.avgResponseTime.toFixed(2)}ms` : 'N/A'}</p>
              `
            ) : ''}
            ${retryStats && retryStats.details && retryStats.details[name] ? `
              <p><strong>Retry Attempts:</strong> ${retryStats.details[name].attempts}</p>
              <p><strong>Avg Retries:</strong> ${retryStats.details[name].avgRetries}</p>
              <p><strong>Last Error:</strong> ${retryStats.details[name].lastError || 'None'}</p>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // System Metrics Chart
  html += `
    <div class="section">
      <h2>System Metrics Chart</h2>
      <canvas id="systemMetricsChart" width="400" height="200"></canvas>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      const ctx = document.getElementById('systemMetricsChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['-40s', '-30s', '-20s', '-10s', 'Now'],
          datasets: [
            {
              label: 'CPU Usage (%)',
              data: ${JSON.stringify(serviceDetails['SystemMetrics']?.metrics?.cpuUsageHistory || [])},
              borderColor: '#4CAF50',
              backgroundColor: 'rgba(76, 175, 80, 0.2)',
              fill: true
            },
            {
              label: 'Memory Usage (%)',
              data: ${JSON.stringify(serviceDetails['SystemMetrics']?.metrics?.memoryUsageHistory || [])},
              borderColor: '#2196F3',
              backgroundColor: 'rgba(33, 150, 243, 0.2)',
              fill: true
            },
            {
              label: 'Temperature (°C)',
              data: ${JSON.stringify(serviceDetails['SystemMetrics']?.metrics?.temperatureHistory || [])},
              borderColor: '#FF9800',
              backgroundColor: 'rgba(255, 152, 0, 0.2)',
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'System Metrics Over Time' }
          }
        }
      });
    </script>
  `;

  // Scripts
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
      async function reconnectArduino() {
        const button = event.target;
        const originalText = button.innerHTML;
        button.innerHTML = '⏳ Reconnecting...';
        button.disabled = true;
        try {
          const response = await fetch('/api/shade-commander/reconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const result = await response.json();
          if (result.success) {
            button.innerHTML = '✅ Reconnected!';
            setTimeout(() => location.reload(), 2000);
          } else {
            button.innerHTML = '❌ Failed';
            setTimeout(() => {
              button.innerHTML = originalText;
              button.disabled = false;
            }, 3000);
          }
        } catch (error) {
          button.innerHTML = '❌ Error';
          setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
          }, 3000);
        }
      }
    </script>
    </body>
    </html>
  `;

  res.send(html);
});

// Debug endpoint to check service registry data
app.get('/api/debug/services', (req, res) => {
  try {
    const services = {};
    for (const [name, service] of serviceRegistry.services.entries()) {
      services[name] = {
        status: service.status,
        metrics: service.metrics,
        isCore: service.isCore,
        uptime: service.uptime
      };
    }
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ShadeCommander proxy endpoint for Arduino reconnect
app.post('/api/shade-commander/reconnect', async (req, res) => {
  try {
    const axios = require('axios');
    
    logger.logger.info('Dashboard requested Arduino reconnection via ShadeCommander');
    
    const response = await axios.post('http://192.168.0.15:8000/arduino/reconnect', {}, {
      timeout: 15000, // Arduino reconnection can take up to 10 seconds
      headers: { 'Content-Type': 'application/json' }
    });
    
    logger.logger.info(`Arduino reconnection result: ${response.data.success ? 'Success' : 'Failed'}`);
    res.json(response.data);
    
  } catch (error) {
    logger.logger.error(`Arduino reconnection failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to connect to ShadeCommander for Arduino reconnection'
    });
  }
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

// SystemMetrics service is automatically registered when the module is imported
require('./services/system-metrics');

// Legacy weather-service removed - WeatherService is now managed by ServiceFactory

// Weather API Usage Tracking (One Call API 3.0 cost monitoring)
serviceRegistry.register('weather-api-usage', {
  isCore: false,
  status: 'ready',
  checkHealth: async () => {
    try {
      const { createWeatherService } = require('./utils/ServiceFactory');
      const weatherService = createWeatherService();
      
      // Get comprehensive usage statistics
      const stats = weatherService.getUsageStats();
      const refreshStatus = weatherService.canManualRefresh();
      
      // Determine overall health based on usage with proper color coding
      let status = 'ok';
      let usageLabel = 'Well within limits';
      let usageColor = 'green';
      
      if (stats.usagePercent >= 90) {
        status = 'error';
        usageLabel = 'Approaching limit';
        usageColor = 'red';
      } else if (stats.usagePercent >= 70) {
        status = 'warning';
        usageLabel = 'Monitor usage';
        usageColor = 'yellow';
      }
      
      const message = `API Usage: ${stats.dailyCount}/${stats.dailyLimit} calls (${stats.usagePercent.toFixed(1)}%) - ${usageLabel}`;
      
      // Debug logging
      console.log('🔍 weather-api-usage health check returning:', {
        status,
        message,
        usageDisplay: `API Usage: ${stats.dailyCount}/${stats.dailyLimit} calls (${stats.usagePercent.toFixed(1)}%)`,
        statusDisplay: usageLabel
      });
      
      return {
        status,
        message,
        metrics: {
          // Usage metrics for display
          dailyCount: stats.dailyCount,
          dailyLimit: stats.dailyLimit,
          usagePercent: stats.usagePercent,
          usageLabel: usageLabel,
          usageColor: usageColor,
          
          // Formatted display strings
          usageDisplay: `API Usage: ${stats.dailyCount}/${stats.dailyLimit} calls (${stats.usagePercent.toFixed(1)}%)`,
          statusDisplay: usageLabel,
          
          // API info for display
          apiDescription: '🌤️ Weather data via OpenWeatherMap One Call API 3.0',
          
          // Manual refresh status
          manualRefreshAllowed: refreshStatus.allowed,
          cooldownRemaining: refreshStatus.cooldownRemaining,
          refreshReason: refreshStatus.reason,
          
          // Cache info
          lastUpdatedMinutes: stats.lastUpdated,
          cacheAgeSeconds: stats.cacheAge,
          subscription: 'Pay as You Call'
        }
      };
    } catch (error) {
      return { 
        status: 'error', 
        message: `Weather API usage tracking failed: ${error.message}`,
        metrics: {
          dailyCount: 0,
          dailyLimit: 999,
          usagePercent: 0,
          statusColor: 'red'
        }
      };
    }
  }
});

serviceRegistry.register('scheduler-service', {
  isCore: false,
  status: 'ready',
  checkHealth: async () => {
    try {
      const { createSchedulerService } = require('./utils/ServiceFactory');
      const schedulerService = createSchedulerService();
      
      // Initialize the service if not already done
      if (!schedulerService.isInitialized) {
        await schedulerService.initialize();
      }
      
      return await schedulerService.healthCheck();
    } catch (error) {
      logger.logger.error(`Scheduler service health check failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
});

// Note: Legacy MusicService removed - PianobarService handles music functionality

// Legacy shade-service removed - ShadeCommander (FastAPI) handles shade functionality

// ShadeCommander external service (FastAPI on port 8000)
serviceRegistry.register('shade-commander', {
  isCore: false,
  status: 'initializing',
  checkHealth: async () => {
    try {
      const axios = require('axios');
      
      // Health check with 5 second timeout
      const healthResponse = await axios.get('http://192.168.0.15:8000/health', {
        timeout: 5000
      });
      
      // Get additional Arduino status
      let arduinoStatus = { connected: false, port: 'Unknown' };
      let retryStats = { total_active_tasks: 0, recent_cancellations: 0 };
      
      try {
        const arduinoResponse = await axios.get('http://192.168.0.15:8000/arduino/status', {
          timeout: 3000
        });
        // Arduino status is nested under arduino_status in the response
        if (arduinoResponse.data && arduinoResponse.data.arduino_status) {
          arduinoStatus = arduinoResponse.data.arduino_status;
          logger.logger.info(`Arduino status parsed: connected=${arduinoStatus.connected}, port=${arduinoStatus.port}`);
        }
      } catch (err) {
        logger.logger.debug(`Could not fetch Arduino status: ${err.message}`);
      }
      
      try {
        const retryResponse = await axios.get('http://192.168.0.15:8000/retries', {
          timeout: 3000
        });
        // Parse retry stats correctly
        if (retryResponse.data) {
          retryStats = {
            total_active_tasks: retryResponse.data.total_active_tasks || 0,
            recent_cancellations: retryResponse.data.recent_cancellations || 0
          };
          logger.logger.info(`Retry stats parsed: active=${retryStats.total_active_tasks}, cancellations=${retryStats.recent_cancellations}`);
        }
      } catch (err) {
        logger.logger.debug(`Could not fetch retry stats: ${err.message}`);
      }
      
      const isHealthy = healthResponse.data.status === 'healthy';
      const isArduinoConnected = arduinoStatus.connected;
      
      // Service status only depends on ShadeCommander health, not Arduino
      let status = isHealthy ? 'ok' : 'error';
      let message = isHealthy ? 'ShadeCommander responding' : 'ShadeCommander unhealthy';
      
      // Add Arduino info to message but don't affect service status
      if (isHealthy) {
        if (isArduinoConnected) {
          message = `ShadeCommander OK, Arduino connected (${arduinoStatus.port})`;
        } else {
          message = `ShadeCommander OK, Arduino disconnected (${arduinoStatus.port})`;
        }
      }
      
      const finalMetrics = {
        arduinoConnected: isArduinoConnected,
        arduinoPort: arduinoStatus.port || 'Unknown',
        activeTasks: retryStats.total_active_tasks || 0,
        recentCancellations: retryStats.recent_cancellations || 0,
        uptime: healthResponse.data.uptime_seconds
      };
      
      logger.logger.info(`Final ShadeCommander metrics: ${JSON.stringify(finalMetrics)}`);
      logger.logger.info(`🚀 CHECKPOINT: About to try ServiceRegistry update...`);
      
      // Update service registry with our custom metrics BEFORE returning
      try {
        logger.logger.info(`🔍 Updating ServiceRegistry for shade-commander`);
        const service = serviceRegistry.services.get('shade-commander');
        if (service) {
          logger.logger.info(`Before update - service.metrics keys: ${Object.keys(service.metrics || {}).join(', ')}`);
          service.metrics = {
            ...service.metrics,
            // Keep standard metrics for compatibility
            successCount: service.metrics.successCount || 0,
            errorCount: service.metrics.errorCount || 0,
            avgResponseTime: service.metrics.avgResponseTime || 0,
            // Add our custom ShadeCommander metrics
            arduinoConnected: finalMetrics.arduinoConnected,
            arduinoPort: finalMetrics.arduinoPort,
            activeTasks: finalMetrics.activeTasks,
            recentCancellations: finalMetrics.recentCancellations,
            uptime: finalMetrics.uptime
          };
          serviceRegistry.services.set('shade-commander', service);
          logger.logger.info(`✅ Updated ServiceRegistry with ShadeCommander metrics: Arduino=${finalMetrics.arduinoConnected}, Tasks=${finalMetrics.activeTasks}`);
        } else {
          logger.logger.error(`❌ Service 'shade-commander' not found in registry! Available services: ${Array.from(serviceRegistry.services.keys()).join(', ')}`);
        }
      } catch (updateError) {
        logger.logger.error(`❌ Error updating ServiceRegistry: ${updateError.message}`);
      }
      
      return {
        status: status,
        message: message,
        metrics: finalMetrics
      };
      
    } catch (error) {
      // ShadeCommander not responding
      return {
        status: 'error',
        message: `ShadeCommander unavailable: ${error.message}`,
        metrics: {
          arduinoConnected: false,
          arduinoPort: 'N/A',
          activeTasks: 0,
          recentCancellations: 0
        }
      };
    }
  }
});

// Run an initial health check after registering services
setTimeout(() => {
  serviceRegistry.checkAllServices()
    .then(() => {
      logger.logger.info('Initial service health check completed');
    })
    .catch(err => {
      logger.logger.error(`Error during initial health check: ${err.message}`);
    });
}, 5000);  // Wait 5 seconds for services to initialize

// Set up periodic health checks to keep dashboard data fresh
const HEALTH_CHECK_INTERVAL = 60 * 1000; // 60 seconds
setInterval(() => {
  serviceRegistry.checkAllServices()
    .then(() => {
      logger.logger.debug('Periodic service health check completed');
    })
    .catch(err => {
      logger.logger.error(`Error during periodic health check: ${err.message}`);
    });
}, HEALTH_CHECK_INTERVAL);

// Register API routes
app.use('/api/config', configRoutes);
// app.use('/api/shades', shadeRoutes); // Removed - React calls ShadeCommander directly
app.use('/api/weather', weatherRoutes);
app.use('/api/scheduler', schedulerRoutes);
// app.use('/api/music', musicRoutes); // Removed - Legacy music service now Pianobar is the music service
app.use('/api/bluetooth', bluetoothRoutes);
app.use('/api/pianobar', pianobarRoutes);
app.use('/api/state', stateRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/system', systemRoutes);

// Catch-all route for client-side routing (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
  });
}

// Error handling middleware (should be defined after all routes)
app.use((err, req, res, next) => {
  logger.logger.error(`Unhandled error: ${err.message}`, { error: err.stack });
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
        logger.logger.info('PianobarWebsocketService initialized successfully');
        console.log('[DEBUG] WebSocket initialization successful');
      } else {
        logger.logger.warn(`PianobarWebsocketService initialization warning: ${result.message}`);
        console.log(`[DEBUG] WebSocket initialization warning: ${result.message}`);
      }
    })
    .catch(err => {
      logger.logger.error(`Error initializing PianobarWebsocketService: ${err.message}`);
      console.error(`[ERROR] WebSocket initialization failed: ${err.message}`);
    });
}, 3000); // Delay by 3 seconds to allow server to start first

// Log that we're starting with both command interface and WebSocket
logger.logger.info('Starting with PianobarCommandInterface and WebSocket support');

// Graceful shutdown handler
function gracefulShutdown(signal) {
  logger.logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Set a timeout for forceful shutdown if graceful shutdown takes too long
  const forceShutdownTimeout = setTimeout(() => {
    logger.logger.error('Forceful shutdown triggered after timeout');
    process.exit(1);
  }, 30000); // 30 seconds timeout

  // Try to close the server gracefully
  server.close(() => {
    logger.logger.info('HTTP server closed successfully');
    
    // Clear the force shutdown timeout
    clearTimeout(forceShutdownTimeout);
    
    // Perform any additional cleanup here
    // e.g., close database connections, etc.
    
    logger.logger.info('Shutdown complete, exiting process');
    process.exit(0);
  });
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.logger.error(`Uncaught exception: ${err.message}`, { error: err.stack });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.logger.error(`Unhandled promise rejection at: ${promise}, reason: ${reason}`);
  // Don't exit for unhandled rejections, just log them
});

// FIXED SERVER STARTUP - bind to all interfaces rather than just localhost
console.log(`Attempting to start server on port ${PORT}...`);
logger.logger.info(`Attempting to start server on port ${PORT}...`);

// Create a simple ping route to check if server is running
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Additional debug logging for server startup
console.log(`DEBUG: About to start server on port ${PORT}...`);
// Add this near the bottom, before server.listen
if (global.newrelic) {
  console.log('[NEW RELIC] Agent is loaded and available');
  console.log('[NEW RELIC] App name:', global.newrelic.agent.config.app_name);
  console.log('[NEW RELIC] Agent state:', global.newrelic.agent.setState ? 'ready' : 'not ready');
} else {
  console.log('[NEW RELIC] Agent is NOT loaded');
}
// Directly start the server without specifying host (which defaults to all interfaces)
// This is important because on some Linux configurations, 127.0.0.1 binding can be restrictive
try {
  console.log(`DEBUG: Calling server.listen(${PORT}, '0.0.0.0', ...)...`);
  server.listen(PORT, '0.0.0.0', (err) => {
    console.log(`DEBUG: Inside server.listen callback, err=${err}`);
    if (err) {
      logger.logger.error(`Failed to start server: ${err.message}`);
      console.error(`ERROR: ${err.message}`);
    } else {
      logger.logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.logger.info(`Server accessible at http://localhost:${PORT}`);
      console.log(`Server started on port ${PORT} and listening on all interfaces`);
      console.log(`API available at: http://localhost:${PORT}/api/health`);
      console.log(`Ping test available at: http://localhost:${PORT}/ping`);
      
      // CRITICAL: Initialize SchedulerService after server is running
      setTimeout(async () => {
        try {
          // Initialize TimeLogger for hourly clock chimes
          console.log('[INIT] Starting TimeLogger for hourly clock chimes...');
          const timeLogger = require('./utils/TimeLogger');
          timeLogger.start();
          
          console.log('[INIT] Initializing SchedulerService after server startup...');
          const schedulerService = createSchedulerService();
          
          if (!schedulerService.isInitialized) {
            await schedulerService.initialize();
            console.log('[INIT] ✅ SchedulerService initialization completed');
            console.log(`[INIT] ✅ Scheduled jobs created: ${schedulerService.scheduledJobs.size}`);
            
            // List the scheduled jobs
            for (const [name, job] of schedulerService.scheduledJobs) {
              console.log(`[INIT] - Cron job: ${name}`);
            }
          } else {
            console.log('[INIT] SchedulerService already initialized');
          }
        } catch (error) {
          console.error('[INIT] ❌ SchedulerService initialization failed:', error.message);
          logger.logger.error(`SchedulerService post-startup initialization failed: ${error.message}`);
        }
      }, 3000); // Wait 3 seconds after server starts
      
      // Start ShadeCommander background monitoring after server is stable
      setTimeout(() => {
        try {
          console.log('[INIT] Starting ShadeCommander background monitor...');
          shadeCommanderMonitor.start();
          console.log('[INIT] ✅ ShadeCommander monitor started successfully');
        } catch (error) {
          console.error('[INIT] ❌ ShadeCommander monitor startup failed:', error.message);
          logger.logger.error(`ShadeCommander monitor startup failed: ${error.message}`);
        }
      }, 5000); // Wait 5 seconds after server starts (after SchedulerService)
    }
  });
  
  console.log(`DEBUG: Server listen called on port ${PORT} - this message should appear immediately`);
  
  // Add a log message after a short delay to see if server.listen is hanging
  setTimeout(() => {
    console.log(`DEBUG: This message appears 2 seconds after starting the server - if you see this, server.listen is non-blocking`);
  }, 2000);
} catch (error) {
  console.error(`ERROR starting server: ${error.message}`);
  logger.logger.error(`ERROR starting server: ${error.message}`);
  logger.logger.error(error.stack);
}

// Export the server for testing
module.exports = server;
