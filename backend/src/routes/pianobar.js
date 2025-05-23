/**
 * Pianobar API Routes
 * 
 * Express routes for interacting with the Pianobar service
 * Uses the simplified PianobarCommandInterface with direct FIFO writes
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger').getModuleLogger('pianobar-routes');

// Import PianobarCommandInterface factory but don't create instance yet
console.log('[DEBUG] Importing createPianobarCommandInterface in routes');
const { createPianobarCommandInterface } = require('../services/PianobarCommandInterface');
console.log('[DEBUG] Successfully imported createPianobarCommandInterface in routes');

// Defer creation of command interface until first use
let commandInterface = null;

function getCommandInterface() {
  if (!commandInterface) {
    try {
      console.log('[DEBUG] Creating PianobarCommandInterface in routes (lazy initialization)');
      commandInterface = createPianobarCommandInterface(
        { 
          verbose: true,
          skipAsyncInit: true  // Skip async initialization to prevent blocking
        },
        null, // No RetryHelper
        null  // No ServiceWatchdog
      );
      console.log('[DEBUG] Successfully created PianobarCommandInterface in routes');
    } catch (error) {
      console.error(`[ERROR] Error creating PianobarCommandInterface in routes: ${error.message}`);
      console.error(error.stack);
      // Return a mock interface that logs errors but doesn't fail
      return {
        initialize: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        sendCommand: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        play: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        pause: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        next: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        love: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        selectStation: () => Promise.resolve({ success: false, error: 'Not initialized' }),
        quit: () => Promise.resolve({ success: false, error: 'Not initialized' })
      };
    }
  }
  return commandInterface;
}

// Status file path
const statusFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
const stationsFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');

// Initialize pianobar
router.post('/initialize', async (req, res) => {
  try {
    const cmd = getCommandInterface();
    const result = await cmd.initialize();
    res.json(result);
  } catch (error) {
    logger.error(`Error initializing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current status - verify actual process state and clear stale cache
router.get('/status', async (req, res) => {
  try {
    // Check if this is a silent request
    const silent = req.query.silent === 'true';
    
    // IMPORTANT: Always verify actual process state first
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    let actuallyRunning = false;
    try {
      const { stdout } = await execPromise('pgrep pianobar');
      actuallyRunning = stdout.trim().length > 0;
    } catch (error) {
      // pgrep returns exit code 1 when no processes found
      actuallyRunning = false;
    }
    
    if (!silent) {
      logger.debug(`Process verification: pianobar actually running = ${actuallyRunning}`);
    }
    
    // Read status from file
    let statusData = {
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false,
      updateTime: Date.now(),
      fromCache: true
    };
    
    if (fs.existsSync(statusFilePath)) {
      try {
        const cachedStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
        
        // Check if cached status disagrees with reality
        if (cachedStatus.isPianobarRunning && !actuallyRunning) {
          if (!silent) {
            logger.warn('Detected stale cache: status file indicates running but no pianobar process found');
          }
          
          // Clear the stale cache
          statusData = {
            status: 'stopped',
            isPianobarRunning: false,
            isPlaying: false,
            updateTime: Date.now(),
            stopTime: Date.now(),
            fromCache: false,
            note: 'Corrected stale cache based on process verification'
          };
          
          fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2));
          if (!silent) {
            logger.info('Cleared stale status cache - pianobar process not running');
          }
        } else {
          // Use cached data but ensure it reflects reality
          statusData = {
            ...cachedStatus,
            isPianobarRunning: actuallyRunning,
            isPlaying: actuallyRunning && cachedStatus.isPlaying,
            fromCache: true,
            updateTime: Date.now()
          };
        }
        
        if (!silent) {
          logger.debug(`Read status from file: ${JSON.stringify(statusData)}`);
        }
      } catch (parseError) {
        logger.warn(`Error parsing status file: ${parseError.message}`);
        // Use default status based on process verification
        statusData.isPianobarRunning = actuallyRunning;
        statusData.isPlaying = actuallyRunning;
        statusData.status = actuallyRunning ? 'playing' : 'stopped';
      }
    } else {
      // No status file - use process verification
      statusData.isPianobarRunning = actuallyRunning;
      statusData.isPlaying = actuallyRunning;
      statusData.status = actuallyRunning ? 'playing' : 'stopped';
      
      if (!silent) {
        logger.debug('Status file does not exist, using process verification');
      }
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
    // Get command interface and send quit command
    const cmd = getCommandInterface();
    const result = await cmd.quit();
    
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
    // Get command interface and send play command
    const cmd = getCommandInterface();
    const result = await cmd.play();
    
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
    // Get command interface and send pause command
    const cmd = getCommandInterface();
    const result = await cmd.pause();
    
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
    // Get command interface and send next command
    const cmd = getCommandInterface();
    const result = await cmd.next();
    res.json(result);
  } catch (error) {
    logger.error(`Error skipping to next song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Love - love current song
router.post('/love', async (req, res) => {
  try {
    // Get command interface and send love command
    const cmd = getCommandInterface();
    const result = await cmd.love();
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
    
    // Get command interface and send station selection command
    const cmd = getCommandInterface();
    const result = await cmd.selectStation(stationId);
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
    
    // Get command interface and send raw command
    const cmd = getCommandInterface();
    const result = await cmd.sendCommand(command);
    res.json(result);
  } catch (error) {
    logger.error(`Error sending command: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    // Create simplified health check that doesn't require command interface
    const fifoPath = path.join(process.env.HOME || '/home/monty', '.config/pianobar/ctl');
    
    // Check if FIFO exists
    let fifoExists = false;
    let isFifo = false;
    
    try {
      fifoExists = fs.existsSync(fifoPath);
      if (fifoExists) {
        isFifo = fs.statSync(fifoPath).isFIFO();
      }
    } catch (error) {
      logger.warn(`Error checking FIFO: ${error.message}`);
    }
    
    // Build health status
    const healthStatus = {
      status: fifoExists && isFifo ? 'ok' : 'warning',
      message: fifoExists && isFifo 
        ? 'Pianobar interface ready' 
        : 'Pianobar interface has issues with FIFO',
      details: {
        fifoExists,
        isFifo,
        fifoPath,
        commandInterfaceCreated: commandInterface !== null,
        lastUpdated: Date.now()
      }
    };
    
    res.json(healthStatus);
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