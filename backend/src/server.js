const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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
  res.json({ status: 'ok', message: 'Monty server is running' });
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

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Monty server started on port ${PORT}`);
});
