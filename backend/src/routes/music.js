const express = require('express');
const router = express.Router();
const musicService = require('../services/musicService');
const logger = require('../utils/logger').getModuleLogger('music-routes');

// Get music player status
router.get('/status', async (req, res) => {
  try {
    // Check if this is a background poll request (frequent polls from UI)
    const isSilent = req.query.silent === 'true' || req.query.background === 'true';
    
    // Create a timeout for the entire route
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        if (!isSilent) logger.debug('Status route handler timed out, returning default status');
        resolve({
          success: true,
          data: {
            status: 'unknown',
            isPianobarRunning: false,
            isPlaying: false,
            isBluetoothConnected: false,
            routeTimedOut: true
          }
        });
      }, 3000); // 3 second route timeout
    });
    
    // Race the actual status call against the timeout
    const result = await Promise.race([
      musicService.getStatus(isSilent),
      timeoutPromise
    ]);
    
    // Always return a 200 with the best available status information
    res.json(result);
  } catch (error) {
    logger.error(`Error getting music status: ${error.message}`);
    // Still return a 200 with fallback data to prevent client errors
    res.json({
      success: true,
      data: {
        status: 'unknown',
        isPianobarRunning: false,
        isPlaying: false,
        isBluetoothConnected: false,
        error: 'Failed to get music status'
      }
    });
  }
});

// Get list of stations
router.get('/stations', async (req, res) => {
  try {
    // Check if this is a background poll request
    const silent = req.query.silent === 'true' || req.query.background === 'true';
    
    // First check if pianobar is running (use silent mode to reduce logs)
    const statusResult = await musicService.getStatus(silent);
    const isPianobarRunning = statusResult?.data?.isPianobarRunning;
    
    // If pianobar is not running, immediately return mock stations
    if (!isPianobarRunning) {
      if (!silent) logger.debug('Stations requested but pianobar is not running, returning mock data');
      return res.json({
        success: true,
        data: {
          stations: {
            stations: [
              "Quick Mix",
              "Today's Hits",
              "Pop Hits",
              "Relaxing Instrumental",
              "Classic Rock",
              "Smooth Jazz"
            ]
          },
          mock: true,
          message: 'Start the music player to see your stations'
        }
      });
    }
    
    // Create a timeout for the entire route (only if pianobar is running)
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        if (!silent) logger.debug('Stations route handler timed out, returning mock stations');
        resolve({
          success: true,
          data: {
            stations: {
              stations: [
                "Quick Mix",
                "Today's Hits",
                "Pop Hits",
                "Relaxing Instrumental",
                "Classic Rock",
                "Smooth Jazz"
              ]
            },
            mock: true,
            routeTimedOut: true,
            message: 'Station data is taking too long to load. Try again later.'
          }
        });
      }, 5000); // 5 second route timeout - longer to give a better chance
    });
    
    // Race the actual stations call against the timeout
    const result = await Promise.race([
      musicService.getStations(),
      timeoutPromise
    ]);
    
    // Always return a 200 with the best available stations information
    res.json(result);
  } catch (error) {
    logger.error(`Error getting stations: ${error.message}`);
    // Still return a 200 with mock data to prevent client errors
    res.json({
      success: true,
      data: {
        stations: {
          stations: [
            "Quick Mix",
            "Today's Hits",
            "Pop Hits",
            "Relaxing Instrumental",
            "Classic Rock",
            "Smooth Jazz"
          ]
        },
        mock: true,
        error: 'Failed to get stations',
        message: 'Error loading stations. Try starting the player again.'
      }
    });
  }
});

// Start music player
router.post('/start', async (req, res) => {
  try {
    const connectBluetooth = req.body.connectBluetooth !== false;
    const silent = req.query.silent === 'true' || req.body.silent === true;
    
    // Create a race with a timeout to ensure we always return something
    const startPromise = musicService.startPianobar(connectBluetooth, silent);
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        if (!silent) logger.warn('Start music player route timed out, returning optimistic response');
        resolve({
          success: true,
          message: 'Music player is starting in the background',
          isPlaying: true,
          background: true
        });
      }, 5000); // 5 second timeout for the route
    });
    
    // Wait for either completion or timeout
    const result = await Promise.race([startPromise, timeoutPromise]);
    
    // Always return a 200 response to avoid UI errors
    res.json(result);
  } catch (error) {
    // Even on error, return a successful response to avoid UI blocking
    logger.error(`Error starting music player: ${error.message}`);
    res.json({
      success: true, // Return success to avoid UI errors
      message: 'Music player is starting in the background',
      isPlaying: true,
      background: true,
      error: 'Error in start process, but continuing in background'
    });
  }
});

// Stop music player
router.post('/stop', async (req, res) => {
  try {
    const disconnectBluetooth = req.body.disconnectBluetooth !== false;
    const isSilent = req.query.silent === 'true' || req.body.silent === true;
    
    const result = await musicService.stopPianobar(disconnectBluetooth, isSilent);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error stopping music player: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to stop music player'
    });
  }
});

// Send control command to music player
router.post('/control', async (req, res) => {
  try {
    const { command } = req.body;
    const silent = req.query.silent === 'true' || req.body.silent === true;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'command is required'
      });
    }
    
    // Validate command
    const validCommands = ['p', 'n', '+', 's', 'P', 'S'];
    let isValid = false;
    
    if (validCommands.includes(command)) {
      isValid = true;
    } else if (command.startsWith('s ') && command.length > 2) {
      // Station change command
      isValid = true;
    }
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid command'
      });
    }
    
    const result = await musicService.sendCommand(command, silent);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error sending control command: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to send control command'
    });
  }
});

// Connect to Bluetooth speaker
router.post('/bluetooth/connect', async (req, res) => {
  try {
    const result = await musicService.connectBluetooth();
    
    if (result) {
      res.json({
        success: true,
        message: 'Connected to Bluetooth speaker'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to connect to Bluetooth speaker'
      });
    }
  } catch (error) {
    logger.error(`Error connecting to Bluetooth speaker: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to Bluetooth speaker'
    });
  }
});

// Disconnect from Bluetooth speaker
router.post('/bluetooth/disconnect', async (req, res) => {
  try {
    const result = await musicService.disconnectBluetooth();
    
    if (result) {
      res.json({
        success: true,
        message: 'Disconnected from Bluetooth speaker'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect from Bluetooth speaker'
      });
    }
  } catch (error) {
    logger.error(`Error disconnecting from Bluetooth speaker: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect from Bluetooth speaker'
    });
  }
});

module.exports = router;