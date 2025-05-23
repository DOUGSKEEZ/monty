/**
 * Simplified version of the main server to isolate the issue
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add request logger
app.use((req, res, next) => {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Add better error handler
process.on('uncaughtException', (err) => {
  console.error(`UNCAUGHT EXCEPTION: ${err.message}`);
  console.error(err.stack);
});

// Basic routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    message: 'Simplified main server is running'
  });
});

// Test route
app.get('/test', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Simplified Main Server</h1>
        <p>This server is running correctly!</p>
        <p>Time: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

// Create HTTP server
const server = http.createServer(app);

// Logging function to track progress
function logProgress(step) {
  console.log(`[${new Date().toISOString()}] PROGRESS: ${step}`);
}

// Start server
logProgress('About to start server');

try {
  logProgress('Calling server.listen');
  
  server.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error(`ERROR: ${err.message}`);
      logProgress('Server listen callback with error');
    } else {
      logProgress('Server listen callback successful');
      console.log(`Server started on port ${PORT} and listening on all interfaces`);
      console.log(`Test page available at: http://localhost:${PORT}/test`);
    }
  });
  
  logProgress('After server.listen call');
  
  // Test setTimeout
  setTimeout(() => {
    logProgress('2 second timeout completed');
  }, 2000);
  
  // Log that we're done with startup
  logProgress('End of startup code');
} catch (error) {
  console.error(`ERROR starting server: ${error.message}`);
  console.error(error.stack);
  logProgress('Error in try/catch block');
}

// Export the server
module.exports = server;