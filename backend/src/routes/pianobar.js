/**
 * Pianobar API Routes
 * 
 * Express routes for interacting with the Pianobar service
 * Uses the simplified PianobarCommandInterface with direct FIFO writes
 */

const express = require('express');
const router = express.Router();
const { createPianobarCommandInterface } = require('../services/PianobarCommandInterface');
const logger = require('../utils/logger').getModuleLogger('pianobar-routes');
const fs = require('fs');
const path = require('path');

// Get the command interface singleton instance with debug logging
let commandInterface;
try {
  console.log('About to get PianobarCommandInterface in routes');
  commandInterface = createPianobarCommandInterface(
    { verbose: true },
    null, // No RetryHelper
    null  // No ServiceWatchdog
  );
  console.log('Successfully got PianobarCommandInterface in routes');
} catch (error) {
  console.error(`Error getting PianobarCommandInterface in routes: ${error.message}`);
  console.error(error.stack);
}

// Status file path
const statusFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
const stationsFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');

// Initialize pianobar
router.post('/initialize', async (req, res) => {
  try {
    const result = await commandInterface.initialize();
    res.json(result);
  } catch (error) {
    logger.error(`Error initializing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current status - reads from the status file, doesn't check processes
router.get('/status', async (req, res) => {
  try {
    // Check if this is a silent request
    const silent = req.query.silent === 'true';
    
    // Read status from file instead of checking processes
    let statusData = {
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false,
      updateTime: Date.now(),
      fromCache: true
    };
    
    if (fs.existsSync(statusFilePath)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
        statusData.fromCache = true;
        
        if (!silent) {
          logger.debug(`Read status from file: ${JSON.stringify(statusData)}`);
        }
      } catch (parseError) {
        logger.warn(`Error parsing status file: ${parseError.message}`);
      }
    } else if (!silent) {
      logger.debug('Status file does not exist, using default status');
    }
    
    if (!silent) {
      logger.debug(`Status response data: ${JSON.stringify({
        isPianobarRunning: statusData.isPianobarRunning,
        isPlaying: statusData.isPlaying,
        status: statusData.status
      })}`);
    }
    
    res.json({
      success: true,
      data: statusData
    });
  } catch (error) {
    logger.error(`Error getting pianobar status: ${error.message}`);
    
    // Even on error, return a valid response with default data
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
router.post('/start', async (req, res) => {
  try {
    // Start pianobar process - this requires a shell command 
    // This is one command we can't do with just FIFO
    const { exec } = require('child_process');
    
    // Use nohup to ensure process continues after command completes
    exec('nohup pianobar > /tmp/pianobar_stdout.log 2> /tmp/pianobar_stderr.log &', async (error, stdout, stderr) => {
      if (error) {
        logger.error(`Error starting pianobar: ${error.message}`);
        return res.status(500).json({ 
          success: false, 
          message: `Failed to start pianobar: ${error.message}`,
          error: error.message
        });
      }
      
      // Update status file
      try {
        const statusData = {
          status: 'playing',
          isPianobarRunning: true,
          isPlaying: true,
          updateTime: Date.now(),
          startTime: Date.now()
        };
        
        fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      } catch (statusError) {
        logger.warn(`Error updating status file: ${statusError.message}`);
      }
      
      res.json({
        success: true,
        message: 'Pianobar started successfully',
        isPlaying: true
      });
    });
  } catch (error) {
    logger.error(`Error in start route: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop pianobar - send quit command
router.post('/stop', async (req, res) => {
  try {
    // Send quit command via the command interface
    const result = await commandInterface.quit();
    
    // Update status file regardless of command result
    try {
      const statusData = {
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        updateTime: Date.now(),
        stopTime: Date.now()
      };
      
      fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
    } catch (statusError) {
      logger.warn(`Error updating status file: ${statusError.message}`);
    }
    
    res.json({
      success: true,
      message: 'Pianobar stopped successfully',
      isPlaying: false,
      commandResult: result
    });
  } catch (error) {
    logger.error(`Error stopping pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Play - send play command
router.post('/play', async (req, res) => {
  try {
    // Send play command via the command interface
    const result = await commandInterface.play();
    
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
            logger.warn(`Error parsing status file: ${parseError.message}`);
          }
        }
        
        fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      } catch (statusError) {
        logger.warn(`Error updating status file: ${statusError.message}`);
      }
    }
    
    res.json(result);
  } catch (error) {
    logger.error(`Error playing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause - send pause command
router.post('/pause', async (req, res) => {
  try {
    // Send pause command via the command interface
    const result = await commandInterface.pause();
    
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
            logger.warn(`Error parsing status file: ${parseError.message}`);
          }
        }
        
        fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      } catch (statusError) {
        logger.warn(`Error updating status file: ${statusError.message}`);
      }
    }
    
    res.json(result);
  } catch (error) {
    logger.error(`Error pausing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Next - skip to next song
router.post('/next', async (req, res) => {
  try {
    // Send next command via the command interface
    const result = await commandInterface.next();
    res.json(result);
  } catch (error) {
    logger.error(`Error skipping to next song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Love - love current song
router.post('/love', async (req, res) => {
  try {
    // Send love command via the command interface
    const result = await commandInterface.love();
    res.json(result);
  } catch (error) {
    logger.error(`Error loving song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stations - read from the stations file
router.get('/stations', async (req, res) => {
  try {
    // Check if this is a silent request
    const silent = req.query.silent === 'true';
    
    // Check if stations file exists
    if (!fs.existsSync(stationsFilePath)) {
      // Return mock stations
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
      
      // Try to create the stations file with mock data
      try {
        fs.writeFileSync(stationsFilePath, JSON.stringify(mockStations, null, 2), 'utf8');
      } catch (writeError) {
        if (!silent) logger.warn(`Error writing mock stations file: ${writeError.message}`);
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
      logger.warn(`Error reading stations file: ${readError.message}`);
      
      // Return mock stations on error
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
        message: 'Error reading stations. Using mock data.'
      });
    }
  } catch (error) {
    logger.error(`Error getting stations: ${error.message}`);
    
    // Return mock stations on error
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

// Select station - send station selection command
router.post('/select-station', async (req, res) => {
  try {
    const { stationId } = req.body;
    if (!stationId && stationId !== 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing stationId parameter'
      });
    }
    
    // Send station selection command via the command interface
    const result = await commandInterface.selectStation(stationId);
    res.json(result);
  } catch (error) {
    logger.error(`Error selecting station: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send raw command 
router.post('/command', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing command parameter'
      });
    }
    
    // Send raw command via the command interface
    const result = await commandInterface.sendCommand(command);
    res.json(result);
  } catch (error) {
    logger.error(`Error sending command: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    // Check if command interface is initialized
    const healthStatus = {
      status: commandInterface.isInitialized ? 'ok' : 'warning',
      message: commandInterface.isInitialized 
        ? 'PianobarCommandInterface is initialized' 
        : 'PianobarCommandInterface is not yet initialized',
      details: {
        isInitialized: commandInterface.isInitialized,
        fifoPath: commandInterface.pianobarCtl,
        lastUpdated: Date.now()
      }
    };
    
    // Check if FIFO exists
    try {
      const fifoExists = fs.existsSync(commandInterface.pianobarCtl);
      let isFifo = false;
      
      if (fifoExists) {
        try {
          isFifo = fs.statSync(commandInterface.pianobarCtl).isFIFO();
        } catch (statError) {
          logger.warn(`Error checking if file is FIFO: ${statError.message}`);
        }
      }
      
      healthStatus.details.fifoExists = fifoExists;
      healthStatus.details.isFifo = isFifo;
      
      if (!fifoExists || !isFifo) {
        healthStatus.status = 'warning';
        healthStatus.message = 'FIFO issue detected';
      }
    } catch (error) {
      healthStatus.status = 'warning';
      healthStatus.details.fifoCheckError = error.message;
    }
    
    res.status(healthStatus.status === 'ok' ? 200 : 200).json(healthStatus);
  } catch (error) {
    logger.error(`Error checking pianobar health: ${error.message}`);
    res.status(200).json({ 
      status: 'warning', 
      message: error.message,
      details: {
        lastUpdated: Date.now()
      }
    });
  }
});

module.exports = router;