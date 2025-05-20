// Ultra-minimal server for port binding debugging
const express = require('express');
const app = express();
const PORT = 3001;

// Basic health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Minimal server is running',
    time: new Date().toISOString()
  });
});

// Explicitly listen on all interfaces with no host binding restrictions
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Try accessing at:`);
  console.log(`  http://localhost:${PORT}/api/health`);
  console.log(`  http://127.0.0.1:${PORT}/api/health`);
  console.log(`  http://192.168.0.15:${PORT}/api/health`);
});

// Add error handling
server.on('error', (error) => {
  console.error('Server error:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use!`);
  }
});