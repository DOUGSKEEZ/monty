/**
 * Simple Pianobar Server
 * 
 * A bare-bones server that only handles pianobar commands,
 * without the complexity of the full application.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

console.log('Starting simple pianobar server');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3002; // Use a different port to avoid conflicts

// Basic middleware
app.use(cors());
app.use(bodyParser.json());

// FIFO configuration
const HOME_DIR = process.env.HOME || '/home/monty';
const PIANOBAR_CONFIG_DIR = path.join(HOME_DIR, '.config/pianobar');
const PIANOBAR_CTL = path.join(PIANOBAR_CONFIG_DIR, 'ctl');
const STATUS_FILE = path.join(HOME_DIR, 'monty/data/cache/pianobar_status.json');

// Setup basic file structure
function ensureBasicFileStructure() {
  try {
    // Create config directory if it doesn't exist
    if (!fs.existsSync(PIANOBAR_CONFIG_DIR)) {
      fs.mkdirSync(PIANOBAR_CONFIG_DIR, { recursive: true });
      console.log(`Created pianobar config directory: ${PIANOBAR_CONFIG_DIR}`);
    }
    
    // Create data directory if it doesn't exist
    const DATA_DIR = path.dirname(STATUS_FILE);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`Created data directory: ${DATA_DIR}`);
    }
    
    // Create status file with basic data if it doesn't exist
    if (!fs.existsSync(STATUS_FILE)) {
      fs.writeFileSync(STATUS_FILE, JSON.stringify({
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        updateTime: Date.now()
      }, null, 2), 'utf8');
      console.log(`Created status file: ${STATUS_FILE}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error ensuring file structure: ${error.message}`);
    return false;
  }
}

// Ensure FIFO exists
async function ensureFifo() {
  try {
    // Check if FIFO exists
    let needNewFifo = false;
    if (fs.existsSync(PIANOBAR_CTL)) {
      try {
        const stats = fs.statSync(PIANOBAR_CTL);
        if (!stats.isFIFO()) {
          console.log(`Found non-FIFO file at ${PIANOBAR_CTL}, recreating`);
          await execPromise(`rm ${PIANOBAR_CTL}`);
          needNewFifo = true;
        }
      } catch (error) {
        console.warn(`Error checking FIFO file: ${error.message}, recreating`);
        try {
          await execPromise(`rm ${PIANOBAR_CTL}`);
        } catch (rmError) {
          console.error(`Failed to remove bad FIFO: ${rmError.message}`);
        }
        needNewFifo = true;
      }
    } else {
      needNewFifo = true;
    }
    
    // Create new FIFO if needed
    if (needNewFifo) {
      await execPromise(`mkfifo ${PIANOBAR_CTL}`);
      await execPromise(`chmod 666 ${PIANOBAR_CTL}`);
      console.log(`Created FIFO control file at ${PIANOBAR_CTL}`);
    } else {
      // Just ensure proper permissions
      await execPromise(`chmod 666 ${PIANOBAR_CTL}`);
      console.log(`Ensured FIFO permissions at ${PIANOBAR_CTL}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to ensure FIFO: ${error.message}`);
    return false;
  }
}

// Send a command to pianobar
async function sendCommand(command) {
  try {
    // Ensure FIFO exists
    await ensureFifo();
    
    // Send command
    fs.writeFileSync(PIANOBAR_CTL, `${command}\n`, { encoding: 'utf8' });
    console.log(`Command '${command}' sent successfully`);
    
    return { success: true, message: `Command '${command}' sent successfully` };
  } catch (error) {
    console.error(`Error sending command: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Update status file
function updateStatus(status) {
  try {
    // Read existing status
    let existingStatus = {};
    if (fs.existsSync(STATUS_FILE)) {
      try {
        existingStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      } catch (readError) {
        console.warn(`Error reading status file: ${readError.message}`);
      }
    }
    
    // Update status
    const newStatus = { 
      ...existingStatus, 
      ...status, 
      updateTime: Date.now() 
    };
    
    // Write to file
    fs.writeFileSync(STATUS_FILE, JSON.stringify(newStatus, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error updating status: ${error.message}`);
    return false;
  }
}

// Check if pianobar is running
async function checkPianobarStatus() {
  try {
    const { stdout } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
    const pids = stdout.trim().split('\n').filter(Boolean);
    
    const isRunning = pids.length > 0;
    console.log(`Pianobar is ${isRunning ? 'running' : 'not running'}`);
    
    // Update status file
    updateStatus({
      status: isRunning ? 'running' : 'stopped',
      isPianobarRunning: isRunning,
      isPlaying: isRunning
    });
    
    return isRunning;
  } catch (error) {
    console.error(`Error checking pianobar status: ${error.message}`);
    return false;
  }
}

// Start pianobar
async function startPianobar() {
  try {
    // Check if already running
    const isRunning = await checkPianobarStatus();
    if (isRunning) {
      console.log('Pianobar is already running');
      return { success: true, message: 'Pianobar is already running' };
    }
    
    // Start pianobar
    const { exec } = require('child_process');
    exec('nohup pianobar > /tmp/pianobar_stdout.log 2> /tmp/pianobar_stderr.log &', (error) => {
      if (error) {
        console.error(`Error starting pianobar: ${error.message}`);
        return;
      }
      
      console.log('Pianobar started successfully');
      
      // Update status
      updateStatus({
        status: 'playing',
        isPianobarRunning: true,
        isPlaying: true,
        startTime: Date.now()
      });
    });
    
    return { success: true, message: 'Pianobar starting...' };
  } catch (error) {
    console.error(`Error starting pianobar: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// API Routes
app.get('/api/pianobar/status', async (req, res) => {
  try {
    // Check if pianobar is running
    const isRunning = await checkPianobarStatus();
    
    // Read status file
    let statusData = {
      status: isRunning ? 'running' : 'stopped',
      isPianobarRunning: isRunning,
      isPlaying: isRunning,
      updateTime: Date.now()
    };
    
    if (fs.existsSync(STATUS_FILE)) {
      try {
        statusData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      } catch (parseError) {
        console.warn(`Error parsing status file: ${parseError.message}`);
      }
    }
    
    res.json({ success: true, data: statusData });
  } catch (error) {
    console.error(`Error getting status: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pianobar/start', async (req, res) => {
  try {
    const result = await startPianobar();
    res.json(result);
  } catch (error) {
    console.error(`Error starting pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pianobar/stop', async (req, res) => {
  try {
    const result = await sendCommand('q');
    
    // Update status
    updateStatus({
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false,
      stopTime: Date.now()
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error stopping pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pianobar/play', async (req, res) => {
  try {
    const result = await sendCommand('P');
    
    // Update status
    updateStatus({
      status: 'playing',
      isPlaying: true
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error playing: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pianobar/pause', async (req, res) => {
  try {
    const result = await sendCommand('S');
    
    // Update status
    updateStatus({
      status: 'paused',
      isPlaying: false
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error pausing: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pianobar/next', async (req, res) => {
  try {
    const result = await sendCommand('n');
    res.json(result);
  } catch (error) {
    console.error(`Error skipping song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pianobar/love', async (req, res) => {
  try {
    const result = await sendCommand('+');
    res.json(result);
  } catch (error) {
    console.error(`Error loving song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    message: 'Simple pianobar server is running'
  });
});

// Test page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Simple Pianobar Test</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          button { padding: 10px; margin: 5px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Simple Pianobar Test</h1>
        <div>
          <button id="start-btn">Start</button>
          <button id="play-btn">Play</button>
          <button id="pause-btn">Pause</button>
          <button id="next-btn">Next</button>
          <button id="love-btn">Love</button>
          <button id="stop-btn">Stop</button>
        </div>
        <div>
          <button id="status-btn">Get Status</button>
        </div>
        <div id="status" style="margin-top: 20px; padding: 10px; border: 1px solid #ccc;"></div>
        <script>
          // API functions
          async function apiCall(endpoint, method = 'GET') {
            try {
              const response = await fetch(\`/api/pianobar/\${endpoint}\`, { method });
              return await response.json();
            } catch (error) {
              console.error(error);
              return { success: false, error: error.message };
            }
          }
          
          // Button handlers
          document.getElementById('start-btn').addEventListener('click', async () => {
            const result = await apiCall('start', 'POST');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          document.getElementById('play-btn').addEventListener('click', async () => {
            const result = await apiCall('play', 'POST');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          document.getElementById('pause-btn').addEventListener('click', async () => {
            const result = await apiCall('pause', 'POST');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          document.getElementById('next-btn').addEventListener('click', async () => {
            const result = await apiCall('next', 'POST');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          document.getElementById('love-btn').addEventListener('click', async () => {
            const result = await apiCall('love', 'POST');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          document.getElementById('stop-btn').addEventListener('click', async () => {
            const result = await apiCall('stop', 'POST');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          document.getElementById('status-btn').addEventListener('click', async () => {
            const result = await apiCall('status');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          });
          
          // Get initial status
          (async () => {
            const result = await apiCall('status');
            document.getElementById('status').innerText = JSON.stringify(result, null, 2);
          })();
        </script>
      </body>
    </html>
  `);
});

// Initialize
console.log('Ensuring basic file structure...');
ensureBasicFileStructure();

console.log('Ensuring FIFO exists...');
ensureFifo().then((result) => {
  console.log(`FIFO setup ${result ? 'successful' : 'failed'}`);
  
  // Create HTTP server
  const server = http.createServer(app);
  
  // Start server
  console.log(`Starting server on port ${PORT}...`);
  server.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error(`Failed to start server: ${err.message}`);
    } else {
      console.log(`Server running on port ${PORT}`);
      console.log(`Test page available at: http://localhost:${PORT}/`);
    }
  });
}).catch((error) => {
  console.error(`Error during initialization: ${error.message}`);
});