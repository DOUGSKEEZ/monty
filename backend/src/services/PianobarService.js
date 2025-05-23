/**
 * PianobarService.js - Implementation of the IPianobarService interface
 * 
 * A clean implementation that:
 * - Uses simple FIFO write using Node.js fs module
 * - Has clear timeouts for different command types
 * - Separates command interface from status updates
 * - Follows the modular architecture principles from BACKEND_FIX.md
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec, spawn } = require('child_process');
const execPromise = util.promisify(exec);
const IPianobarService = require('../interfaces/IPianobarService');
const logger = require('../utils/logger').getModuleLogger('pianobar-service');
const prometheusMetrics = require('./PrometheusMetricsService');

class PianobarService extends IPianobarService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog) {
    super();
    
    // Store dependencies
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;

    // Configuration with defaults
    this.pianobarConfigDir = path.join(process.env.HOME || '/home/monty', '.config/pianobar');
    this.pianobarCtl = path.join(this.pianobarConfigDir, 'ctl');
    this.pianobarStatusFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
    this.pianobarStationsFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');
    this.defaultStation = this.configManager ? this.configManager.get('music.defaultStation', '0') : '0';
    
    // Command timeouts based on command type
    this.timeouts = {
      // Play/Pause/Love/Ban commands (fast)
      fast: 1000,
      // Next song command (medium)
      medium: 2500,
      // Station change commands (slow)
      slow: 5000
    };

    // Status
    this.isInitialized = false;
    this.isPianobarRunning = false;
    this.isPlaying = false;
    this.pianobarProcess = null;
    
    // Register with ServiceRegistry
    if (this.serviceRegistry) {
      this.serviceRegistry.register('PianobarService', {
        instance: this,
        isCore: false,
        checkHealth: this.healthCheck.bind(this)
      });
      
      logger.info('PianobarService registered with ServiceRegistry');
    }
    
    // Register with ServiceWatchdog
    if (this.serviceWatchdog) {
      this.serviceWatchdog.registerService('PianobarService', {
        isCritical: false,
        monitorMemory: false,
        recoveryProcedure: this.recoveryProcedure.bind(this)
      });
      
      logger.info('PianobarService registered with ServiceWatchdog');
    }
    
    // Initialize basic file structure synchronously
    try {
      this.ensureBasicFileStructure();
    } catch (err) {
      logger.warn(`Basic file structure setup failed: ${err.message}`);
    }
    
    // Set up status file watcher
    this.setupStatusFileWatcher();
  }
  
  /**
   * Ensure basic file structure exists
   */
  ensureBasicFileStructure() {
    // Create basic file structure synchronously to avoid initialization errors
    const dataDir = path.dirname(this.pianobarStatusFile);
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (error) {
        logger.warn(`Could not create data directory: ${error.message}`);
      }
    }
    
    // Create status file with basic data if it doesn't exist
    if (!fs.existsSync(this.pianobarStatusFile)) {
      try {
        fs.writeFileSync(this.pianobarStatusFile, JSON.stringify({
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          updateTime: Date.now()
        }), 'utf8');
      } catch (error) {
        logger.warn(`Could not create status file: ${error.message}`);
      }
    }
    
    // Create stations file with mock data if it doesn't exist
    if (!fs.existsSync(this.pianobarStationsFile)) {
      try {
        fs.writeFileSync(this.pianobarStationsFile, JSON.stringify({
          stations: [
            "Quick Mix",
            "Today's Hits",
            "Pop Hits",
            "Relaxing Instrumental",
            "Classic Rock",
            "Smooth Jazz"
          ],
          mock: true
        }), 'utf8');
      } catch (error) {
        logger.warn(`Could not create stations file: ${error.message}`);
      }
    }
  }
  
  /**
   * Initialize the pianobar service
   */
  async initialize() {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => {
          try {
            logger.info('Initializing PianobarService...');
            
            // Ensure FIFO exists
            await this.ensureFifo();
            
            // Verify actual process state on startup and clear stale cache
            await this._verifyAndClearStaleCache();
            
            this.isInitialized = true;
            
            if (this.serviceRegistry) {
              this.serviceRegistry.setStatus('PianobarService', 'ready');
            }
            
            // Record metrics
            if (prometheusMetrics) {
              prometheusMetrics.recordOperation('pianobar-init', true);
            }
            
            logger.info('PianobarService initialized successfully');
            
            return {
              success: true,
              message: 'PianobarService initialized successfully'
            };
          } catch (error) {
            logger.error(`Error initializing PianobarService: ${error.message}`);
            
            if (this.serviceRegistry) {
              this.serviceRegistry.setStatus('PianobarService', 'error', error.message);
            }
            
            // Record metrics
            if (prometheusMetrics) {
              prometheusMetrics.recordOperation('pianobar-init', false);
            }
            
            return {
              success: false,
              message: `Failed to initialize PianobarService: ${error.message}`,
              error: error.message
            };
          }
        },
        {
          operationName: 'pianobar-init',
          isCritical: false,
          maxRetries: 3,
          initialDelay: 1000,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      try {
        logger.info('Initializing PianobarService (without RetryHelper)...');
        
        // Ensure FIFO exists
        await this.ensureFifo();
        
        // Verify actual process state on startup and clear stale cache
        await this._verifyAndClearStaleCache();
        
        this.isInitialized = true;
        
        logger.info('PianobarService initialized successfully');
        
        return {
          success: true,
          message: 'PianobarService initialized successfully'
        };
      } catch (error) {
        logger.error(`Error initializing PianobarService: ${error.message}`);
        
        return {
          success: false,
          message: `Failed to initialize PianobarService: ${error.message}`,
          error: error.message
        };
      }
    }
  }
  
  /**
   * Health check for service monitoring
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
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.setServiceHealth('PianobarService', status);
      }
      
      return {
        status,
        message: fifoExists && isFifo 
          ? `PianobarService is ${this.isPianobarRunning ? 'running' : 'ready'}` 
          : 'FIFO issue detected, commands may fail',
        details: {
          fifoExists,
          isFifo,
          fifoPath: this.pianobarCtl,
          isInitialized: this.isInitialized,
          isPianobarRunning: this.isPianobarRunning,
          isPlaying: this.isPlaying,
          lastUpdated: Date.now(),
          responseTime: 1 // Fast response since we're just checking files
        }
      };
    } catch (error) {
      logger.error(`Health check error: ${error.message}`);
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.setServiceHealth('PianobarService', 'warning');
      }
      
      return {
        status: 'warning',
        message: `Health check error: ${error.message}`,
        details: { 
          lastUpdated: Date.now(),
          isInitialized: this.isInitialized,
          isPianobarRunning: this.isPianobarRunning,
          isPlaying: this.isPlaying
        }
      };
    }
  }
  
  /**
   * Recovery procedure for service watchdog
   */
  async recoveryProcedure(serviceName, attemptNumber) {
    logger.info(`Recovery procedure for PianobarService (attempt ${attemptNumber})`);
    
    try {
      // Re-ensure FIFO exists
      await this.ensureFifo();
      
      // If pianobar was running, try to restart it
      if (this.isPianobarRunning) {
        // First try to stop it
        try {
          await this.stopPianobar(true);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (stopError) {
          logger.warn(`Error stopping pianobar during recovery: ${stopError.message}`);
        }
        
        // Then restart it
        try {
          await this.startPianobar(true);
        } catch (startError) {
          logger.warn(`Error restarting pianobar during recovery: ${startError.message}`);
        }
      }
      
      this.isInitialized = true;
      
      if (this.serviceRegistry) {
        this.serviceRegistry.setStatus('PianobarService', 'ready');
      }
      
      return {
        success: true,
        message: 'PianobarService recovered successfully',
        method: 'restart'
      };
    } catch (error) {
      logger.error(`Recovery failed: ${error.message}`);
      
      if (this.serviceRegistry) {
        this.serviceRegistry.setStatus('PianobarService', 'error', error.message);
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
   */
  async ensureFifo() {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._ensureFifoImpl(),
        {
          operationName: 'ensure-fifo',
          isCritical: false,
          maxRetries: 3,
          initialDelay: 1000,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      return this._ensureFifoImpl();
    }
  }
  
  /**
   * Implementation of ensuring FIFO exists
   * @private
   */
  async _ensureFifoImpl() {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.pianobarConfigDir)) {
        fs.mkdirSync(this.pianobarConfigDir, { recursive: true });
        logger.info(`Created pianobar config directory: ${this.pianobarConfigDir}`);
      }
      
      // Check if FIFO exists
      let needNewFifo = false;
      if (fs.existsSync(this.pianobarCtl)) {
        try {
          const stats = fs.statSync(this.pianobarCtl);
          if (!stats.isFIFO()) {
            logger.warn(`Found non-FIFO file at ${this.pianobarCtl}, recreating`);
            await execPromise(`rm ${this.pianobarCtl}`);
            needNewFifo = true;
          }
        } catch (error) {
          logger.warn(`Error checking FIFO file: ${error.message}, recreating`);
          try {
            await execPromise(`rm ${this.pianobarCtl}`);
          } catch (rmError) {
            logger.error(`Failed to remove bad FIFO: ${rmError.message}`);
          }
          needNewFifo = true;
        }
      } else {
        needNewFifo = true;
      }
      
      // Create new FIFO if needed
      if (needNewFifo) {
        await execPromise(`mkfifo ${this.pianobarCtl}`);
        await execPromise(`chmod 644 ${this.pianobarCtl}`);
        logger.info(`Created FIFO control file at ${this.pianobarCtl} with owner read/write permissions (644)`);
      } else {
        // Just ensure proper permissions
        await execPromise(`chmod 644 ${this.pianobarCtl}`);
        logger.debug(`Ensured FIFO permissions at ${this.pianobarCtl} (644)`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to ensure FIFO: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check pianobar status
   */
  async checkPianobarStatus(silent = false) {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._checkPianobarStatusImpl(silent),
        {
          operationName: 'check-pianobar-status',
          isCritical: false,
          maxRetries: 2,
          initialDelay: 500,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      return this._checkPianobarStatusImpl(silent);
    }
  }
  
  /**
   * Implementation of checking pianobar status
   * @private
   */
  async _checkPianobarStatusImpl(silent = false) {
    try {
      // Simple check using pgrep
      const { stdout } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
      const pids = stdout.trim().split('\n').filter(Boolean);
      
      const isRunning = pids.length > 0 && pids.length < 3; // Avoid considering orphaned processes
      
      if (isRunning) {
        if (!silent) {
          logger.info(`Pianobar is running with PIDs: ${pids.join(', ')}`);
        }
        this.isPianobarRunning = true;
      } else {
        if (!silent) {
          logger.info('Pianobar is not running');
        }
        this.isPianobarRunning = false;
        this.isPlaying = false;
      }
      
      // Update status file with current state
      await this.saveStatus({
        status: this.isPianobarRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
        isPianobarRunning: this.isPianobarRunning,
        isPlaying: this.isPlaying,
        updateTime: Date.now()
      });
      
      return this.isPianobarRunning;
    } catch (error) {
      logger.error(`Error checking pianobar status: ${error.message}`);
      
      // On error, assume not running for safety
      this.isPianobarRunning = false;
      this.isPlaying = false;
      
      throw error;
    }
  }
  
  /**
   * Set up a watcher for status file changes
   */
  setupStatusFileWatcher() {
    try {
      if (!fs.existsSync(this.pianobarStatusFile)) {
        fs.writeFileSync(this.pianobarStatusFile, JSON.stringify({ 
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          updateTime: Date.now()
        }), 'utf8');
      }
      
      fs.watchFile(this.pianobarStatusFile, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          try {
            const status = JSON.parse(fs.readFileSync(this.pianobarStatusFile, 'utf8'));
            logger.debug(`Status updated: ${status.status}`);
            
            // Update state based on file
            if (status.status === 'playing') {
              this.isPlaying = true;
              this.isPianobarRunning = true;
              if (prometheusMetrics) {
                prometheusMetrics.recordGauge('pianobar', 'status', 1);
              }
            } else if (status.status === 'paused') {
              this.isPlaying = false;
              this.isPianobarRunning = true;
              if (prometheusMetrics) {
                prometheusMetrics.recordGauge('pianobar', 'status', 0.5);
              }
            } else if (status.status === 'stopped') {
              this.isPlaying = false;
              this.isPianobarRunning = false;
              if (prometheusMetrics) {
                prometheusMetrics.recordGauge('pianobar', 'status', 0);
              }
            }
          } catch (error) {
            logger.warn(`Error processing status file update: ${error.message}`);
          }
        }
      });
      
      logger.info('Set up status file watcher');
    } catch (error) {
      logger.error(`Error setting up status file watcher: ${error.message}`);
    }
  }
  
  /**
   * Start pianobar
   */
  async startPianobar(silent = false) {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._startPianobarImpl(silent),
        {
          operationName: 'start-pianobar',
          isCritical: false,
          maxRetries: 2,
          initialDelay: 1000,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      return this._startPianobarImpl(silent);
    }
  }
  
  /**
   * Implementation of starting pianobar
   * @private
   */
  async _startPianobarImpl(silent = false) {
    try {
      // Check if already running
      const isRunning = await this.checkPianobarStatus(silent);
      if (isRunning) {
        if (!silent) {
          logger.info('Pianobar is already running');
        }
        return {
          success: true,
          message: 'Pianobar is already running',
          isPlaying: this.isPlaying
        };
      }
      
      // Ensure config directory and FIFO exist
      await this.ensureFifo();
      
      // Start pianobar process with output capture
      if (!silent) {
        logger.info('Starting pianobar with output capture...');
      }
      
      // Create log files for pianobar output
      const stdout = fs.openSync('/tmp/pianobar_stdout.log', 'a');
      const stderr = fs.openSync('/tmp/pianobar_stderr.log', 'a');
      
      // Spawn pianobar process
      this.pianobarProcess = spawn('pianobar', [], {
        detached: true,
        stdio: ['ignore', stdout, stderr],
        env: process.env
      });
      
      // Log the PID for debugging
      logger.info(`Started pianobar with PID: ${this.pianobarProcess.pid}`);
      
      // Add an event listener for process exit
      this.pianobarProcess.on('exit', (code, signal) => {
        logger.info(`Pianobar process exited with code ${code} and signal ${signal}`);
        this.isPianobarRunning = false;
        this.isPlaying = false;
        
        // Update status file
        this.saveStatus({
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          updateTime: Date.now(),
          exitCode: code,
          exitSignal: signal
        }).catch(err => {
          logger.error(`Error updating status after process exit: ${err.message}`);
        });
      });
      
      // Unref process to prevent it from keeping the Node.js process alive
      this.pianobarProcess.unref();
      
      // Wait for pianobar to start properly
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if it's running
      const startedSuccessfully = await this.checkPianobarStatus(silent);
      if (!startedSuccessfully) {
        throw new Error('Failed to start pianobar process');
      }
      
      // Update status
      this.isPianobarRunning = true;
      this.isPlaying = true;
      await this.saveStatus({
        status: 'playing',
        isPianobarRunning: true,
        isPlaying: true,
        updateTime: Date.now(),
        startTime: Date.now()
      });
      
      // Select default station if configured
      if (this.defaultStation && this.defaultStation !== '0') {
        await this.selectStation(this.defaultStation);
      }
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('start-pianobar', true);
        prometheusMetrics.recordGauge('pianobar', 'status', 1);
      }
      
      return {
        success: true,
        message: 'Pianobar started successfully',
        isPlaying: true
      };
    } catch (error) {
      logger.error(`Error starting pianobar: ${error.message}`);
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('start-pianobar', false);
        prometheusMetrics.recordGauge('pianobar', 'status', 0);
      }
      
      this.isPianobarRunning = false;
      this.isPlaying = false;
      this.pianobarProcess = null;
      
      throw error;
    }
  }
  
  /**
   * Stop pianobar
   */
  async stopPianobar(silent = false) {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._stopPianobarImpl(silent),
        {
          operationName: 'stop-pianobar',
          isCritical: false,
          maxRetries: 2,
          initialDelay: 1000,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      return this._stopPianobarImpl(silent);
    }
  }
  
  /**
   * Implementation of stopping pianobar
   * @private
   */
  async _stopPianobarImpl(silent = false) {
    try {
      // Check if pianobar is running
      const isRunning = await this.checkPianobarStatus(silent);
      if (!isRunning) {
        if (!silent) {
          logger.info('Pianobar is not running, no stop needed');
        }
        
        // Update state to be consistent
        this.isPianobarRunning = false;
        this.isPlaying = false;
        this.pianobarProcess = null;
        
        return {
          success: true,
          message: 'Pianobar is already stopped',
          isPlaying: false
        };
      }
      
      // Send quit command
      const quitResult = await this.sendCommand('q', silent);
      
      // Give pianobar time to exit - increase timeout to 5 seconds
      logger.info('Waiting for pianobar to exit after quit command (5 seconds)');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if it's still running
      const stillRunning = await this.checkPianobarStatus(true);
      
      // If still running, force kill
      if (stillRunning) {
        logger.warn('Pianobar still running after quit command, forcing kill');
        
        // First try a graceful kill
        try {
          await execPromise('pkill -f pianobar || true', { timeout: 5000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (killError) {
          logger.debug(`Error during pkill: ${killError.message}`);
        }
        
        // Check again
        const stillRunningAfterKill = await this.checkPianobarStatus(true);
        
        // If still running, use force kill
        if (stillRunningAfterKill) {
          logger.warn('Pianobar still running after pkill, using SIGKILL');
          try {
            await execPromise('pkill -9 -f pianobar || true', { timeout: 5000 });
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (forceKillError) {
            logger.debug(`Error during force kill: ${forceKillError.message}`);
          }
        }
      }
      
      // Update state
      this.isPianobarRunning = false;
      this.isPlaying = false;
      this.pianobarProcess = null;
      
      // Update status file
      await this.saveStatus({
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        updateTime: Date.now(),
        stopTime: Date.now()
      });
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('stop-pianobar', true);
        prometheusMetrics.recordGauge('pianobar', 'status', 0);
      }
      
      return {
        success: true,
        message: 'Pianobar stopped successfully',
        isPlaying: false,
        quitResult
      };
    } catch (error) {
      logger.error(`Error stopping pianobar: ${error.message}`);
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('stop-pianobar', false);
      }
      
      // Force state reset on error
      this.isPianobarRunning = false;
      this.isPlaying = false;
      this.pianobarProcess = null;
      
      // Try to update status file even on error
      try {
        await this.saveStatus({ 
          status: 'stopped', 
          isPianobarRunning: false,
          isPlaying: false,
          updateTime: Date.now(),
          stopTime: Date.now(),
          error: error.message
        });
      } catch (statusError) {
        logger.debug(`Error updating status after stop error: ${statusError.message}`);
      }
      
      throw error;
    }
  }
  
  /**
   * Send a command to pianobar
   */
  async sendCommand(command, silent = false) {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._sendCommandImpl(command, silent),
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
    } else {
      // Fallback without retryHelper
      return this._sendCommandImpl(command, silent);
    }
  }
  
  /**
   * Implementation of sending commands to pianobar
   * @private
   */
  async _sendCommandImpl(command, silent = false) {
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
      
      if (!silent) {
        logger.info(`[${operationId}] Sending command '${command}' (${commandType} - ${timeout}ms timeout)`);
      }
      
      // Ensure FIFO exists
      await this.ensureFifo();
      
      // Send command with timeout
      const writePromise = new Promise((resolve, reject) => {
        try {
          // Simple synchronous write
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
        
        // Record metrics
        if (prometheusMetrics) {
          prometheusMetrics.recordOperation('pianobar-command', false);
        }
        
        return {
          success: false,
          message: `Command '${command}' timed out after ${duration}ms`,
          command,
          duration
        };
      }
      
      if (!silent) {
        logger.info(`[${operationId}] Command sent successfully in ${duration}ms`);
      }
      
      // Update status based on command
      if (command === 'P') {
        this.isPlaying = true;
        await this.saveStatus({
          status: 'playing',
          isPianobarRunning: true,
          isPlaying: true,
          updateTime: Date.now()
        });
        if (prometheusMetrics) {
          prometheusMetrics.recordGauge('pianobar', 'status', 1);
        }
      } else if (command === 'S') {
        this.isPlaying = false;
        await this.saveStatus({
          status: 'paused',
          isPianobarRunning: true,
          isPlaying: false,
          updateTime: Date.now()
        });
        if (prometheusMetrics) {
          prometheusMetrics.recordGauge('pianobar', 'status', 0.5);
        }
      } else if (command === 'q') {
        this.isPlaying = false;
        this.isPianobarRunning = false;
        await this.saveStatus({
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          updateTime: Date.now()
        });
        if (prometheusMetrics) {
          prometheusMetrics.recordGauge('pianobar', 'status', 0);
        }
      }
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('pianobar-command', true);
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
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('pianobar-command', false);
      }
      
      return {
        success: false,
        message: `Error sending command: ${error.message}`,
        error: error.message,
        command,
        duration
      };
    }
  }
  
  /**
   * Play/resume playback
   */
  async play() {
    return this.sendCommand('P');
  }
  
  /**
   * Pause playback
   */
  async pause() {
    return this.sendCommand('S');
  }
  
  /**
   * Skip to next song
   */
  async next() {
    return this.sendCommand('n');
  }
  
  /**
   * Love current song
   */
  async love() {
    return this.sendCommand('+');
  }
  
  /**
   * Select station by ID
   */
  async selectStation(stationId) {
    return this.sendCommand(`s${stationId}`);
  }
  
  /**
   * Get current status
   */
  async getStatus(silent = false) {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._getStatusImpl(silent),
        {
          operationName: 'get-status',
          isCritical: false,
          maxRetries: 2,
          initialDelay: 500,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      return this._getStatusImpl(silent);
    }
  }
  
  /**
   * Check if pianobar process is actually running
   * @private
   */
  async _checkPianobarProcess() {
    try {
      const { stdout } = await execPromise('pgrep pianobar');
      return stdout.trim().length > 0;
    } catch (error) {
      // pgrep returns exit code 1 when no processes found
      return false;
    }
  }

  /**
   * Verify actual process state on startup and clear stale cache
   * @private
   */
  async _verifyAndClearStaleCache() {
    try {
      const actuallyRunning = await this._checkPianobarProcess();
      
      logger.info(`Startup process verification: pianobar actually running = ${actuallyRunning}`);
      
      // Update internal state to match reality
      this.isPianobarRunning = actuallyRunning;
      this.isPlaying = actuallyRunning; // If not running, definitely not playing
      
      // If there's a status file and process isn't running, check for stale data
      if (fs.existsSync(this.pianobarStatusFile)) {
        try {
          const fileData = fs.readFileSync(this.pianobarStatusFile, 'utf8');
          if (fileData && fileData.trim()) {
            const cachedStatus = JSON.parse(fileData);
            
            // If cached status says running but process isn't actually running
            if (cachedStatus.isPianobarRunning && !actuallyRunning) {
              logger.warn('Detected stale cache: status file indicates running but no pianobar process found');
              
              // Clear the stale cache
              const correctedStatus = {
                status: 'stopped',
                isPianobarRunning: false,
                isPlaying: false,
                updateTime: Date.now(),
                stopTime: Date.now(),
                fromCache: false,
                note: 'Corrected stale cache on server startup'
              };
              
              fs.writeFileSync(this.pianobarStatusFile, JSON.stringify(correctedStatus, null, 2));
              logger.info('Cleared stale status cache on server startup');
            } else {
              logger.info('Status cache is consistent with actual process state');
            }
          }
        } catch (parseError) {
          logger.warn(`Error parsing status file during startup verification: ${parseError.message}`);
        }
      } else {
        logger.info('No status cache file found on startup');
      }
    } catch (error) {
      logger.error(`Error during startup verification: ${error.message}`);
    }
  }

  /**
   * Implementation of getting status
   * @private
   */
  async _getStatusImpl(silent = false) {
    try {
      // IMPORTANT: Always verify actual process state first
      const actuallyRunning = await this._checkPianobarProcess();
      
      // If our internal state disagrees with reality, fix it
      if (this.isPianobarRunning !== actuallyRunning) {
        if (!silent) {
          logger.warn(`Process state mismatch detected. Internal state: ${this.isPianobarRunning}, Actual: ${actuallyRunning}. Correcting...`);
        }
        this.isPianobarRunning = actuallyRunning;
        
        // If process isn't running, we can't be playing
        if (!actuallyRunning) {
          this.isPlaying = false;
          
          // Clear stale status cache when we detect process is not running
          try {
            const correctedStatus = {
              status: 'stopped',
              isPianobarRunning: false,
              isPlaying: false,
              updateTime: Date.now(),
              stopTime: Date.now(),
              fromCache: false
            };
            
            fs.writeFileSync(this.pianobarStatusFile, JSON.stringify(correctedStatus, null, 2));
            if (!silent) {
              logger.info('Cleared stale status cache - pianobar process not running');
            }
          } catch (writeError) {
            logger.warn(`Failed to clear stale status cache: ${writeError.message}`);
          }
        }
      }
      
      // Create a status based on verified state
      let statusData = {
        status: this.isPianobarRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
        isPianobarRunning: this.isPianobarRunning,
        isPlaying: this.isPlaying,
        updateTime: Date.now(),
        fromCache: true
      };
      
      // Read from status file if it exists
      if (fs.existsSync(this.pianobarStatusFile)) {
        try {
          const fileData = fs.readFileSync(this.pianobarStatusFile, 'utf8');
          if (fileData && fileData.trim()) {
            const parsedData = JSON.parse(fileData);
            
            // Merge file data but preserve our internal state as the source of truth
            statusData = { 
              ...parsedData,
              isPianobarRunning: this.isPianobarRunning,
              isPlaying: this.isPlaying,
              updateTime: Date.now(),
              fromCache: true
            };
          }
          
          if (!silent) {
            logger.debug(`Read status from file: ${JSON.stringify(statusData)}`);
          }
        } catch (err) {
          logger.warn(`Error reading status file: ${err.message}`);
        }
      } else if (!silent) {
        logger.debug('Status file does not exist, using default status');
      }
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('get-status', true);
      }
      
      return {
        success: true,
        data: statusData
      };
    } catch (error) {
      logger.error(`Error getting status: ${error.message}`);
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('get-status', false);
      }
      
      // Return a default status even on error
      return {
        success: true,
        data: {
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          error: error.message,
          updateTime: Date.now(),
          fromCache: true
        }
      };
    }
  }
  
  /**
   * Get available stations
   */
  async getStations(silent = false) {
    if (this.retryHelper) {
      return this.retryHelper.retryOperation(
        async () => this._getStationsImpl(silent),
        {
          operationName: 'get-stations',
          isCritical: false,
          maxRetries: 2,
          initialDelay: 500,
          backoffFactor: 2
        }
      );
    } else {
      // Fallback without retryHelper
      return this._getStationsImpl(silent);
    }
  }
  
  /**
   * Implementation of getting stations
   * @private
   */
  async _getStationsImpl(silent = false) {
    try {
      // Check if pianobar is running
      if (!this.isPianobarRunning) {
        if (!silent) {
          logger.info('getStations called but pianobar is not running - returning mock data');
        }
        return this.getMockStations(silent);
      }
      
      // Check if stations file exists
      if (!fs.existsSync(this.pianobarStationsFile)) {
        return this.getMockStations(silent);
      }
      
      // Read from stations file
      try {
        const stationsData = JSON.parse(fs.readFileSync(this.pianobarStationsFile, 'utf8'));
        
        // Record metrics
        if (prometheusMetrics) {
          prometheusMetrics.recordOperation('get-stations', true);
        }
        
        return {
          success: true,
          data: {
            stations: stationsData.stations || [],
            mock: stationsData.mock || false,
            isPianobarRunning: true
          }
        };
      } catch (readError) {
        logger.warn(`Error reading stations file: ${readError.message}`);
        return this.getMockStations(silent);
      }
    } catch (error) {
      logger.error(`Error getting stations: ${error.message}`);
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('get-stations', false);
      }
      
      return this.getMockStations(silent);
    }
  }
  
  /**
   * Get mock stations when pianobar is not running
   */
  async getMockStations(silent = false) {
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
    
    // Write mock stations to file if it doesn't exist
    if (!fs.existsSync(this.pianobarStationsFile)) {
      try {
        fs.writeFileSync(this.pianobarStationsFile, JSON.stringify(mockStations, null, 2), 'utf8');
      } catch (error) {
        logger.warn(`Error writing mock stations file: ${error.message}`);
      }
    }
    
    // Record metrics
    if (prometheusMetrics) {
      prometheusMetrics.recordOperation('get-mock-stations', true);
    }
    
    return { 
      success: true, 
      data: { 
        stations: mockStations.stations, 
        mock: true,
        isPianobarRunning: false
      },
      message: 'Pianobar is not running. Start pianobar to see your stations.'
    };
  }
  
  /**
   * Save status to the status file
   */
  async saveStatus(status) {
    const startTime = Date.now();
    
    try {
      if (!status) {
        logger.warn('Attempted to save null/undefined status');
        return false;
      }
      
      // Make sure the parent directory exists
      const statusDir = path.dirname(this.pianobarStatusFile);
      if (!fs.existsSync(statusDir)) {
        logger.info(`Creating status directory: ${statusDir}`);
        fs.mkdirSync(statusDir, { recursive: true });
      }
      
      // Read existing status with proper error handling
      let existingStatus = {};
      
      if (fs.existsSync(this.pianobarStatusFile)) {
        try {
          const existingData = fs.readFileSync(this.pianobarStatusFile, 'utf8');
          if (existingData && existingData.trim().length > 0) {
            existingStatus = JSON.parse(existingData);
          }
        } catch (readError) {
          logger.warn(`Error reading status file: ${readError.message}`);
        }
      }
      
      // Create new status by merging, ensuring updateTime is always set
      const newStatus = { 
        ...existingStatus, 
        ...status, 
        updateTime: Date.now() 
      };
      
      // Write to file
      fs.writeFileSync(this.pianobarStatusFile, JSON.stringify(newStatus, null, 2), 'utf8');
      
      // Record metrics
      const duration = Date.now() - startTime;
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('save-status', true);
        prometheusMetrics.recordGauge('pianobar', 'status-save-time', duration);
      }
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Error saving status after ${duration}ms: ${error.message}`);
      
      // Record metrics
      if (prometheusMetrics) {
        prometheusMetrics.recordOperation('save-status', false);
        prometheusMetrics.recordGauge('pianobar', 'status-errors', 1);
      }
      
      return false;
    }
  }
  
  /**
   * Create the event command script for pianobar
   * This script will be called by pianobar for events
   */
  async createEventCommandScript() {
    // Skip creating the event script since we're using status files directly
    logger.info(`Not writing event script - we're using the existing config file`);
    return true;
  }
  
  /**
   * Clean up orphaned pianobar processes
   */
  async cleanupOrphanedProcesses(force = false, silent = false) {
    try {
      // Get all pianobar processes
      const { stdout } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
      const pids = stdout.trim().split('\n').filter(Boolean);
      
      if (pids.length === 0) {
        if (!silent) {
          logger.info('No pianobar processes found, nothing to clean up');
        }
        return true;
      }
      
      if (!silent) {
        logger.info(`Found ${pids.length} pianobar processes, cleaning up`);
      }
      
      // First try graceful termination
      try {
        // Send quit command if FIFO exists
        if (fs.existsSync(this.pianobarCtl)) {
          await this.sendCommand('q', silent);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (quitError) {
        logger.debug(`Error sending quit command: ${quitError.message}`);
      }
      
      // Check if processes are still running
      const { stdout: checkAfterQuit } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
      const remainingPids = checkAfterQuit.trim().split('\n').filter(Boolean);
      
      if (remainingPids.length === 0) {
        if (!silent) {
          logger.info('All pianobar processes terminated gracefully');
        }
        return true;
      }
      
      // If still running, try SIGTERM
      try {
        await execPromise('pkill -f pianobar || true', { timeout: 5000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (termError) {
        logger.debug(`Error sending SIGTERM: ${termError.message}`);
      }
      
      // Check again
      const { stdout: checkAfterTerm } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
      const remainingAfterTerm = checkAfterTerm.trim().split('\n').filter(Boolean);
      
      if (remainingAfterTerm.length === 0) {
        if (!silent) {
          logger.info('All pianobar processes terminated with SIGTERM');
        }
        return true;
      }
      
      // If still running, use SIGKILL
      try {
        await execPromise('pkill -9 -f pianobar || true', { timeout: 5000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (killError) {
        logger.debug(`Error sending SIGKILL: ${killError.message}`);
      }
      
      // Final check
      const { stdout: finalCheck } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
      const remainingAfterKill = finalCheck.trim().split('\n').filter(Boolean);
      
      if (remainingAfterKill.length === 0) {
        if (!silent) {
          logger.info('All pianobar processes terminated with SIGKILL');
        }
        return true;
      }
      
      logger.warn(`Failed to kill all pianobar processes, ${remainingAfterKill.length} still running`);
      return false;
    } catch (error) {
      logger.error(`Error cleaning up orphaned processes: ${error.message}`);
      throw error;
    }
  }
}

module.exports = PianobarService;