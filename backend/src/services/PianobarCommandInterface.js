/**
 * PianobarCommandInterface.js
 * 
 * A clean implementation of the pianobar command interface with:
 * - Simple FIFO write using Node.js fs module
 * - Clear timeouts for different command types
 * - No status parsing or information retrieval
 * - Following the separation of concerns principle
 * - Integrated with modular architecture from BACKEND_FIX.md
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
// Import with debug logging to detect circular dependencies
console.log('PianobarCommandInterface: About to require logger');
const logger = require('../utils/logger').getModuleLogger('pianobar-command');
console.log('PianobarCommandInterface: About to require RetryHelper');
const RetryHelper = require('../utils/RetryHelper');
console.log('PianobarCommandInterface: About to require ServiceRegistry');
const serviceRegistry = require('../utils/ServiceRegistry');
console.log('PianobarCommandInterface: All imports completed');

class PianobarCommandInterface {
  constructor(config = {}, retryHelper = null, serviceWatchdog = null) {
    // Store dependencies
    this.retryHelper = retryHelper || new RetryHelper({
      operationPrefix: 'pianobar-cmd',
      maxRetries: 3,
      initialDelay: 500,
      backoffFactor: 1.5
    });
    
    this.serviceWatchdog = serviceWatchdog;

    // Configuration with defaults
    this.pianobarConfigDir = config.pianobarConfigDir || 
      path.join(process.env.HOME || '/home/monty', '.config/pianobar');
    
    this.pianobarCtl = config.pianobarCtl || 
      path.join(this.pianobarConfigDir, 'ctl');
    
    // Command timeouts based on command type
    this.timeouts = {
      // Play/Pause/Love/Ban commands (fast)
      fast: config.fastTimeout || 1000,
      // Next song command (medium)
      medium: config.mediumTimeout || 2500,
      // Station change commands (slow)
      slow: config.slowTimeout || 5000
    };

    // Logging level
    this.verbose = config.verbose || false;

    // Status
    this.isInitialized = false;
    
    // Register with ServiceRegistry if provided
    if (serviceRegistry) {
      serviceRegistry.register('PianobarCommandInterface', {
        instance: this,
        isCore: false,
        checkHealth: this.healthCheck.bind(this)
      });
      
      logger.info('PianobarCommandInterface registered with ServiceRegistry');
    }
    
    // Register with ServiceWatchdog if provided
    if (this.serviceWatchdog) {
      this.serviceWatchdog.registerService('PianobarCommandInterface', {
        isCritical: false,
        monitorMemory: false,
        recoveryProcedure: this.recoveryProcedure.bind(this)
      });
      
      logger.info('PianobarCommandInterface registered with ServiceWatchdog');
    }
  }
  
  /**
   * Initialize the command interface
   * @returns {Promise<Object>} Result of initialization
   */
  async initialize() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Initializing PianobarCommandInterface...');
          
          // Ensure FIFO exists
          await this.ensureFifo();
          
          this.isInitialized = true;
          
          if (serviceRegistry) {
            serviceRegistry.setStatus('PianobarCommandInterface', 'ready');
          }
          
          logger.info('PianobarCommandInterface initialized successfully');
          
          return {
            success: true,
            message: 'PianobarCommandInterface initialized successfully'
          };
        } catch (error) {
          logger.error(`Error initializing PianobarCommandInterface: ${error.message}`);
          
          if (serviceRegistry) {
            serviceRegistry.setStatus('PianobarCommandInterface', 'error', error.message);
          }
          
          return {
            success: false,
            message: `Failed to initialize PianobarCommandInterface: ${error.message}`,
            error: error.message
          };
        }
      },
      {
        operationName: 'initialize-pianobar-command',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2
      }
    );
  }
  
  /**
   * Health check for service monitoring
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const fifoExists = fs.existsSync(this.pianobarCtl);
      let isFifo = false;
      
      if (fifoExists) {
        try {
          isFifo = fs.statSync(this.pianobarCtl).isFIFO();
        } catch (statError) {
          logger.warn(`Error checking if file is FIFO: ${statError.message}`);
        }
      }
      
      const status = fifoExists && isFifo ? 'ok' : 'warning';
      
      return {
        status,
        message: fifoExists && isFifo 
          ? 'Command interface ready with valid FIFO' 
          : 'FIFO issue detected, commands may fail',
        details: {
          fifoExists,
          isFifo,
          fifoPath: this.pianobarCtl,
          isInitialized: this.isInitialized,
          lastUpdated: Date.now()
        }
      };
    } catch (error) {
      logger.error(`Health check error: ${error.message}`);
      return {
        status: 'warning',
        message: `Health check error: ${error.message}`,
        details: { 
          lastUpdated: Date.now(),
          isInitialized: this.isInitialized
        }
      };
    }
  }
  
  /**
   * Recovery procedure for service watchdog
   * @param {string} serviceName - Name of the service
   * @param {number} attemptNumber - Number of recovery attempts
   * @returns {Promise<Object>} Recovery result
   */
  async recoveryProcedure(serviceName, attemptNumber) {
    logger.info(`Recovery procedure for PianobarCommandInterface (attempt ${attemptNumber})`);
    
    try {
      // Re-ensure FIFO exists
      await this.ensureFifo();
      
      this.isInitialized = true;
      
      if (serviceRegistry) {
        serviceRegistry.setStatus('PianobarCommandInterface', 'ready');
      }
      
      return {
        success: true,
        message: 'PianobarCommandInterface recovered successfully'
      };
    } catch (error) {
      logger.error(`Recovery failed: ${error.message}`);
      
      if (serviceRegistry) {
        serviceRegistry.setStatus('PianobarCommandInterface', 'error', error.message);
      }
      
      return {
        success: false,
        message: `Recovery failed: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Ensure the FIFO exists and has correct permissions
   * @returns {Promise<boolean>} True if FIFO exists and is ready
   */
  async ensureFifo() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Ensure config directory exists
          if (!fs.existsSync(this.pianobarConfigDir)) {
            fs.mkdirSync(this.pianobarConfigDir, { recursive: true });
            logger.info(`Created pianobar config directory: ${this.pianobarConfigDir}`);
          }
          
          // Check if FIFO exists
          if (fs.existsSync(this.pianobarCtl)) {
            // Check if it's actually a FIFO
            const stats = fs.statSync(this.pianobarCtl);
            if (!stats.isFIFO()) {
              if (this.verbose) logger.warn(`Found non-FIFO file at ${this.pianobarCtl}, recreating`);
              await execPromise(`rm ${this.pianobarCtl}`);
              await execPromise(`mkfifo ${this.pianobarCtl}`);
            }
          } else {
            // Create FIFO if it doesn't exist
            if (this.verbose) logger.info(`Creating FIFO at ${this.pianobarCtl}`);
            await execPromise(`mkfifo ${this.pianobarCtl}`);
          }
          
          // Always ensure permissions are correct
          await execPromise(`chmod 666 ${this.pianobarCtl}`);
          
          return true;
        } catch (error) {
          logger.error(`Failed to ensure FIFO: ${error.message}`);
          throw error;
        }
      },
      {
        operationName: 'ensure-fifo',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2
      }
    );
  }

  /**
   * Send a command to pianobar with appropriate timeout based on command type
   * @param {string} command - The command to send
   * @returns {Promise<Object>} Result of the operation
   */
  async sendCommand(command) {
    return this.retryHelper.retryOperation(
      async () => {
        const startTime = Date.now();
        const operationId = `cmd-${command}-${startTime}`;
        
        try {
          // Check if initialized
          if (!this.isInitialized) {
            logger.warn(`[${operationId}] Command attempted before initialization`);
            await this.initialize();
          }
          
          // Determine command type for timeout
          let timeout = this.timeouts.fast; // Default to fast
          let commandType = 'fast';
          
          if (command === 'n') {
            timeout = this.timeouts.medium;
            commandType = 'medium';
          } else if (command.startsWith('s') && command.length > 1) {
            timeout = this.timeouts.slow;
            commandType = 'slow';
          }
          
          if (this.verbose) {
            logger.info(`[${operationId}] Sending command '${command}' (${commandType} - ${timeout}ms timeout)`);
          }
          
          // Ensure FIFO exists before sending command (with lower retry count)
          await this.retryHelper.retryOperation(
            async () => this.ensureFifo(),
            {
              operationName: 'ensure-fifo-before-command',
              maxRetries: 1,
              initialDelay: 200
            }
          );
          
          // Send command with timeout promise race
          const writePromise = new Promise((resolve, reject) => {
            try {
              // Simple synchronous write - the most reliable approach for small commands
              fs.writeFileSync(this.pianobarCtl, `${command}\n`, { encoding: 'utf8' });
              resolve({ success: true });
            } catch (error) {
              reject(error);
            }
          });
          
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
              resolve({ 
                success: false, 
                timedOut: true,
                message: `Command write timed out after ${timeout}ms` 
              });
            }, timeout);
          });
          
          // Race between write and timeout
          const result = await Promise.race([writePromise, timeoutPromise]);
          
          const duration = Date.now() - startTime;
          
          if (result.timedOut) {
            logger.warn(`[${operationId}] Command timed out after ${duration}ms`);
            return {
              success: false,
              message: `Command '${command}' timed out after ${duration}ms`,
              command,
              duration
            };
          }
          
          if (this.verbose) {
            logger.info(`[${operationId}] Command sent successfully in ${duration}ms`);
          }
          
          return {
            success: true,
            message: `Command '${command}' sent successfully`,
            command,
            duration
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error(`[${operationId}] Error sending command: ${error.message}`);
          
          return {
            success: false,
            message: `Error sending command: ${error.message}`,
            error: error.message,
            command,
            duration
          };
        }
      },
      {
        operationName: `send-command-${command}`,
        isCritical: false,
        maxRetries: 2,
        initialDelay: 500,
        backoffFactor: 1.5,
        shouldRetry: (error) => {
          // Don't retry certain types of errors
          if (error && error.code === 'EPIPE') {
            return false; // Don't retry broken pipe errors
          }
          return true;
        }
      }
    );
  }
  
  /**
   * Play command - toggle play
   * @returns {Promise<Object>} Result of the operation
   */
  async play() {
    return this.sendCommand('P');
  }
  
  /**
   * Pause command - toggle pause
   * @returns {Promise<Object>} Result of the operation
   */
  async pause() {
    return this.sendCommand('S');
  }
  
  /**
   * Next song command
   * @returns {Promise<Object>} Result of the operation
   */
  async next() {
    return this.sendCommand('n');
  }
  
  /**
   * Love current song
   * @returns {Promise<Object>} Result of the operation
   */
  async love() {
    return this.sendCommand('+');
  }
  
  /**
   * Ban current song
   * @returns {Promise<Object>} Result of the operation
   */
  async ban() {
    return this.sendCommand('-');
  }
  
  /**
   * Select station by ID
   * @param {string|number} stationId - Station ID to select
   * @returns {Promise<Object>} Result of the operation
   */
  async selectStation(stationId) {
    return this.sendCommand(`s${stationId}`);
  }
  
  /**
   * Quit pianobar
   * @returns {Promise<Object>} Result of the operation
   */
  async quit() {
    return this.sendCommand('q');
  }
}

// Factory function to create a singleton instance with proper DI
let instance = null;
function createPianobarCommandInterface(config = {}, retryHelper, serviceWatchdog) {
  if (!instance) {
    instance = new PianobarCommandInterface(config, retryHelper, serviceWatchdog);
    
    // Initialize asynchronously but don't block
    instance.initialize().catch(err => {
      logger.error(`Async initialization error: ${err.message}`);
    });
  }
  return instance;
}

module.exports = PianobarCommandInterface;
module.exports.createPianobarCommandInterface = createPianobarCommandInterface;