/**
 * PianobarWebsocketIntegration.js
 * 
 * Initializes and integrates the PianobarWebsocketService with the Express server
 * Following the modular architecture principles from BACKEND_FIX.md
 * 
 * IMPORTANT: This file now uses lazy initialization to avoid blocking during require()
 */

console.log('[DEBUG] Loading PianobarWebsocketIntegration dependencies...');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('pianobar-ws-integration');
const serviceRegistry = require('../utils/ServiceRegistry');
const RetryHelper = require('../utils/RetryHelper');
const CircuitBreaker = require('../utils/CircuitBreaker');
console.log('[DEBUG] PianobarWebsocketIntegration dependencies loaded');

// We'll create these lazily when needed instead of at module load time
let retryHelper = null;
let websocketCircuit = null;

// Function to get or create the retry helper
function getRetryHelper() {
  if (!retryHelper) {
    console.log('[DEBUG] Using RetryHelper singleton for WebSocket integration');
    retryHelper = RetryHelper;
    console.log('[DEBUG] RetryHelper singleton configured for WebSocket integration');
  }
  return retryHelper;
}

// Function to get or create the circuit breaker
function getCircuitBreaker() {
  if (!websocketCircuit) {
    console.log('[DEBUG] Creating CircuitBreaker for WebSocket integration');
    websocketCircuit = new CircuitBreaker({
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
    console.log('[DEBUG] CircuitBreaker created for WebSocket integration');
  }
  return websocketCircuit;
}

/**
 * Initialize the PianobarWebsocketService and integrate it with the Express server
 * @param {http.Server} server - The HTTP server instance
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} The initialization result
 */
async function initializePianobarWebsocket(server, options = {}) {
  console.log('[DEBUG] initializePianobarWebsocket called');
  
  // Get the retry helper lazily
  const retry = getRetryHelper();
  console.log('[DEBUG] Got retry helper for WebSocket initialization');
  
  return retry.retryOperation(async () => {
    try {
      logger.info('Initializing PianobarWebsocketService...');
      console.log('[DEBUG] About to load PianobarWebsocketService');
      
      // Only load the WebsocketService when needed (lazy loading)
      const PianobarWebsocketService = require('./PianobarWebsocketService');
      console.log('[DEBUG] PianobarWebsocketService loaded');
      
      // Configuration settings with defaults and overrides from options
      const config = {
        statusFile: options.statusFile || 
          path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json'),
        eventDir: options.eventDir || 
          path.join(process.env.HOME || '/home/monty', '.config/pianobar/event_data')
      };
      console.log('[DEBUG] WebSocket config created');
      
      // Ensure the event directory exists
      console.log('[DEBUG] About to ensure event directory exists');
      await ensureEventDirectory(config.eventDir, config.statusFile);
      console.log('[DEBUG] Event directory created/verified');
      
      // Create the WebSocket service with circuit breaker protection
      console.log('[DEBUG] About to get circuit breaker');
      const circuit = getCircuitBreaker();
      console.log('[DEBUG] Got circuit breaker for WebSocket');
      
      console.log('[DEBUG] About to create WebSocket service with circuit breaker');
      const websocketService = await circuit.execute(async () => {
        console.log('[DEBUG] Creating new PianobarWebsocketService');
        const service = new PianobarWebsocketService(server, config);
        console.log('[DEBUG] PianobarWebsocketService created');
        return service;
      });
      console.log('[DEBUG] WebSocket service created');
      
      // Store the instance for later retrieval
      websocketServiceInstance = websocketService;
      
      // Connect PianobarService to WebSocket service for central state management
      try {
        // Get the actual PianobarService instance from the service registry
        const pianobarService = serviceRegistry.getAllServices().find(s => s.name === 'PianobarService');
        if (pianobarService && pianobarService.instance) {
          websocketService.setPianobarService(pianobarService.instance);
          console.log('[DEBUG] Connected actual PianobarService instance to WebSocket');
        } else {
          // Fallback: try to create it
          try {
            const { createActualPianobarService } = require('../utils/ServiceFactory');
            const service = createActualPianobarService();
            websocketService.setPianobarService(service);
            console.log('[DEBUG] Created and connected PianobarService to WebSocket');
          } catch (err) {
            console.error('[ERROR] Failed to connect PianobarService:', err.message);
          }
        }
      } catch (error) {
        console.warn(`[WARN] Failed to connect PianobarService to WebSocket: ${error.message}`);
      }
      
      // Create the event command script with retry
      const eventScriptPath = path.join(process.env.HOME || '/home/monty', '.config/pianobar/eventcmd.sh');
      const configPath = path.join(process.env.HOME || '/home/monty', '.config/pianobar/config');
      console.log('[DEBUG] Event and config paths set');
      
      // Perform setup operations with proper error handling
      console.log('[DEBUG] About to setup pianobar event handling');
      await setupPianobarEventHandling(websocketService, eventScriptPath, configPath);
      console.log('[DEBUG] Pianobar event handling setup completed');
      
      // Register with service registry for monitoring
      console.log('[DEBUG] About to register WebSocket service with ServiceRegistry');
      serviceRegistry.register('PianobarWebsocketService', {
        instance: websocketService,
        getInstance: () => websocketService,
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
      console.log('[DEBUG] WebSocket service registered with ServiceRegistry');
      
      logger.info('PianobarWebsocketService initialized and registered successfully');
      
      return {
        success: true,
        message: 'PianobarWebsocketService initialized successfully',
        service: websocketService
      };
    } catch (error) {
      logger.error(`Error initializing PianobarWebsocketService: ${error.message}`);
      console.error(`[ERROR] WebSocket initialization failed: ${error.message}`);
      
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
  // Get the retry helper lazily
  const retry = getRetryHelper();
  console.log('[DEBUG] Using retry helper for ensureEventDirectory');
  
  return retry.retryOperation(async () => {
    try {
      // Create event directory if it doesn't exist
      if (!fs.existsSync(eventDir)) {
        console.log(`[DEBUG] Creating event directory: ${eventDir}`);
        fs.mkdirSync(eventDir, { recursive: true });
        logger.info(`Created event directory: ${eventDir}`);
      }
      
      // Create status file directory if it doesn't exist
      const statusDir = path.dirname(statusFile);
      if (!fs.existsSync(statusDir)) {
        console.log(`[DEBUG] Creating status directory: ${statusDir}`);
        fs.mkdirSync(statusDir, { recursive: true });
        logger.info(`Created status directory: ${statusDir}`);
      }
      
      // Create initial status file if it doesn't exist
      if (!fs.existsSync(statusFile)) {
        console.log(`[DEBUG] Creating initial status file: ${statusFile}`);
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
      console.error(`[ERROR] Failed to ensure event directory: ${error.message}`);
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
  // Get the retry helper lazily
  const retry = getRetryHelper();
  console.log('[DEBUG] Using retry helper for setupPianobarEventHandling');
  
  return retry.retryOperation(async () => {
    try {
      console.log(`[DEBUG] Creating event command script at ${eventScriptPath}`);
      // Create the event command script
      await websocketService.createEventCommandScript(eventScriptPath);
      logger.info(`Event command script created at ${eventScriptPath}`);
      
      // Set proper permissions
      console.log(`[DEBUG] Setting permissions on event script`);
      await execPromise(`chmod 755 ${eventScriptPath}`);
      
      // Setup pianobar config to use our event script
      console.log(`[DEBUG] Setting up pianobar config at ${configPath}`);
      await websocketService.setupPianobarConfig(configPath, eventScriptPath);
      logger.info(`Pianobar configuration updated at ${configPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Error setting up pianobar event handling: ${error.message}`);
      console.error(`[ERROR] Failed to setup pianobar event handling: ${error.message}`);
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

// Export function to get the WebSocket service instance
let websocketServiceInstance = null;

function getWebSocketServiceInstance() {
  return websocketServiceInstance;
}

// Update the existing export
module.exports = { 
  initializePianobarWebsocket,
  getWebSocketServiceInstance 
};