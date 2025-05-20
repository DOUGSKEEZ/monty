// Simplified direct startup for backend server
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3001;

// Configure CORS for all access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Basic health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend server is running',
    time: new Date().toISOString()
  });
});

// Explicitly listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} on all interfaces`);
  console.log(`API available at:`);
  console.log(`  - http://localhost:${PORT}/api/health`);
  console.log(`  - http://192.168.0.15:${PORT}/api/health`);
});