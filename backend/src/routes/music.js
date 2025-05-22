const express = require('express');
const router = express.Router();
const { createMusicService } = require('../utils/ServiceFactory');
const logger = require('../utils/logger').getModuleLogger('music-routes');
const prometheusMetrics = require('../services/PrometheusMetricsService');

// Get music service instance
const musicService = createMusicService();

// Get music player status
router.get('/status', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('GET', '/api/music/status');
    
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
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/music/status', 200, responseTime);
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
    
    // Record error
    prometheusMetrics.incrementErrorCount('GET', '/api/music/status', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/music/status', 200, responseTime);
  }
});

// Get list of stations
router.get('/stations', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('GET', '/api/music/stations');
    
    // Check if this is a background poll request
    const silent = req.query.silent === 'true' || req.query.background === 'true';
    
    // Check if we should use the predefined stations list from CSV
    const useProvidedStations = req.query.useProvided === 'true';
    
    // First check if pianobar is running (use silent mode to reduce logs)
    const statusResult = await musicService.getStatus(silent);
    const isPianobarRunning = statusResult?.data?.isPianobarRunning;
    
    // If using provided stations list or pianobar is not running
    if (useProvidedStations || !isPianobarRunning) {
      if (!silent) {
        if (useProvidedStations) {
          logger.debug('Using provided stations list from CSV');
        } else {
          logger.debug('Stations requested but pianobar is not running, returning mock data');
        }
      }
      
      // Try to read the stations CSV file
      try {
        const fs = require('fs');
        const path = require('path');
        const csvPath = path.resolve(process.env.HOME || '/home/monty', 'monty/docs/mystations.csv');
        
        if (fs.existsSync(csvPath)) {
          const csvData = fs.readFileSync(csvPath, 'utf8');
          const lines = csvData.split('\n').filter(line => line.trim() !== '');
          
          // Skip header row and parse each line
          const stations = [];
          const stationIds = [];
          
          for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length >= 2) {
              const stationName = columns[0].trim();
              const stationId = columns[1].trim();
              stations.push(stationName);
              stationIds.push(stationId);
            }
          }
          
          const result = {
            success: true,
            data: {
              stations: {
                stations: stations,
                stationIds: stationIds
              },
              source: 'csv',
              message: useProvidedStations ? 'Using provided stations list' : 'Start the music player to see your stations'
            }
          };
          
          res.json(result);
          
          // Record response time
          const responseTime = Date.now() - routeStartTime;
          prometheusMetrics.recordResponseTime('GET', '/api/music/stations', 200, responseTime);
          
          return;
        }
      } catch (csvError) {
        logger.warn(`Error reading stations CSV: ${csvError.message}, falling back to default list`);
      }
      
      // Fallback to default stations list
      const result = {
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
      };
      
      res.json(result);
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('GET', '/api/music/stations', 200, responseTime);
      
      return;
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
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/music/stations', 200, responseTime);
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
    
    // Record error
    prometheusMetrics.incrementErrorCount('GET', '/api/music/stations', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/music/stations', 200, responseTime);
  }
});

// Start music player
router.post('/start', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/music/start');
    
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
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/start', 200, responseTime);
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
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/music/start', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/start', 200, responseTime);
  }
});

// Stop music player
router.post('/stop', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/music/stop');
    
    const disconnectBluetooth = req.body.disconnectBluetooth !== false;
    const isSilent = req.query.silent === 'true' || req.body.silent === true;
    
    const result = await musicService.stopPianobar(disconnectBluetooth, isSilent);
    
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/stop', 200, responseTime);
  } catch (error) {
    logger.error(`Error stopping music player: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to stop music player'
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/music/stop', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/stop', 500, responseTime);
  }
});

// Control music player - enhanced version supporting different actions
router.post('/control', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/music/control');
    
    const { action, options, command } = req.body;
    const silent = req.query.silent === 'true' || req.body.silent === true;
    
    // Legacy support - if command is provided directly
    if (command && !action) {
      logger.warn('Legacy command format detected - use action/options format instead');
      
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
        const result = {
          success: false,
          error: 'Invalid command'
        };
        res.status(400).json(result);
        
        // Record response time
        const responseTime = Date.now() - routeStartTime;
        prometheusMetrics.recordResponseTime('POST', '/api/music/control', 400, responseTime);
        
        return;
      }
      
      const result = await musicService.sendCommand(command, silent);
      res.json(result);
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('POST', '/api/music/control', 200, responseTime);
      
      return;
    }
    
    // New action-based API
    if (!action) {
      const result = {
        success: false,
        error: 'Action parameter is required'
      };
      res.status(400).json(result);
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('POST', '/api/music/control', 400, responseTime);
      
      return;
    }
    
    let result;
    
    switch (action) {
      case 'start':
        result = await musicService.startPianobar(
          options?.connectBluetooth !== false, // Default to true if not specified
          options?.silent === true || silent
        );
        break;
        
      case 'stop':
        result = await musicService.stopPianobar(
          options?.disconnectBluetooth !== false, // Default to true if not specified
          options?.silent === true || silent
        );
        break;
        
      case 'command':
        if (!options || !options.command) {
          const errorResult = {
            success: false,
            error: 'Command parameter is required'
          };
          res.status(400).json(errorResult);
          
          // Record response time
          const responseTime = Date.now() - routeStartTime;
          prometheusMetrics.recordResponseTime('POST', '/api/music/control', 400, responseTime);
          
          return;
        }
        
        // Validate command
        const validCommands = ['p', 'n', '+', 's', 'P', 'S'];
        let isValid = false;
        
        if (validCommands.includes(options.command)) {
          isValid = true;
        } else if (options.command.startsWith('s ') && options.command.length > 2) {
          // Station change command
          isValid = true;
        }
        
        if (!isValid) {
          const errorResult = {
            success: false,
            error: 'Invalid command'
          };
          res.status(400).json(errorResult);
          
          // Record response time
          const responseTime = Date.now() - routeStartTime;
          prometheusMetrics.recordResponseTime('POST', '/api/music/control', 400, responseTime);
          
          return;
        }
        
        result = await musicService.sendCommand(
          options.command, 
          options.silent === true || silent
        );
        break;
        
      case 'connectBluetooth':
        result = await musicService.connectBluetooth(
          options?.checkInitNeeded !== false, // Default to true if not specified
          options?.silent === true || silent
        );
        // Format the response for the frontend
        result = {
          success: !!result, // Convert to boolean
          message: result ? 'Successfully connected to Bluetooth speaker' : 'Failed to connect to Bluetooth speaker'
        };
        break;
        
      case 'disconnectBluetooth':
        result = await musicService.disconnectBluetooth();
        // Format the response for the frontend
        result = {
          success: true, // Always return success to prevent UI blocking
          message: 'Bluetooth disconnection process completed'
        };
        break;
        
      case 'play':
        result = await musicService.play();
        break;
        
      case 'pause':
        result = await musicService.pause();
        break;
        
      case 'next':
        result = await musicService.next();
        break;
        
      case 'love':
        result = await musicService.love();
        break;
        
      case 'selectStation':
        if (!options || !options.stationId) {
          const errorResult = {
            success: false,
            error: 'StationId parameter is required'
          };
          res.status(400).json(errorResult);
          
          // Record response time
          const responseTime = Date.now() - routeStartTime;
          prometheusMetrics.recordResponseTime('POST', '/api/music/control', 400, responseTime);
          
          return;
        }
        
        result = await musicService.selectStation(options.stationId);
        break;
        
      default:
        // Legacy support for direct command
        if (action.length >= 1 && (
          ['p', 'n', '+', 's', 'P', 'S'].includes(action) || action.startsWith('s ')
        )) {
          logger.warn(`Legacy command format detected: ${action} - please update to use { action: 'command', options: { command: '${action}' }}`);
          result = await musicService.sendCommand(action, silent);
          break;
        }
        
        const errorResult = {
          success: false,
          error: `Unknown action: ${action}`
        };
        res.status(400).json(errorResult);
        
        // Record response time
        const responseTime = Date.now() - routeStartTime;
        prometheusMetrics.recordResponseTime('POST', '/api/music/control', 400, responseTime);
        
        return;
    }
    
    // Always return a 200 to avoid UI errors
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/control', 200, responseTime);
  } catch (error) {
    logger.error(`Error controlling music: ${error.message}`);
    // Return a success response even on error to avoid UI blocking
    res.json({
      success: false,
      error: error.message,
      message: 'Error during music control operation'
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/music/control', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/control', 200, responseTime);
  }
});

// Connect to Bluetooth speaker
router.post('/bluetooth/connect', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/music/bluetooth/connect');
    
    const result = await musicService.connectBluetooth();
    
    if (result) {
      res.json({
        success: true,
        message: 'Connected to Bluetooth speaker'
      });
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('POST', '/api/music/bluetooth/connect', 200, responseTime);
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to connect to Bluetooth speaker'
      });
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('POST', '/api/music/bluetooth/connect', 500, responseTime);
    }
  } catch (error) {
    logger.error(`Error connecting to Bluetooth speaker: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to Bluetooth speaker'
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/music/bluetooth/connect', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/bluetooth/connect', 500, responseTime);
  }
});

// Disconnect from Bluetooth speaker
router.post('/bluetooth/disconnect', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/music/bluetooth/disconnect');
    
    const result = await musicService.disconnectBluetooth();
    
    if (result) {
      res.json({
        success: true,
        message: 'Disconnected from Bluetooth speaker'
      });
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('POST', '/api/music/bluetooth/disconnect', 200, responseTime);
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect from Bluetooth speaker'
      });
      
      // Record response time
      const responseTime = Date.now() - routeStartTime;
      prometheusMetrics.recordResponseTime('POST', '/api/music/bluetooth/disconnect', 500, responseTime);
    }
  } catch (error) {
    logger.error(`Error disconnecting from Bluetooth speaker: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect from Bluetooth speaker'
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/music/bluetooth/disconnect', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/bluetooth/disconnect', 500, responseTime);
  }
});

// Get detailed diagnostic information about music player
router.get('/diagnostics', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('GET', '/api/music/diagnostics');
    
    logger.info('Running music player diagnostics...');
    
    // Get detailed status including process information
    const status = await musicService.healthCheck();
    
    // Check status file contents
    let statusFileContents = null;
    try {
      const fs = require('fs');
      const path = require('path');
      const statusFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
      if (fs.existsSync(statusFilePath)) {
        statusFileContents = fs.readFileSync(statusFilePath, 'utf8');
      }
    } catch (fileError) {
      logger.error(`Error reading status file directly: ${fileError.message}`);
    }
    
    // Check for pianobar processes using the system
    let processListOutput = null;
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      const { stdout } = await execAsync('ps aux | grep pianobar | grep -v grep || echo "No pianobar processes found"');
      processListOutput = stdout;
    } catch (psError) {
      logger.error(`Error getting process list: ${psError.message}`);
      processListOutput = `Error getting process list: ${psError.message}`;
    }
    
    // Send comprehensive diagnostic information
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      status,
      rawStatusFile: statusFileContents,
      processListOutput,
      serviceInfo: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        env: {
          HOME: process.env.HOME,
          NODE_ENV: process.env.NODE_ENV,
          PIANOBAR_CONFIG_DIR: process.env.PIANOBAR_CONFIG_DIR
        }
      },
      circuitBreakerStatus: {
        // We could add circuit breaker status here
      },
      recommendations: []
    };
    
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/music/diagnostics', 200, responseTime);
  } catch (error) {
    logger.error(`Error running music diagnostics: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to get music diagnostics: ${error.message}`
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('GET', '/api/music/diagnostics', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/music/diagnostics', 500, responseTime);
  }
});

// Force cleanup of orphaned processes
router.post('/cleanup', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/music/cleanup');
    
    logger.info('Running forced music process cleanup...');
    
    // Force cleanup of all pianobar processes
    const cleanupResult = await musicService.cleanupOrphanedProcesses(true, false);
    
    // Get status after cleanup
    const statusAfterCleanup = await musicService.getStatus(false);
    
    const result = {
      success: true,
      message: 'Music player process cleanup completed',
      cleanupResult,
      currentStatus: statusAfterCleanup.data
    };
    
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/cleanup', 200, responseTime);
  } catch (error) {
    logger.error(`Error running music cleanup: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to cleanup music processes: ${error.message}`
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/music/cleanup', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/music/cleanup', 500, responseTime);
  }
});

module.exports = router;