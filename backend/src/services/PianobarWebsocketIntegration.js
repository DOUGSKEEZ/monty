/**
 * PianobarWebsocketIntegration.js
 * 
 * Initializes and integrates the PianobarWebsocketService with the Express server
 * Following the modular architecture principles from BACKEND_FIX.md
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('pianobar-ws-integration');
const serviceRegistry = require('../utils/ServiceRegistry');
const RetryHelper = require('../utils/RetryHelper');
const CircuitBreaker = require('../utils/CircuitBreaker');

// Create a retry helper for websocket operations
const retryHelper = new RetryHelper({
  operationPrefix: 'pianobar-ws',
  maxRetries: 3,
  initialDelay: 1000,
  backoffFactor: 2
});

// Create a circuit breaker for websocket operations
const websocketCircuit = new CircuitBreaker({
  name: 'pianobar-websocket',
  failureThreshold: 3,
  resetTimeout: 30000,
  fallbackFunction: async () => {
    logger.warn('Websocket circuit is open, using fallback');
    return { 
      success: false, 
      fromFallback: true,
      message: 'Websocket service is currently unavailable' 
    };
  }
});

/**
 * Initialize the PianobarWebsocketService and integrate it with the Express server
 * @param {http.Server} server - The HTTP server instance
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} The initialization result
 */
async function initializePianobarWebsocket(server, options = {}) {
  return retryHelper.retryOperation(async () => {
    try {
      logger.info('Initializing PianobarWebsocketService...');
      
      // Only load the WebsocketService when needed (lazy loading)
      const PianobarWebsocketService = require('./PianobarWebsocketService');
      
      // Configuration settings with defaults and overrides from options
      const config = {
        statusFile: options.statusFile || 
          path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json'),
        eventDir: options.eventDir || 
          path.join(process.env.HOME || '/home/monty', '.config/pianobar/event_data')
      };
      
      // Ensure the event directory exists
      await ensureEventDirectory(config.eventDir, config.statusFile);
      
      // Create the WebSocket service with circuit breaker protection
      const websocketService = await websocketCircuit.execute(async () => {
        const service = new PianobarWebsocketService(server, config);
        return service;
      });
      
      // Create the event command script with retry
      const eventScriptPath = path.join(process.env.HOME || '/home/monty', '.config/pianobar/eventcmd.sh');
      const configPath = path.join(process.env.HOME || '/home/monty', '.config/pianobar/config');
      
      // Perform setup operations with proper error handling
      await setupPianobarEventHandling(websocketService, eventScriptPath, configPath);
      
      // Register with service registry for monitoring
      serviceRegistry.register('PianobarWebsocketService', {
        instance: websocketService,
        isCore: false,
        status: 'ready',
        checkHealth: async () => {
          const clientCount = websocketService.getClientCount();
          return {
            status: 'ok',
            message: `WebSocket service active with ${clientCount} connected clients`,
            details: {
              clientCount,
              lastUpdated: Date.now()
            }
          };
        }
      });
      
      logger.info('PianobarWebsocketService initialized and registered successfully');
      
      return {
        success: true,
        message: 'PianobarWebsocketService initialized successfully',
        service: websocketService
      };
    } catch (error) {
      logger.error(`Error initializing PianobarWebsocketService: ${error.message}`);
      
      // Non-critical service - return failure but don't crash the server
      return {
        success: false,
        message: `Failed to initialize PianobarWebsocketService: ${error.message}`,
        error: error.message
      };
    }
  }, {
    operationName: 'initialize-pianobar-websocket',
    isCritical: false,
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2
  });
}

/**
 * Ensure the event directory and status file exist
 * @param {string} eventDir - Path to event directory
 * @param {string} statusFile - Path to status file
 * @returns {Promise<boolean>} True if successful
 */
async function ensureEventDirectory(eventDir, statusFile) {
  return retryHelper.retryOperation(async () => {
    try {
      // Create event directory if it doesn't exist
      if (!fs.existsSync(eventDir)) {
        fs.mkdirSync(eventDir, { recursive: true });
        logger.info(`Created event directory: ${eventDir}`);
      }
      
      // Create status file directory if it doesn't exist
      const statusDir = path.dirname(statusFile);
      if (!fs.existsSync(statusDir)) {
        fs.mkdirSync(statusDir, { recursive: true });
        logger.info(`Created status directory: ${statusDir}`);
      }
      
      // Create initial status file if it doesn't exist
      if (!fs.existsSync(statusFile)) {
        const initialStatus = {
          status: 'stopped',
          updateTime: Date.now()
        };
        fs.writeFileSync(statusFile, JSON.stringify(initialStatus, null, 2), 'utf8');
        logger.info(`Created initial status file: ${statusFile}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error ensuring event directory: ${error.message}`);
      throw error;
    }
  }, {
    operationName: 'ensure-event-directory',
    isCritical: false,
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2
  });
}

/**
 * Setup pianobar event handling
 * @param {PianobarWebsocketService} websocketService - The WebSocket service instance
 * @param {string} eventScriptPath - Path to write the event script
 * @param {string} configPath - Path to pianobar config file
 * @returns {Promise<boolean>} True if successful
 */
async function setupPianobarEventHandling(websocketService, eventScriptPath, configPath) {
  return retryHelper.retryOperation(async () => {
    try {
      // Create the event command script
      await websocketService.createEventCommandScript(eventScriptPath);
      logger.info(`Event command script created at ${eventScriptPath}`);
      
      // Set proper permissions
      await execPromise(`chmod 755 ${eventScriptPath}`);
      
      // Setup pianobar config to use our event script
      await websocketService.setupPianobarConfig(configPath, eventScriptPath);
      logger.info(`Pianobar configuration updated at ${configPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Error setting up pianobar event handling: ${error.message}`);
      throw error;
    }
  }, {
    operationName: 'setup-pianobar-events',
    isCritical: false,
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2
  });
}

module.exports = { initializePianobarWebsocket };