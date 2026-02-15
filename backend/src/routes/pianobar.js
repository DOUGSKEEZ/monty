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
// Node 22+ has native fetch - no need for node-fetch package
const PORT = process.env.PORT || 3001;

let cachedWebSocketService = null;

// Import PianobarCommandInterface factory but don't create instance yet
const { createPianobarCommandInterface } = require('../services/PianobarCommandInterface');

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
      commandInterface = createPianobarCommandInterface(
        {
          verbose: true,
          skipAsyncInit: true  // Skip async initialization to prevent blocking
        },
        null, // No RetryHelper
        null  // No ServiceWatchdog
      );
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
      actualPianobarService = createActualPianobarService();
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
    // Note: updateCentralState method doesn't exist on PianobarService
    // This is legacy code that can be safely ignored - state updates happen via WebSocket broadcasts instead
    logger.debug(`Central state update skipped (method not available) - source: ${source}`);
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
  const { exec } = require('child_process');

  try {
    // AudioBroker preamble: kill jukebox if active
    try {
      const AudioBroker = require('../services/AudioBroker');
      const broker = AudioBroker.getInstance();
      await broker.acquirePlayback('pianobar');
    } catch (brokerError) {
      logger.warn(`AudioBroker error (continuing): ${brokerError.message}`);
    }

    // Start pianobar the simple way that always worked
    logger.info('Starting pianobar');
    exec('nohup pianobar > /tmp/pianobar_stdout.log 2>&1 &');

    // Update status file (frontend/watchers rely on this)
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
    }

    res.json({
      success: true,
      message: 'Pianobar started successfully',
      isPlaying: true
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

    // Release AudioBroker playback
    try {
      const AudioBroker = require('../services/AudioBroker');
      const broker = AudioBroker.getInstance();
      broker.releasePlayback('pianobar');
    } catch (brokerError) {
      logger.warn(`AudioBroker release error: ${brokerError.message}`);
    }

    // Update status file
    try {
      const statusData = {
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        updateTime: Date.now(),
        stopTime: Date.now()
      };

      fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');

      // Update central state
      await updateCentralStateViaService({
        player: {
          isRunning: false,
          isPlaying: false,
          status: 'stopped'
        }
      }, 'route-stop');

      // Broadcast state update
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.broadcastStateUpdate();
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

// Refresh stations - simply re-read the stations file
router.post('/refresh-stations', async (req, res) => {
  try {
    // Just force a fresh read of the stations file
    // The file is updated automatically when pianobar sends usergetstations events
    if (fs.existsSync(stationsFilePath)) {
      const stationsData = JSON.parse(fs.readFileSync(stationsFilePath, 'utf8'));
      res.json({
        success: true,
        message: 'Stations refreshed from cache',
        data: {
          stations: stationsData.stations || [],
          lastUpdated: stationsData.lastUpdated || stationsData.fetchTime,
          count: (stationsData.stations || []).length
        }
      });
    } else {
      res.json({
        success: false,
        message: 'No stations file found. Stations will be available after pianobar fetches them.',
        data: { stations: [], count: 0 }
      });
    }
  } catch (error) {
    logger.error(`Error refreshing stations: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// NUCLEAR OPTION: Force kill pianobar process
router.post('/kill', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    logger.warn('🚨 NUCLEAR OPTION: Force killing all pianobar processes');
    
    // First, try to find pianobar processes
    let pids = [];
    try {
      const { stdout } = await execPromise('pgrep pianobar');
      pids = stdout.trim().split('\n').filter(pid => pid.length > 0);
    } catch (error) {
      // No processes found is not an error for this operation
    }
    
    if (pids.length === 0) {
      logger.info('No pianobar processes found to kill');
      
      // Still update status file to reflect stopped state
      const statusData = {
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        updateTime: Date.now(),
        killTime: Date.now(),
        note: 'Force killed (no processes found)'
      };
      fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
      
      return res.json({
        success: true,
        message: 'No pianobar processes were running',
        pidsKilled: [],
        processesFound: 0
      });
    }
    
    // Force kill all pianobar processes with SIGKILL
    let killedPids = [];
    let errors = [];
    
    for (const pid of pids) {
      try {
        await execPromise(`kill -9 ${pid}`);
        killedPids.push(pid);
        logger.info(`Force killed pianobar process PID: ${pid}`);
      } catch (killError) {
        logger.warn(`Failed to kill PID ${pid}: ${killError.message}`);
        errors.push(`PID ${pid}: ${killError.message}`);
      }
    }
    
    // Update status file to reflect killed state
    const statusData = {
      status: 'stopped',
      isPianobarRunning: false,
      isPlaying: false,
      updateTime: Date.now(),
      killTime: Date.now(),
      note: `Force killed ${killedPids.length} process(es)`
    };
    fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
    
    // Update central state
    await updateCentralStateViaService({
      player: {
        isRunning: false,
        isPlaying: false,
        status: 'stopped'
      }
    }, 'nuclear-kill');
    
    // Broadcast state update
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastStateUpdate();
      logger.debug('Broadcasted state update after nuclear kill');
    }
    
    res.json({
      success: true,
      message: `Successfully force-killed ${killedPids.length} pianobar process(es)`,
      pidsKilled: killedPids,
      processesFound: pids.length,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    logger.error(`Error in nuclear kill: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Nuclear kill failed'
    });
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
  lastUpdated: Date.now(),
  songStartTime: null // Track when current song started playing
};

// GET shared state for cross-device sync
router.get('/sync-state', (req, res) => {
  try {
    // Calculate real-time song progress if playing
    let currentState = { ...sharedState };
    if (currentState.shared.isPlaying && currentState.songStartTime && currentState.track.songDuration > 0) {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - currentState.songStartTime) / 1000);
      // Cap at song duration to prevent overflow
      currentState.track.songPlayed = Math.min(elapsedSeconds, currentState.track.songDuration);
    }
    
    res.json({
      success: true,
      state: currentState,
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
      // Detect when playback resumes (was not playing, now is playing)
      const wasPlaying = sharedState.shared.isPlaying;
      const nowPlaying = shared.isPlaying;
      
      sharedState.shared = { ...sharedState.shared, ...shared };
      logger.debug('Updated shared state:', shared);
      
      // If playback just resumed and we don't have a start time, set it now
      if (!wasPlaying && nowPlaying && !sharedState.songStartTime && sharedState.track.title) {
        sharedState.songStartTime = Date.now();
        logger.debug('Playback resumed - setting song start time');
      }
    }
    
    if (track) {
      // Detect new song by comparing titles
      const isNewSong = track.title && track.title !== sharedState.track.title;
      
      sharedState.track = { ...sharedState.track, ...track };
      logger.debug('Updated track info:', track.title || 'no title');
      
      // Set song start time when a new song begins
      if (isNewSong) {
        sharedState.songStartTime = Date.now();
        logger.debug(`New song detected: "${track.title}" - setting start time`);
      }
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

// Get station modes - ALWAYS fetches fresh from pianobar (modes are station-specific!)
router.get('/modes', async (req, res) => {
  try {
    const pianobarService = getActualPianobarService();

    if (!pianobarService || typeof pianobarService.getStationModes !== 'function') {
      logger.error('PianobarService not available or missing getStationModes method');
      return res.status(500).json({
        success: false,
        message: 'Pianobar service not available',
        modes: [],
        activeMode: null,
        stationId: null,
        stationName: null
      });
    }

    // Always fetch fresh modes from pianobar (modes vary by station!)
    logger.info('Fetching fresh station modes from pianobar');
    const result = await pianobarService.getStationModes();

    if (!result.success) {
      logger.warn(`Failed to get station modes: ${result.message}`);
      return res.json({
        success: false,
        message: result.message || 'Failed to fetch modes',
        modes: [],
        activeMode: null,
        stationId: result.stationId,
        stationName: result.stationName
      });
    }

    logger.info(`Successfully fetched ${result.modes.length} modes for "${result.stationName}", active: ${result.activeMode?.name || 'none'}`);

    res.json({
      success: true,
      modes: result.modes,
      activeMode: result.activeMode,
      stationId: result.stationId,
      stationName: result.stationName
    });
  } catch (error) {
    logger.error(`Error in /modes endpoint: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error fetching station modes',
      modes: [],
      activeMode: null,
      stationId: null,
      stationName: null
    });
  }
});

// Select a station mode
router.post('/mode', async (req, res) => {
  try {
    const { modeId } = req.body;

    // Validate modeId
    if (typeof modeId !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid modeId parameter'
      });
    }

    const pianobarService = getActualPianobarService();

    if (!pianobarService || typeof pianobarService.selectMode !== 'function') {
      logger.error('PianobarService not available or missing selectMode method');
      return res.status(500).json({
        success: false,
        message: 'Pianobar service not available'
      });
    }

    logger.info(`Selecting station mode ${modeId}`);
    const result = await pianobarService.selectMode(modeId);

    if (!result.success) {
      logger.warn(`Failed to select mode: ${result.message}`);
      return res.json({
        success: false,
        message: result.message || 'Failed to select mode'
      });
    }

    logger.info(`Successfully selected mode ${modeId}`);

    res.json({
      success: true,
      message: `Mode selected successfully`,
      modeId: modeId
    });
  } catch (error) {
    logger.error(`Error in /mode endpoint: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error selecting station mode'
    });
  }
});

module.exports = router;