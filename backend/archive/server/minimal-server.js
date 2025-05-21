const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const logger = require('./utils/logger');
const config = require('./utils/config');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

console.log(`[${new Date().toISOString()}] Starting minimal server initialization...`);

// Middleware
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

// Basic health endpoint with debugging info
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'ok',
    message: 'Monty minimal server is running',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    components: {
      config: config.isLoaded() ? 'ok' : 'error',
    }
  };

  res.json(healthStatus);
});

// Debug endpoints to help identify issues
app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug endpoint',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { error: err.stack });
  res.status(500).json({
    success: false,
    error: 'An internal server error occurred'
  });
});

// Create HTTP server
const server = http.createServer(app);

// Handle errors
server.on('error', (error) => {
  console.error(`[${new Date().toISOString()}] Server error: ${error.message}`);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use!`);
  }
});

// Start the server
console.log(`[${new Date().toISOString()}] Attempting to start minimal server on port ${PORT}...`);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Minimal server is running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Try accessing at:`);
  console.log(`  http://localhost:${PORT}/api/health`);
});

module.exports = server;