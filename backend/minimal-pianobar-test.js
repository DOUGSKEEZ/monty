/**
 * Minimal test server to debug the pianobar command interface
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('./src/utils/logger');
const http = require('http');
const fs = require('fs');

// Load PianobarCommandInterface directly
console.log('Loading PianobarCommandInterface class...');
const PianobarCommandInterface = require('./src/services/PianobarCommandInterface');
console.log('PianobarCommandInterface class loaded');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add request logger for debugging
app.use((req, res, next) => {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Create a simple command interface instance
console.log('Creating command interface...');
const commandInterface = new PianobarCommandInterface({
  verbose: true
});
console.log('Command interface created');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Minimal server is running',
    uptime: process.uptime()
  });
});

// Command endpoint
app.post('/api/command/:cmd', async (req, res) => {
  const cmd = req.params.cmd;
  console.log(`Command received: ${cmd}`);
  
  try {
    // Initialize FIFO if needed
    if (!commandInterface.isInitialized) {
      console.log('Initializing command interface...');
      await commandInterface.ensureFifo();
      console.log('FIFO initialized');
    }
    
    // Send command
    console.log(`Sending command: ${cmd}`);
    const result = await commandInterface.sendCommand(cmd);
    console.log(`Command result: ${JSON.stringify(result)}`);
    
    res.json({
      success: true,
      message: `Command ${cmd} sent`,
      result
    });
  } catch (error) {
    console.error(`Error sending command: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `Error sending command: ${error.message}`,
      error: error.stack
    });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Start the server
server.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(`Failed to start server: ${err.message}`);
  } else {
    console.log(`Minimal test server running on port ${PORT}`);
    console.log(`Try: curl -X POST http://localhost:${PORT}/api/command/p`);
  }
});