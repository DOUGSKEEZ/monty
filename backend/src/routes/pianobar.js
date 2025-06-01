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
const fetch = require('node-fetch');
const PORT = process.env.PORT || 3001;

let cachedWebSocketService = null;

// Import PianobarCommandInterface factory but don't create instance yet
console.log('[DEBUG] Importing createPianobarCommandInterface in routes');
const { createPianobarCommandInterface } = require('../services/PianobarCommandInterface');
console.log('[DEBUG] Successfully imported createPianobarCommandInterface in routes');

// Import ServiceFactory to access actual PianobarService
const { createActualPianobarService } = require('../utils/ServiceFactory');

// Import ServiceRegistry to access WebSocket service
const serviceRegistry = require('../utils/ServiceRegistry');

// Defer creation of command interface until first use
let commandInterface = null;
let actualPianobarService = null;

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

function getActualPianobarService() {
  if (!actualPianobarService) {
    try {
      console.log('[DEBUG] Creating actual PianobarService in routes (lazy initialization)');
      actualPianobarService = createActualPianobarService();
      console.log('[DEBUG] Successfully created actual PianobarService in routes');
    } catch (error) {
      console.error(`[ERROR] Error creating actual PianobarService in routes: ${error.message}`);
      console.error(error.stack);
      // Return a mock service that logs errors but doesn't fail
      return {
        getState: () => ({
          version: 0,
          timestamp: Date.now(),
          player: { isRunning: false, isPlaying: false, status: 'stopped' },
          currentSong: { title: null, artist: null, album: null, stationName: null, songDuration: null, songPlayed: null, rating: null, coverArt: null, detailUrl: null },
          stations: []
        })
      };
    }
  }
  return actualPianobarService;
}

// Helper function to update central state through PianobarService
async function updateCentralStateViaService(updates, source) {
  try {
    const pianobarService = getActualPianobarService();
    if (pianobarService && typeof pianobarService.updateCentralState === 'function') {
      await pianobarService.updateCentralState(updates, source);
      logger.debug(`Central state updated from route: ${source}`);
      return true;
    }
    logger.warn('Could not update central state: PianobarService not available');
    return false;
  } catch (error) {
    logger.error(`Error updating central state: ${error.message}`);
    return false;
  }
}

function getWebSocketService() {
  try {
    // Return cached instance if available
    if (cachedWebSocketService) {
      return cachedWebSocketService;
    }
    
    // Try to get from service registry metadata
    const services = serviceRegistry.getAllServices();
    
    for (const service of services) {
      if (service.name === 'PianobarWebsocketService') {
        // Check if service has a getInstance method
        if (service.getInstance && typeof service.getInstance === 'function') {
          cachedWebSocketService = service.getInstance();
          logger.info('[DEBUG-WS] Got instance via getInstance()');
          return cachedWebSocketService;
        }
        
        // Check if service has instance property in checkHealth
        if (service.checkHealth && typeof service.checkHealth === 'function') {
          // The checkHealth function might have access to the instance
          logger.info('[DEBUG-WS] Service has checkHealth, but no direct instance access');
        }
        
        // As a last resort, check if the service registration included the instance
        // This might be stored elsewhere in the registry
        logger.info('[DEBUG-WS] No getInstance method or instance property found');
        break;
      }
    }
    
    // If not found, try to get it directly from the WebSocket integration
    try {
      const { getWebSocketServiceInstance } = require('../services/PianobarWebsocketIntegration');
      if (getWebSocketServiceInstance) {
        cachedWebSocketService = getWebSocketServiceInstance();
        logger.info('[DEBUG-WS] Got instance from PianobarWebsocketIntegration');
        return cachedWebSocketService;
      }
    } catch (err) {
      logger.debug('[DEBUG-WS] Could not import getWebSocketServiceInstance');
    }
    
    logger.warn('[DEBUG-WS] WebSocket service instance not found');
    return null;
  } catch (error) {
    logger.error(`[DEBUG-WS] Error getting WebSocket service: ${error.message}`);
    return null;
  }
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

// Get simplified state (combines status and sync state)
router.get('/state', async (req, res) => {
  try {
    // Get status from status endpoint data
    let statusData = {
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false
    };
    
    if (fs.existsSync(statusFilePath)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
      } catch (parseError) {
        logger.warn(`Error parsing status file: ${parseError.message}`);
      }
    }
    
    // Get the shared state from the GET endpoint to ensure consistency
    try {
      const sharedStateResponse = await fetch(`http://localhost:${PORT}/api/pianobar/sync-state`).then(r => r.json());
      const currentSharedState = sharedStateResponse.success ? sharedStateResponse.state : {
        track: {
          title: '',
          artist: '',
          album: '',
          stationName: '',
          songDuration: 0,
          songPlayed: 0,
          rating: 0,
          coverArt: '',
          detailUrl: ''
        }
      };
      
      // Combine with shared state for cross-device info
      const combinedState = {
        version: 1,
        timestamp: Date.now(),
        player: {
          isRunning: statusData.isPianobarRunning || false,
          isPlaying: statusData.isPlaying || false,
          status: statusData.status || 'stopped'
        },
        currentSong: {
          title: currentSharedState.track.title || null,
          artist: currentSharedState.track.artist || null,
          album: currentSharedState.track.album || null,
          stationName: currentSharedState.track.stationName || null,
          songDuration: currentSharedState.track.songDuration || null,
          songPlayed: currentSharedState.track.songPlayed || null,
          rating: currentSharedState.track.rating || null,
          coverArt: currentSharedState.track.coverArt || null,
          detailUrl: currentSharedState.track.detailUrl || null
        },
        stations: []
      };
      
      res.json({
        success: true,
        data: combinedState
      });
    } catch (fetchError) {
      logger.warn(`Error fetching shared state: ${fetchError.message}`);
      
      // Fallback to basic state without track info
      const combinedState = {
        version: 1,
        timestamp: Date.now(),
        player: {
          isRunning: statusData.isPianobarRunning || false,
          isPlaying: statusData.isPlaying || false,
          status: statusData.status || 'stopped'
        },
        currentSong: {
          title: null,
          artist: null,
          album: null,
          stationName: null,
          songDuration: null,
          songPlayed: null,
          rating: null,
          coverArt: null,
          detailUrl: null
        },
        stations: []
      };
      
      res.json({
        success: true,
        data: combinedState
      });
    }
  } catch (error) {
    logger.error(`Error getting simplified state: ${error.message}`);
    
    // Return default state on error
    res.status(200).json({
      success: true,
      data: {
        version: 0,
        timestamp: Date.now(),
        player: {
          isRunning: false,
          isPlaying: false,
          status: 'stopped'
        },
        currentSong: {
          title: null,
          artist: null,
          album: null,
          stationName: null,
          songDuration: null,
          songPlayed: null,
          rating: null,
          coverArt: null,
          detailUrl: null
        },
        stations: [],
        error: error.message
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
        
        // Check error logs
        try {
          const stderrContent = fs.readFileSync('/tmp/pianobar_stderr.log', 'utf8');
          logger.error(`Pianobar stderr: ${stderrContent}`);
        } catch (readErr) {
          logger.error(`Could not read stderr log: ${readErr.message}`);
        }
        
        return res.status(500).json({ 
          success: false, 
          message: `Failed to start pianobar: ${error.message}`,
          error: error.message
        });
      }
      
      // Log the PID for debugging
      logger.info(`Started pianobar command, stdout: ${stdout}, stderr: ${stderr}`);
      
      // Add a delay and then check if pianobar actually started
      setTimeout(async () => {
        try {
          const { exec: execCheck } = require('child_process');
          execCheck('pgrep pianobar', (err, stdout) => {
            if (err || !stdout.trim()) {
              logger.error('Pianobar process not found after start attempt');
              
              // Try to read error log
              try {
                const stderrContent = fs.readFileSync('/tmp/pianobar_stderr.log', 'utf8').slice(-500);
                logger.error(`Recent pianobar stderr: ${stderrContent}`);
              } catch (readErr) {
                logger.error(`Could not read stderr log: ${readErr.message}`);
              }
            } else {
              logger.info(`Pianobar running with PID(s): ${stdout.trim()}`);
            }
          });
        } catch (checkErr) {
          logger.error(`Error checking pianobar status: ${checkErr.message}`);
        }
      }, 3000);
      
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
        
        // Update central state
        await updateCentralStateViaService({
          player: {
            isRunning: true,
            isPlaying: true,
            status: 'playing'
          }
        }, 'route-start');
        
        // Broadcast state update to all connected clients
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.broadcastStateUpdate();
          logger.debug('Broadcasted state update after start command');
        }
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
    // Check if pianobar is actually running first
    const statusResult = await fetch(`http://localhost:${PORT}/api/pianobar/status?silent=true`).then(r => r.json());
    if (!statusResult.data.isPianobarRunning) {
      logger.info('Pianobar already stopped, skipping quit command');
      return res.json({
        success: true,
        message: 'Pianobar is already stopped',
        isPlaying: false
      });
    }
    
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
      
      // Update central state BEFORE broadcasting
      await updateCentralStateViaService({
        player: {
          isRunning: false,
          isPlaying: false,
          status: 'stopped'
        }
      }, 'route-stop');
      
      // Broadcast state update to all connected clients
      logger.info('[DEBUG-STOP] About to get WebSocket service');
      const wsService = getWebSocketService();
      logger.info('[DEBUG-STOP] WebSocket service result:', !!wsService);
      if (wsService) {
        logger.info('[DEBUG-STOP] Calling broadcastStateUpdate');
        wsService.broadcastStateUpdate();
        logger.debug('Broadcasted state update after stop command');
      } else {
        logger.warn('[DEBUG-STOP] No WebSocket service found - cannot broadcast');
      }
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
        
        // Update central state
        await updateCentralStateViaService({
          player: {
            isRunning: true,
            isPlaying: true,
            status: 'playing'
          }
        }, 'route-play');
        
        // Broadcast state update to all connected clients
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.broadcastStateUpdate();
          logger.debug('Broadcasted state update after play command');
        }
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
        
        // Update central state
        await updateCentralStateViaService({
          player: {
            isRunning: true,
            isPlaying: false,
            status: 'paused'
          }
        }, 'route-pause');
        
        // Broadcast state update to all connected clients
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.broadcastStateUpdate();
          logger.debug('Broadcasted state update after pause command');
        }
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
    
    // Update central state if command was successful
    if (result.success) {
      await updateCentralStateViaService({
        currentSong: {
          rating: 1  // 1 means loved
        }
      }, 'route-love');
    }
    
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

// Debug endpoint to check event files and WebSocket service
router.get('/debug-events', async (req, res) => {
  try {
    const eventDir = path.join(process.env.HOME || '/home/monty', '.config/pianobar/event_data');
    
    let files = [];
    let error = null;
    
    try {
      files = fs.readdirSync(eventDir);
    } catch (readError) {
      error = `Cannot read event directory: ${readError.message}`;
    }
    
    const fileDetails = files.slice(-10).map(f => {
      try {
        const filePath = path.join(eventDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          mtime: stats.mtime,
          age: Date.now() - stats.mtime.getTime()
        };
      } catch (statError) {
        return {
          name: f,
          error: statError.message
        };
      }
    });
    
    res.json({ 
      eventDir,
      totalFiles: files.length,
      recentFiles: fileDetails,
      error,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error(`Debug events error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current song and real-time progress from pianobar events
router.get('/current-track', async (req, res) => {
  try {
    const eventDir = path.join(process.env.HOME || '/home/monty', '.config/pianobar/event_data');
    
    // Find the most recent songstart event
    let mostRecentSongStart = null;
    let songStartTime = 0;
    
    try {
      const files = fs.readdirSync(eventDir);
      logger.debug(`Found ${files.length} files in event directory`);
      
      const songStartFiles = files
        .filter(f => f.startsWith('songstart-') && f.endsWith('.json'))
        .map(f => {
          const timestamp = parseInt(f.replace('songstart-', '').replace('.json', ''));
          return { filename: f, timestamp };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      
      logger.debug(`Found ${songStartFiles.length} songstart files`);
      
      if (songStartFiles.length > 0) {
        const latestFile = songStartFiles[0];
        const filePath = path.join(eventDir, latestFile.filename);
        logger.debug(`Reading latest songstart file: ${filePath}`);
        
        // Read and clean the JSON content
        let fileContent = fs.readFileSync(filePath, 'utf8');
        // Replace curly quotes with straight quotes for JSON parsing
        fileContent = fileContent.replace(/[""]/g, '"').replace(/['']/g, "'");
        
        mostRecentSongStart = JSON.parse(fileContent);
        songStartTime = latestFile.timestamp;
      }
    } catch (readError) {
      logger.error(`Error reading event files: ${readError.message}`);
      return res.status(500).json({
        success: false,
        error: `Could not read event files: ${readError.message}`
      });
    }
    
    if (!mostRecentSongStart) {
      return res.json({
        success: false,
        message: 'No recent song events found'
      });
    }
    
    // Calculate current progress
    const now = Date.now();
    const elapsedMs = now - songStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const songDuration = parseInt(mostRecentSongStart.songDuration) || 0;
    const currentProgress = Math.min(elapsedSeconds, songDuration);
    
    const currentTrack = {
      title: mostRecentSongStart.title || '',
      artist: mostRecentSongStart.artist || '',
      album: mostRecentSongStart.album || '',
      stationName: mostRecentSongStart.stationName || '',
      songDuration: songDuration,
      songPlayed: currentProgress,
      rating: parseInt(mostRecentSongStart.rating) || 0,
      coverArt: mostRecentSongStart.coverArt || '',
      detailUrl: mostRecentSongStart.detailUrl || '',
      eventTimestamp: songStartTime,
      calculatedAt: now
    };
    
    res.json({
      success: true,
      track: currentTrack,
      debug: {
        elapsedMs,
        elapsedSeconds,
        songStartTime: new Date(songStartTime).toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error getting current track: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Debug endpoint to check pianobar logs
router.get('/debug-logs', async (req, res) => {
  try {
    const logs = {};
    
    // Read stdout
    try {
      logs.stdout = fs.readFileSync('/tmp/pianobar_stdout.log', 'utf8').slice(-1000);
    } catch (e) {
      logs.stdout = `Error reading stdout: ${e.message}`;
    }
    
    // Read stderr
    try {
      logs.stderr = fs.readFileSync('/tmp/pianobar_stderr.log', 'utf8').slice(-1000);
    } catch (e) {
      logs.stderr = `Error reading stderr: ${e.message}`;
    }
    
    // Check if process is running
    const { exec } = require('child_process');
    exec('pgrep pianobar', (err, stdout) => {
      logs.isRunning = !err && stdout.trim().length > 0;
      logs.pids = stdout ? stdout.trim().split('\n') : [];
      
      res.json({
        success: true,
        logs,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Simple state management for cross-device sync
let sharedState = {
  shared: {
    isRunning: false,
    isPlaying: false,
    currentStation: '',
    bluetoothConnected: false
  },
  track: {
    title: '',
    artist: '',
    album: '',
    stationName: '',
    songDuration: 0,
    songPlayed: 0,
    rating: 0,
    coverArt: '',
    detailUrl: ''
  },
  lastUpdated: Date.now()
};

// GET shared state for cross-device sync
router.get('/sync-state', (req, res) => {
  try {
    res.json({
      success: true,
      state: sharedState,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error(`Error getting shared state: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST update shared state for cross-device sync
router.post('/sync-state', (req, res) => {
  try {
    const { shared, track } = req.body;
    
    if (shared) {
      sharedState.shared = { ...sharedState.shared, ...shared };
      logger.debug('Updated shared state:', shared);
    }
    
    if (track) {
      sharedState.track = { ...sharedState.track, ...track };
      logger.debug('Updated track info:', track.title || 'no title');
    }
    
    sharedState.lastUpdated = Date.now();
    
    res.json({
      success: true,
      state: sharedState,
      timestamp: sharedState.lastUpdated
    });
  } catch (error) {
    logger.error(`Error updating shared state: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;