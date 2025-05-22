/**
 * Direct Pianobar Server
 * 
 * A minimal server implementation that only includes the pianobar
 * functionality using the simplified command interface.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

console.log('Starting Direct Pianobar Server...');

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

// Add simple logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Create HTTP server
const server = http.createServer(app);

// Status file paths
const statusFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
const stationsFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');

// Ensure data directory exists
const dataDir = path.dirname(statusFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

// Basic FIFO interface
class BasicPianobarCommands {
  constructor() {
    this.pianobarConfigDir = path.join(process.env.HOME || '/home/monty', '.config/pianobar');
    this.pianobarCtl = path.join(this.pianobarConfigDir, 'ctl');
  }
  
  async ensureFifo() {
    // Ensure config directory exists
    if (!fs.existsSync(this.pianobarConfigDir)) {
      fs.mkdirSync(this.pianobarConfigDir, { recursive: true });
      console.log(`Created pianobar config directory: ${this.pianobarConfigDir}`);
    }
    
    // Check if FIFO exists
    let needNewFifo = false;
    if (fs.existsSync(this.pianobarCtl)) {
      try {
        const stats = fs.statSync(this.pianobarCtl);
        if (!stats.isFIFO()) {
          console.log(`Found non-FIFO file at ${this.pianobarCtl}, recreating`);
          fs.unlinkSync(this.pianobarCtl);
          needNewFifo = true;
        }
      } catch (error) {
        console.error(`Error checking FIFO: ${error.message}`);
        needNewFifo = true;
      }
    } else {
      needNewFifo = true;
    }
    
    // Create new FIFO if needed
    if (needNewFifo) {
      const { execSync } = require('child_process');
      execSync(`mkfifo ${this.pianobarCtl}`);
      execSync(`chmod 666 ${this.pianobarCtl}`);
      console.log(`Created FIFO at ${this.pianobarCtl}`);
    } else {
      // Ensure permissions
      const { execSync } = require('child_process');
      execSync(`chmod 666 ${this.pianobarCtl}`);
    }
    
    return true;
  }
  
  async sendCommand(command) {
    // Ensure FIFO exists
    await this.ensureFifo();
    
    console.log(`Sending command: ${command}`);
    
    // Set appropriate timeout based on command
    let timeout = 1000; // Default to 1 second
    
    if (command === 'n') {
      timeout = 2500; // Next song can take longer
    } else if (command.startsWith('s') && command.length > 1) {
      timeout = 5000; // Station changes take the longest
    }
    
    // Send command with timeout
    const startTime = Date.now();
    
    try {
      // Write to FIFO
      const writePromise = new Promise((resolve, reject) => {
        try {
          fs.writeFileSync(this.pianobarCtl, `${command}\n`, { encoding: 'utf8' });
          resolve({ success: true });
        } catch (error) {
          reject(error);
        }
      });
      
      // Create timeout promise
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: false, timedOut: true });
        }, timeout);
      });
      
      // Race the write against the timeout
      const result = await Promise.race([writePromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      
      if (result.timedOut) {
        console.log(`Command timed out after ${duration}ms`);
        return {
          success: false,
          message: `Command '${command}' timed out after ${duration}ms`,
          command,
          duration
        };
      }
      
      console.log(`Command sent successfully in ${duration}ms`);
      
      return {
        success: true,
        message: `Command '${command}' sent successfully`,
        command,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Error sending command: ${error.message}`);
      
      return {
        success: false,
        message: `Error sending command: ${error.message}`,
        error: error.message,
        command,
        duration
      };
    }
  }
}

// Create command interface
const commandInterface = new BasicPianobarCommands();

// Initialize command interface
commandInterface.ensureFifo()
  .then(() => console.log('FIFO initialized successfully'))
  .catch(err => console.error(`Error initializing FIFO: ${err.message}`));

// API routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Direct Pianobar Server is running',
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

// Get status
app.get('/api/pianobar/status', (req, res) => {
  try {
    // Default status
    let statusData = {
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false,
      updateTime: Date.now(),
      fromCache: true
    };
    
    // Read from status file if exists
    if (fs.existsSync(statusFilePath)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
        statusData.fromCache = true;
      } catch (parseError) {
        console.warn(`Error parsing status file: ${parseError.message}`);
      }
    }
    
    res.json({
      success: true,
      data: statusData
    });
  } catch (error) {
    console.error(`Error getting status: ${error.message}`);
    res.status(200).json({
      success: true,
      data: {
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        error: error.message,
        fromCache: true
      }
    });
  }
});

// Start pianobar
app.post('/api/pianobar/start', (req, res) => {
  try {
    // Start pianobar process with output capture
    const { exec } = require('child_process');
    
    console.log('Starting pianobar...');
    exec('nohup pianobar > /tmp/pianobar_stdout.log 2> /tmp/pianobar_stderr.log &', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error starting pianobar: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: `Failed to start pianobar: ${error.message}`,
          error: error.message
        });
      }
      
      // Update status file
      const statusData = {
        status: 'playing',
        isPianobarRunning: true,
        isPlaying: true,
        updateTime: Date.now(),
        startTime: Date.now()
      };
      
      fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      
      res.json({
        success: true,
        message: 'Pianobar started successfully',
        isPlaying: true
      });
    });
  } catch (error) {
    console.error(`Error in start route: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop pianobar
app.post('/api/pianobar/stop', async (req, res) => {
  try {
    // Send quit command
    const result = await commandInterface.sendCommand('q');
    
    // Update status file
    const statusData = {
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false,
      updateTime: Date.now(),
      stopTime: Date.now()
    };
    
    fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: 'Pianobar stopped successfully',
      isPlaying: false,
      commandResult: result
    });
  } catch (error) {
    console.error(`Error stopping pianobar: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Play
app.post('/api/pianobar/play', async (req, res) => {
  try {
    const result = await commandInterface.sendCommand('P');
    
    // Update status if command was successful
    if (result.success) {
      try {
        // Read current status first
        let statusData = {
          status: 'playing',
          isPianobarRunning: true,
          isPlaying: true,
          updateTime: Date.now()
        };
        
        if (fs.existsSync(statusFilePath)) {
          try {
            const currentStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
            statusData = { ...currentStatus, ...statusData };
          } catch (parseError) {
            console.warn(`Error parsing status file: ${parseError.message}`);
          }
        }
        
        fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      } catch (statusError) {
        console.warn(`Error updating status file: ${statusError.message}`);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error(`Error playing: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pause
app.post('/api/pianobar/pause', async (req, res) => {
  try {
    const result = await commandInterface.sendCommand('S');
    
    // Update status if command was successful
    if (result.success) {
      try {
        // Read current status first
        let statusData = {
          status: 'paused',
          isPianobarRunning: true,
          isPlaying: false,
          updateTime: Date.now()
        };
        
        if (fs.existsSync(statusFilePath)) {
          try {
            const currentStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
            statusData = { ...currentStatus, ...statusData };
          } catch (parseError) {
            console.warn(`Error parsing status file: ${parseError.message}`);
          }
        }
        
        fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      } catch (statusError) {
        console.warn(`Error updating status file: ${statusError.message}`);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error(`Error pausing: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Next song
app.post('/api/pianobar/next', async (req, res) => {
  try {
    const result = await commandInterface.sendCommand('n');
    res.json(result);
  } catch (error) {
    console.error(`Error skipping to next song: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Love song
app.post('/api/pianobar/love', async (req, res) => {
  try {
    const result = await commandInterface.sendCommand('+');
    res.json(result);
  } catch (error) {
    console.error(`Error loving song: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get stations
app.get('/api/pianobar/stations', (req, res) => {
  try {
    // Mock stations
    const mockStations = {
      stations: [
        "Quick Mix",
        "Today's Hits",
        "Pop Hits",
        "Relaxing Instrumental",
        "Classic Rock",
        "Smooth Jazz"
      ],
      mock: true
    };
    
    // Check if stations file exists
    if (!fs.existsSync(stationsFilePath)) {
      // Create stations file with mock data
      try {
        fs.writeFileSync(stationsFilePath, JSON.stringify(mockStations, null, 2), 'utf8');
      } catch (writeError) {
        console.warn(`Error writing mock stations file: ${writeError.message}`);
      }
      
      return res.json({
        success: true,
        data: {
          stations: mockStations.stations,
          mock: true
        },
        message: 'Using mock stations. Start pianobar to see your actual stations.'
      });
    }
    
    // Read from stations file
    try {
      const stationsData = JSON.parse(fs.readFileSync(stationsFilePath, 'utf8'));
      
      return res.json({
        success: true,
        data: {
          stations: stationsData.stations || [],
          mock: stationsData.mock || false
        }
      });
    } catch (readError) {
      console.warn(`Error reading stations file: ${readError.message}`);
      
      return res.json({
        success: true,
        data: {
          stations: mockStations.stations,
          mock: true
        },
        message: 'Error reading stations. Using mock data.'
      });
    }
  } catch (error) {
    console.error(`Error getting stations: ${error.message}`);
    
    return res.json({
      success: true,
      data: {
        stations: [
          "Quick Mix",
          "Today's Hits",
          "Pop Hits",
          "Relaxing Instrumental",
          "Classic Rock",
          "Smooth Jazz"
        ],
        mock: true
      },
      message: 'Error loading stations. Using mock data.'
    });
  }
});

// Select station
app.post('/api/pianobar/select-station', async (req, res) => {
  try {
    const { stationId } = req.body;
    if (!stationId && stationId !== 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing stationId parameter'
      });
    }
    
    const result = await commandInterface.sendCommand(`s${stationId}`);
    res.json(result);
  } catch (error) {
    console.error(`Error selecting station: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Raw command endpoint
app.post('/api/pianobar/command', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Missing command parameter'
      });
    }
    
    const result = await commandInterface.sendCommand(command);
    res.json(result);
  } catch (error) {
    console.error(`Error sending command: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve test UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/test-pianobar.html'));
});

// Start the server
server.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(`Failed to start server: ${err.message}`);
  } else {
    console.log(`Direct Pianobar Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the test interface`);
    console.log(`API available at: http://localhost:${PORT}/api/pianobar/status`);
  }
});