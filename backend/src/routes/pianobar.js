/**
 * Pianobar API Routes
 * 
 * Express routes for interacting with the Pianobar service
 */

const express = require('express');
const router = express.Router();
const { createPianobarService } = require('../utils/ServiceFactory');
const logger = require('../utils/logger').getModuleLogger('pianobar-routes');

// Get service instance
const pianobarService = createPianobarService();

// Initialize pianobar
router.post('/initialize', async (req, res) => {
  try {
    const result = await pianobarService.initialize();
    res.json(result);
  } catch (error) {
    logger.error(`Error initializing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current status - NEVER auto-starts pianobar
router.get('/status', async (req, res) => {
  try {
    // Check if this is a silent request
    const silent = req.query.silent === 'true';
    
    // CRITICAL: We only read cached status data, NEVER check actual processes
    const result = await pianobarService.getStatus(silent);
    
    // Extra safety check - ensure response will NEVER auto-start pianobar or report incorrect state
    if (result && result.data) {
      // Add a field to indicate this is from cached data, not live process checking
      result.data.fromCache = true;
      
      // Log exactly what we're returning
      if (!silent) {
        logger.debug(`Status response data: ${JSON.stringify({
          isPianobarRunning: result.data.isPianobarRunning,
          isPlaying: result.data.isPlaying,
          status: result.data.status
        })}`);
      }
    }
    
    if (!silent) {
      logger.debug('Status request handled from cache - not checking or auto-starting pianobar');
    }
    
    res.json(result);
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
    const result = await pianobarService.startPianobar();
    res.json(result);
  } catch (error) {
    logger.error(`Error starting pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop pianobar
router.post('/stop', async (req, res) => {
  try {
    const result = await pianobarService.stopPianobar();
    res.json(result);
  } catch (error) {
    logger.error(`Error stopping pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Play - checks if pianobar is running first (fixed to NOT auto-start)
router.post('/play', async (req, res) => {
  try {
    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return error without auto-starting
    if (!isPianobarRunning) {
      logger.warn('Play requested but pianobar is not running');
      return res.status(400).json({
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      });
    }
    
    // Only play if pianobar is already running
    // This relies on the fixed play() method that no longer auto-starts
    const result = await pianobarService.play();
    res.json(result);
  } catch (error) {
    logger.error(`Error playing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause - checks if pianobar is running first
router.post('/pause', async (req, res) => {
  try {
    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return error without auto-starting
    if (!isPianobarRunning) {
      logger.warn('Pause requested but pianobar is not running');
      return res.status(400).json({
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      });
    }
    
    // Only pause if pianobar is running
    const result = await pianobarService.pause();
    res.json(result);
  } catch (error) {
    logger.error(`Error pausing pianobar: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Next - checks if pianobar is running first
router.post('/next', async (req, res) => {
  try {
    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return error without auto-starting
    if (!isPianobarRunning) {
      logger.warn('Next requested but pianobar is not running');
      return res.status(400).json({
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      });
    }
    
    // Only send next command if pianobar is running
    const result = await pianobarService.next();
    res.json(result);
  } catch (error) {
    logger.error(`Error skipping to next song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Love - checks if pianobar is running first
router.post('/love', async (req, res) => {
  try {
    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return error without auto-starting
    if (!isPianobarRunning) {
      logger.warn('Love requested but pianobar is not running');
      return res.status(400).json({
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      });
    }
    
    // Only send love command if pianobar is running
    const result = await pianobarService.love();
    res.json(result);
  } catch (error) {
    logger.error(`Error loving song: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stations - NEVER auto-starts pianobar
router.get('/stations', async (req, res) => {
  try {
    // Check if this is a silent request
    const silent = req.query.silent === 'true';

    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return mock stations immediately without auto-starting
    if (!isPianobarRunning) {
      if (!silent) {
        logger.info('Stations requested but pianobar is not running - returning mock data');
      }
      
      // Get mock stations
      const mockResult = await pianobarService.getMockStations(silent);
      
      // Add info message to help user understand
      mockResult.message = 'Pianobar is not running. Start pianobar to see your stations.';
      
      res.json(mockResult);
      return;
    }
    
    // Only get real stations if pianobar is already running
    const result = await pianobarService.getStations(silent);
    
    if (!silent) {
      logger.debug('Stations request handled without auto-starting pianobar');
    }
    
    res.json(result);
  } catch (error) {
    logger.error(`Error getting stations: ${error.message}`);
    
    // Return mock stations on error
    res.status(200).json({
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
        message: 'Error loading stations. Please start pianobar first.'
      }
    });
  }
});

// Select station - checks if pianobar is running first
router.post('/select-station', async (req, res) => {
  try {
    const { stationId } = req.body;
    if (!stationId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing stationId parameter'
      });
    }
    
    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return error without auto-starting
    if (!isPianobarRunning) {
      logger.warn('Station selection requested but pianobar is not running');
      return res.status(400).json({
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      });
    }
    
    // Only select station if pianobar is running
    const result = await pianobarService.selectStation(stationId);
    res.json(result);
  } catch (error) {
    logger.error(`Error selecting station: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send raw command (admin only) - checks if pianobar is running first
router.post('/command', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing command parameter'
      });
    }
    
    // First check if pianobar is running
    const statusResult = await pianobarService.getStatus(true); // Use silent mode
    const isPianobarRunning = statusResult?.data?.isPianobarRunning || false;
    
    // If pianobar is not running, return error without auto-starting
    if (!isPianobarRunning) {
      logger.warn('Command requested but pianobar is not running');
      return res.status(400).json({
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      });
    }
    
    // Only send command if pianobar is running
    const result = await pianobarService.sendCommand(command);
    res.json(result);
  } catch (error) {
    logger.error(`Error sending command: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const result = await pianobarService.healthCheck();
    res.status(result.status === 'ok' ? 200 : 500).json(result);
  } catch (error) {
    logger.error(`Error checking pianobar health: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      details: {
        lastUpdated: Date.now()
      }
    });
  }
});

module.exports = router;