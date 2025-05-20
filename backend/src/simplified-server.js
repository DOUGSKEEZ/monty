// Simplified server that combines your working direct-server with your routes
const express = require('express');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');
const logger = require('./utils/logger'); // Assuming this path is correct

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS for all access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Import your routes
try {
  const weatherRoutes = require('./routes/weather'); 
  const shadesRoutes = require('./routes/shades');
  const musicRoutes = require('./routes/music');
  
  // Use them without initializing services
  app.use('/api/weather', weatherRoutes);
  app.use('/api/shades', shadesRoutes);
  app.use('/api/music', musicRoutes);
  
  console.log("Routes imported successfully");
} catch (err) {
  console.error("Error importing routes:", err);
  // Continue anyway with basic health endpoint
}

// Basic health endpoint that will always work
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend server is running',
    time: new Date().toISOString()
  });
});

// Create HTTP server
const server = http.createServer(app);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${err.message}`, err.stack);
  // Don't exit immediately
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled promise rejection at:`, promise, `reason:`, reason);
  // Don't exit for unhandled rejections, just log them
});

// Start the server with detailed logging
console.log(`Attempting to start server on port ${PORT}...`);

// Listen with a timeout to catch hanging
const startTimeout = setTimeout(() => {
  console.error("Server start timed out - possible hang in initialization");
}, 10000);

// Direct listen approach
server.listen(PORT, '0.0.0.0', () => {
  clearTimeout(startTimeout);
  console.log(`Server started on port ${PORT} and listening on all interfaces`);
  console.log(`API available at: http://localhost:${PORT}/api/health`);
});

// Export the server for testing
module.exports = server;
