const express = require('express');
const router = express.Router();
const musicService = require('../services/musicService');
const logger = require('../utils/logger').getModuleLogger('music-routes');

// Get music player status
router.get('/status', async (req, res) => {
  try {
    // Create a timeout for the entire route
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        logger.warn('Status route handler timed out, returning default status');
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
      musicService.getStatus(),
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
    // Create a timeout for the entire route
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        logger.warn('Stations route handler timed out, returning mock stations');
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
            routeTimedOut: true
          }
        });
      }, 3000); // 3 second route timeout
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
        error: 'Failed to get stations'
      }
    });
  }
});

// Start music player
router.post('/start', async (req, res) => {
  try {
    const connectBluetooth = req.body.connectBluetooth !== false;
    
    // Start with a delay to allow response to be sent
    const result = await musicService.startPianobar(connectBluetooth);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error starting music player: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to start music player'
    });
  }
});

// Stop music player
router.post('/stop', async (req, res) => {
  try {
    const disconnectBluetooth = req.body.disconnectBluetooth !== false;
    const result = await musicService.stopPianobar(disconnectBluetooth);
    
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
    
    const result = await musicService.sendCommand(command);
    
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