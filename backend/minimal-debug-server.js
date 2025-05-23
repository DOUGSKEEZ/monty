/**
 * Minimal debug server for troubleshooting startup issues
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');

// Create minimal Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(cors());
app.use(bodyParser.json());

// Simple health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    message: 'Minimal debug server is running'
  });
});

// Simple route to test serving static files
app.get('/test', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Minimal Debug Server</h1>
        <p>This server is running correctly!</p>
      </body>
    </html>
  `);
});

// Create HTTP server
const server = http.createServer(app);

// Log debug info
console.log('DEBUG: Minimal server created');

// Start server
try {
  console.log(`DEBUG: About to start server on port ${PORT}...`);
  
  server.listen(PORT, '0.0.0.0', (err) => {
    console.log(`DEBUG: Inside server.listen callback, err=${err}`);
    
    if (err) {
      console.error(`ERROR: ${err.message}`);
    } else {
      console.log(`Server started on port ${PORT} and listening on all interfaces`);
      console.log(`Test page available at: http://localhost:${PORT}/test`);
    }
  });
  
  console.log(`DEBUG: Server listen called on port ${PORT} - this should appear immediately`);
  
  // Test setTimeout
  setTimeout(() => {
    console.log(`DEBUG: This message appears 2 seconds after starting the server`);
  }, 2000);
  
} catch (error) {
  console.error(`ERROR starting server: ${error.message}`);
  console.error(error.stack);
}

// Export the server for testing
module.exports = server;