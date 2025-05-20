const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const http = require('http');
const process = require('process');
const config = require('./utils/config');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

console.log(`[${new Date().toISOString()}] DEBUG: Starting server initialization...`);
logger.info('DEBUG: Starting server initialization...');

// Middleware
// Configure CORS - Allow specific origins
console.log(`[${new Date().toISOString()}] DEBUG: Setting up middleware...`);
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(logger.httpLogger); // Add HTTP request logging

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  console.log(`[${new Date().toISOString()}] DEBUG: Setting up static file serving for production...`);
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
}

// Import routes
console.log(`[${new Date().toISOString()}] DEBUG: Importing route modules...`);
const configRoutes = require('./routes/config');
const shadeRoutes = require('./routes/shades');
const weatherRoutes = require('./routes/weather');
const schedulerRoutes = require('./routes/scheduler');
const musicRoutes = require('./routes/music');

// API Routes
console.log(`[${new Date().toISOString()}] DEBUG: Setting up health endpoint...`);
app.get('/api/health', (req, res) => {
  // Enhanced health check that verifies key system components
  const healthStatus = {
    status: 'ok',
    message: 'Monty server is running',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    components: {
      config: config.isLoaded() ? 'ok' : 'error',
      // Add other component health checks here as the system grows
    }
  };

  // If any component is not healthy, change overall status
  if (Object.values(healthStatus.components).includes('error')) {
    healthStatus.status = 'degraded';
  }

  res.json(healthStatus);
});

// Register API routes with timeout protection
console.log(`[${new Date().toISOString()}] DEBUG: Registering API routes...`);
console.log(`[${new Date().toISOString()}] DEBUG: - Registering /api/config routes...`);
app.use('/api/config', configRoutes);

console.log(`[${new Date().toISOString()}] DEBUG: - Registering /api/shades routes...`);
app.use('/api/shades', shadeRoutes);

console.log(`[${new Date().toISOString()}] DEBUG: - Registering /api/weather routes...`);
app.use('/api/weather', weatherRoutes);

console.log(`[${new Date().toISOString()}] DEBUG: - Registering /api/scheduler routes...`);
app.use('/api/scheduler', schedulerRoutes);

console.log(`[${new Date().toISOString()}] DEBUG: - Registering /api/music routes...`);
app.use('/api/music', musicRoutes);

// Catch-all route for client-side routing (production only)
if (process.env.NODE_ENV === 'production') {
  console.log(`[${new Date().toISOString()}] DEBUG: Setting up catch-all route for SPA in production...`);
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
  });
}

// Error handling middleware (should be defined after all routes)
console.log(`[${new Date().toISOString()}] DEBUG: Setting up error handling middleware...`);
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
console.log(`[${new Date().toISOString()}] DEBUG: Creating HTTP server...`);
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

// FIXED SERVER STARTUP - bind to all interfaces rather than just localhost
console.log(`[${new Date().toISOString()}] DEBUG: Attempting to start server on port ${PORT}...`);
logger.info(`Attempting to start server on port ${PORT}...`);

// Add a timeout to detect server startup issues
const serverStartupTimeout = setTimeout(() => {
  console.error(`[${new Date().toISOString()}] ERROR: Server startup timed out after 30 seconds.`);
  logger.error('Server startup timed out after 30 seconds.');
  process.exit(1);
}, 30000);

// Directly start the server without specifying host (which defaults to all interfaces)
console.log(`[${new Date().toISOString()}] DEBUG: About to call server.listen()...`);
server.listen(PORT, (err) => {
  // Clear the startup timeout
  clearTimeout(serverStartupTimeout);
  
  if (err) {
    logger.error(`Failed to start server: ${err.message}`);
    console.error(`[${new Date().toISOString()}] ERROR: ${err.message}`);
  } else {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`Server accessible at http://localhost:${PORT}`);
    console.log(`[${new Date().toISOString()}] Server started on port ${PORT} and listening on all interfaces`);
    console.log(`[${new Date().toISOString()}] API available at: http://localhost:${PORT}/api/health`);
  }
});

// Export the server for testing
module.exports = server;