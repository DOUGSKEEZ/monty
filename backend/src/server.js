const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const winston = require('winston');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'monty-server' },
  transports: [
    new winston.transports.File({ filename: '../logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: '../logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Monty server is running' });
});

// Shade Control Route (Example)
app.post('/api/shades/control', (req, res) => {
  const { shade_id, command } = req.body;
  logger.info(`Received shade control: ${command}${shade_id}`);
  
  // TODO: Implement actual shade control
  
  res.json({ success: true, message: `Command sent: ${command}${shade_id}` });
});

// Catch-all route for client-side routing (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
  });
}

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Monty server started on port ${PORT}`);
});
