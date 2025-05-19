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

// Middleware
// Configure CORS - Allow access from any origin in development
app.use(cors({
  origin: '*', // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(logger.httpLogger); // Add HTTP request logging

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
}

// Import routes
const configRoutes = require('./routes/config');
const shadeRoutes = require('./routes/shades');
const weatherRoutes = require('./routes/weather');
const schedulerRoutes = require('./routes/scheduler');
const musicRoutes = require('./routes/music');

// API Routes
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

// Register API routes
app.use('/api/config', configRoutes);
app.use('/api/shades', shadeRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/music', musicRoutes);

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

// Start the server on all interfaces (0.0.0.0) so it's accessible from other devices
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`Server accessible at http://localhost:${PORT} and http://<IP>:${PORT}`);
  console.log(`Monty server started on port ${PORT} and listening on all interfaces`);
});

// Export the server for testing
module.exports = server;
