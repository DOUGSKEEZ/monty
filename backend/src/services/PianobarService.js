/**
 * PianobarService - Implementation of the IPianobarService interface
 * 
 * This service handles all interactions with the pianobar application,
 * including starting/stopping, sending commands via FIFO, and monitoring status.
 * It follows the dependency injection pattern for better testability and separation
 * of concerns.
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const IPianobarService = require('../interfaces/IPianobarService');
const logger = require('../utils/logger').getModuleLogger('pianobar-service');
const prometheusMetrics = require('./PrometheusMetricsService');

class PianobarService extends IPianobarService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog) {
    super();
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;

    // Configuration
    this.pianobarConfigDir = path.join(process.env.HOME || '/home/monty', '.config/pianobar');
    this.pianobarCtl = path.join(this.pianobarConfigDir, 'ctl');
    this.pianobarStatusFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
    this.pianobarStationsFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');
    this.defaultStation = this.configManager.get('music.defaultStation', '0');

    // State
    this.isPlaying = false;
    this.isPianobarRunning = false;
    this.pianobarProcess = null;
    
    // Mutex to prevent concurrent operations
    this.startOperationInProgress = false;
    this.stopOperationInProgress = false;
    this.lastOperationTime = 0;

    // Register with ServiceRegistry
    this.serviceRegistry.register('PianobarService', {
      instance: this,
      isCore: false,
      checkHealth: this.healthCheck.bind(this),
    });

    // Register with ServiceWatchdog
    this.serviceWatchdog.registerService('PianobarService', {
      isCritical: false,
      monitorMemory: true,
      memoryThresholdMB: 200,
      recoveryProcedure: this.recoveryProcedure.bind(this),
    });

    // Mark service as ready
    this.serviceRegistry.setStatus('PianobarService', 'ready');
    logger.info('PianobarService registered');
    
    // Initialize basic file structure synchronously
    try {
      this.ensureBasicFileStructure();
    } catch (err) {
      logger.warn(`Basic file structure setup failed: ${err.message}`);
    }
    
    // Set up status file watcher
    this.setupStatusFileWatcher();
  }

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

  async initialize() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Initializing PianobarService...');
          
          // Ensure config directory and FIFO exist
          await this.ensureConfigDir();
          
          // Create event command script
          await this.createEventCommandScript();
          
          // DO NOT auto-check if pianobar is running during initialization
          // This was causing auto-start behavior
          // Instead, assume it's not running until explicitly started
          logger.info('PianobarService initialized (assuming pianobar not running)');
          this.isPianobarRunning = false;
          this.isPlaying = false;
          
          prometheusMetrics.recordOperation('pianobar-init', true);
          return {
            success: true,
            message: 'PianobarService initialized successfully',
            isRunning: false // Assume not running until explicitly started
          };
        } catch (error) {
          logger.error(`Error initializing PianobarService: ${error.message}`);
          prometheusMetrics.recordOperation('pianobar-init', false);
          return {
            success: false,
            message: 'Failed to initialize PianobarService',
            error: error.message
          };
        }
      },
      {
        operationName: 'pianobar-init',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  async healthCheck() {
    const startTime = Date.now();
    try {
      // Don't auto-check if pianobar is running - this could trigger unwanted start
      // Just return the last known status from member variables
      // Only check when explicitly requested by user actions
      
      // Service is healthy if the service itself is responding, not necessarily if pianobar is running
      const status = 'ok';
      prometheusMetrics.setServiceHealth('PianobarService', status);
      
      return {
        status,
        message: `PianobarService is ${this.isPianobarRunning ? 'running' : 'ready'}`,
        details: {
          isPianobarRunning: this.isPianobarRunning,
          isPlaying: this.isPlaying,
          lastUpdated: Date.now(),
          responseTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      logger.error(`Health check failed: ${error.message}`);
      prometheusMetrics.setServiceHealth('PianobarService', 'warning');
      return {
        status: 'warning',
        message: `Health check issue: ${error.message}`,
        details: { 
          lastUpdated: Date.now(), 
          responseTime: Date.now() - startTime 
        },
      };
    }
  }

  async recoveryProcedure(serviceName, attemptNumber) {
    logger.info(`Recovery procedure called for PianobarService (attempt ${attemptNumber})`);
    try {
      // Attempt to clean up orphaned processes first, but only if pianobar was already running
      // This prevents auto-start during recovery
      if (this.isPianobarRunning) {
        await this.cleanupOrphanedProcesses(true, false);
        
        // Only check and stop if we believe pianobar was previously running
        const isStillRunning = await this.checkPianobarStatus(true);
        if (isStillRunning) {
          logger.warn('Pianobar still running after cleanup, attempting forced restart');
          await this.stopPianobar(false);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } else {
        logger.info('Skipping recovery since pianobar was not previously running');
      }
      
      // Re-initialize the service
      await this.initialize();
      
      return { 
        success: true, 
        method: 'restart' 
      };
    } catch (error) {
      logger.error(`Recovery failed: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async ensureConfigDir() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Ensure config directory exists
          if (!fs.existsSync(this.pianobarConfigDir)) {
            await execPromise(`mkdir -p ${this.pianobarConfigDir}`);
            logger.info(`Created pianobar config directory: ${this.pianobarConfigDir}`);
          }
          
          // Check for existing FIFO file and verify it's actually a FIFO
          let needNewFifo = false;
          if (fs.existsSync(this.pianobarCtl)) {
            try {
              // Check if it's actually a FIFO (pipe) or just a regular file
              const stats = fs.statSync(this.pianobarCtl);
              if (!stats.isFIFO()) {
                logger.warn(`Found non-FIFO file at ${this.pianobarCtl}, removing and recreating`);
                await execPromise(`rm ${this.pianobarCtl}`);
                needNewFifo = true;
              } else {
                // It's a valid FIFO, just ensure permissions are correct
                await execPromise(`chmod 666 ${this.pianobarCtl}`);
                logger.debug(`Ensured FIFO control file has proper permissions: ${this.pianobarCtl}`);
              }
            } catch (statError) {
              logger.warn(`Error checking FIFO file: ${statError.message}, recreating`);
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
            await execPromise(`chmod 666 ${this.pianobarCtl}`);
            logger.info(`Created FIFO control file at ${this.pianobarCtl} with read/write permissions`);
          }
          
          // Ensure data directory exists
          const dataDir = path.dirname(this.pianobarStatusFile);
          if (!fs.existsSync(dataDir)) {
            await execPromise(`mkdir -p ${dataDir}`);
            logger.info(`Created data directory: ${dataDir}`);
          }
          
          return true;
        } catch (error) {
          logger.error(`Error ensuring config directory: ${error.message}`);
          throw error;
        }
      },
      {
        operationName: 'ensure-config-dir',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  async checkPianobarStatus(silent = false) {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Use multiple verification methods to be extra sure
          const verificationMethods = [
            { cmd: 'pgrep -f pianobar || echo ""', name: 'pgrep' },
            { cmd: 'pidof pianobar || echo ""', name: 'pidof' }
          ];
          
          let isRunning = false;
          let totalProcesses = 0;
          let pids = [];
          
          for (const method of verificationMethods) {
            try {
              const { stdout } = await execPromise(method.cmd, { timeout: 3000 });
              const processes = stdout.trim().split('\n').filter(Boolean);
              
              if (processes.length > 0) {
                isRunning = true;
                totalProcesses += processes.length;
                pids = [...pids, ...processes];
              }
            } catch (methodError) {
              if (!silent) logger.debug(`${method.name} check error: ${methodError.message}`);
            }
          }
          
          // Remove duplicate PIDs
          pids = [...new Set(pids)];
          
          if (pids.length > 0 && pids.length < 3) {
            if (!silent) {
              logger.info(`Pianobar is running with PIDs: ${pids.join(', ')}`);
            }
            this.isPianobarRunning = true;
          } else if (pids.length >= 3) {
            logger.warn(`Found ${pids.length} pianobar processes, likely orphaned`);
            
            // Set state to not running BEFORE initiating cleanup
            this.isPianobarRunning = false;
            this.isPlaying = false;
            
            // Try to clean up orphaned processes, but don't wait for it
            try {
              this.cleanupOrphanedProcesses(true, silent)
                .catch(err => logger.error(`Background cleanup error: ${err.message}`));
            } catch (cleanupError) {
              logger.error(`Error initiating cleanup: ${cleanupError.message}`);
            }
          } else {
            if (!silent) {
              logger.info('Pianobar is not running');
            }
            this.isPianobarRunning = false;
            this.isPlaying = false;
          }
          
          // Update status file to match our new state
          try {
            await this.saveStatus({
              status: this.isPianobarRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
              updateTime: Date.now(),
              isPianobarRunning: this.isPianobarRunning,
              isPlaying: this.isPlaying
            });
          } catch (statusError) {
            if (!silent) logger.debug(`Error updating status after check: ${statusError.message}`);
          }
          
          return this.isPianobarRunning;
        } catch (error) {
          logger.error(`Error checking pianobar status: ${error.message}`);
          
          // On error, assume not running for safety
          this.isPianobarRunning = false;
          this.isPlaying = false;
          
          throw error;
        }
      },
      {
        operationName: 'check-pianobar-status',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  async cleanupOrphanedProcesses(force = false, silent = false) {
    // Set a global timeout for the entire cleanup operation
    const GLOBAL_CLEANUP_TIMEOUT = 30000; // 30 seconds maximum
    const cleanupStartTime = Date.now();
    
    // Track processes killed for detailed logging
    const killedProcesses = [];
    
    // Create a tracked operation ID for logging
    const operationId = `cleanup-${Date.now()}`;
    if (!silent) {
      logger.info(`[${operationId}] Beginning pianobar process cleanup operation (force=${force})`);
    }
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Step 1: Initial process discovery with detailed logging
          if (!silent) logger.info(`[${operationId}] STEP 1: Identifying all pianobar processes`);
          
          // Get all processes matching pianobar with full command info
          const { stdout: fullProcInfo } = await execPromise('ps -eo pid,ppid,cmd | grep -i pianobar | grep -v grep || echo ""', { timeout: 5000 });
          const processList = fullProcInfo.trim().split('\n').filter(Boolean);
          const parsedProcesses = processList.map(proc => {
            const parts = proc.trim().split(/\s+/);
            return {
              pid: parts[0],
              ppid: parts[1],
              cmd: parts.slice(2).join(' ')
            };
          });
          
          // Also get simple PID list as backup
          const { stdout: simpleCheck } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
          const simplePids = simpleCheck.trim().split('\n').filter(Boolean);
          
          // Comprehensive logging of all discovered processes
          if (!silent) {
            logger.info(`[${operationId}] Found ${parsedProcesses.length} pianobar processes (${simplePids.length} by simple check)`);
            parsedProcesses.forEach(proc => {
              logger.info(`[${operationId}] - PID ${proc.pid} (PPID ${proc.ppid}): ${proc.cmd}`);
            });
          }
          
          // If no processes or cleanup not needed, return early
          if (!force && parsedProcesses.length === 0) {
            if (!silent) logger.info(`[${operationId}] No pianobar processes found, nothing to clean up`);
            return true;
          }
          
          if (!force && parsedProcesses.length === 1 && !parsedProcesses[0].cmd.includes('grep')) {
            if (!silent) logger.info(`[${operationId}] Only one pianobar process found and force=false, skipping cleanup`);
            return true;
          }
          
          // Step 2: Start with graceful termination attempt
          if (!silent) logger.info(`[${operationId}] STEP 2: Attempting graceful termination first`);
          
          // Try sending quit command to FIFO if it exists
          try {
            if (fs.existsSync(this.pianobarCtl)) {
              if (!silent) logger.info(`[${operationId}] Sending 'q' command to pianobar control FIFO`);
              
              // Use writeFile with timeout rather than direct echo
              await new Promise((resolve, reject) => {
                fs.writeFile(this.pianobarCtl, 'q\n', 'utf8', (err) => {
                  if (err) {
                    if (!silent) logger.debug(`[${operationId}] FIFO write error (non-critical): ${err.message}`);
                  } else {
                    if (!silent) logger.debug(`[${operationId}] FIFO command 'q' sent successfully`);
                  }
                  resolve(); // Resolve regardless of error - this is just an attempt
                });
                
                // Add safety timeout
                setTimeout(() => {
                  if (!silent) logger.debug(`[${operationId}] FIFO command timed out, continuing anyway`);
                  resolve();
                }, 2000);
              });
              
              // Wait a moment for command to take effect
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              if (!silent) logger.debug(`[${operationId}] FIFO control file doesn't exist, skipping graceful quit`);
            }
          } catch (fifoError) {
            if (!silent) logger.debug(`[${operationId}] Error sending quit via FIFO: ${fifoError.message}`);
          }
          
          // Check if processes are still running after graceful attempt
          const { stdout: checkAfterGraceful } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
          const remainingAfterGraceful = checkAfterGraceful.trim().split('\n').filter(Boolean);
          
          if (remainingAfterGraceful.length === 0) {
            if (!silent) logger.info(`[${operationId}] All processes terminated gracefully, no force kill needed`);
            
            // Successfully cleaned up
            await this.saveStatus({ status: 'stopped', stopTime: Date.now() });
            this.isPianobarRunning = false;
            this.isPlaying = false;
            this.pianobarProcess = null;
            
            return true;
          }
          
          // Step 3: Standard kill attempts - one by one for each process
          if (!silent) logger.info(`[${operationId}] STEP 3: Standard kill for ${remainingAfterGraceful.length} processes`);
          
          // Kill processes one by one instead of group commands
          for (const pid of remainingAfterGraceful) {
            try {
              if (!silent) logger.debug(`[${operationId}] Sending SIGTERM to PID ${pid}`);
              await execPromise(`kill ${pid}`, { timeout: 5000 });
              killedProcesses.push({ pid, signal: 'SIGTERM', time: Date.now() });
            } catch (killError) {
              if (!silent) logger.debug(`[${operationId}] Error sending SIGTERM to PID ${pid}: ${killError.message}`);
            }
          }
          
          // Wait a moment for standard kills to take effect
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Check if processes are still running after standard kill
          const { stdout: checkAfterKill } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
          const remainingAfterKill = checkAfterKill.trim().split('\n').filter(Boolean);
          
          if (remainingAfterKill.length === 0) {
            if (!silent) logger.info(`[${operationId}] All processes terminated with standard kill`);
            
            // Successfully cleaned up
            await this.saveStatus({ status: 'stopped', stopTime: Date.now() });
            this.isPianobarRunning = false;
            this.isPlaying = false;
            this.pianobarProcess = null;
            
            return true;
          }
          
          // Step 4: Force kill as last resort
          if (!silent) logger.info(`[${operationId}] STEP 4: Force kill for ${remainingAfterKill.length} remaining processes`);
          
          // Force kill remaining processes one by one
          for (const pid of remainingAfterKill) {
            try {
              if (!silent) logger.debug(`[${operationId}] Sending SIGKILL to PID ${pid}`);
              await execPromise(`kill -9 ${pid}`, { timeout: 5000 });
              killedProcesses.push({ pid, signal: 'SIGKILL', time: Date.now() });
            } catch (forceKillError) {
              if (!silent) logger.debug(`[${operationId}] Error sending SIGKILL to PID ${pid}: ${forceKillError.message}`);
            }
          }
          
          // Wait a moment for force kills to take effect
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Step 5: Verify all processes are gone with multiple methods
          if (!silent) logger.info(`[${operationId}] STEP 5: Final verification that all processes are terminated`);
          
          // Try multiple verification methods
          const verificationMethods = [
            { cmd: 'pgrep -f pianobar || echo ""', name: 'pgrep' },
            { cmd: 'ps -eo pid,cmd | grep -i pianobar | grep -v grep || echo ""', name: 'ps' },
            { cmd: 'pidof pianobar || echo ""', name: 'pidof' }
          ];
          
          let allProcessesGone = true;
          
          for (const method of verificationMethods) {
            try {
              const { stdout } = await execPromise(method.cmd, { timeout: 3000 });
              const remaining = stdout.trim().split('\n').filter(Boolean);
              
              if (remaining.length > 0) {
                if (!silent) logger.warn(`[${operationId}] ${method.name} shows ${remaining.length} processes still exist: ${remaining.join(', ')}`);
                allProcessesGone = false;
              } else {
                if (!silent) logger.debug(`[${operationId}] ${method.name} verification: all processes gone`);
              }
            } catch (verifyError) {
              if (!silent) logger.debug(`[${operationId}] Error in ${method.name} verification: ${verifyError.message}`);
            }
          }
          
          // If verification failed but we're past timeout, force completion
          const elapsedTime = Date.now() - cleanupStartTime;
          if (!allProcessesGone && elapsedTime > GLOBAL_CLEANUP_TIMEOUT) {
            if (!silent) logger.warn(`[${operationId}] Cleanup operation timed out after ${elapsedTime}ms, forcing completion`);
            allProcessesGone = true; // Force completion
          }
          
          // Final status update regardless of verification outcome
          await this.saveStatus({ 
            status: 'stopped', 
            stopTime: Date.now(),
            cleanupResult: allProcessesGone ? 'success' : 'incomplete'
          });
          this.isPianobarRunning = false;
          this.isPlaying = false;
          this.pianobarProcess = null;
          
          // Log summary of cleanup operation
          if (!silent) {
            logger.info(`[${operationId}] Cleanup operation completed in ${Date.now() - cleanupStartTime}ms`);
            logger.info(`[${operationId}] Processes killed: ${killedProcesses.length}`);
            logger.info(`[${operationId}] Final verification result: ${allProcessesGone ? 'SUCCESS' : 'INCOMPLETE'}`);
          }
          
          return true;
        } catch (error) {
          logger.error(`[${operationId}] Critical error in cleanupOrphanedProcesses: ${error.message}`);
          
          // Force reset state even on error
          this.isPianobarRunning = false;
          this.isPlaying = false;
          this.pianobarProcess = null;
          await this.saveStatus({ 
            status: 'stopped', 
            stopTime: Date.now(),
            cleanupResult: 'error',
            cleanupError: error.message
          });
          
          throw error;
        }
      },
      {
        operationName: 'cleanup-orphaned-processes',
        isCritical: true,
        maxRetries: 2, // Reduce retries to prevent multiple cleanup attempts
        initialDelay: 1000,
        backoffFactor: 2
      }
    );
  }

  setupStatusFileWatcher() {
    try {
      if (!fs.existsSync(this.pianobarStatusFile)) {
        fs.writeFileSync(this.pianobarStatusFile, JSON.stringify({ status: 'stopped' }), 'utf8');
      }
      
      fs.watchFile(this.pianobarStatusFile, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          try {
            const status = JSON.parse(fs.readFileSync(this.pianobarStatusFile, 'utf8'));
            logger.debug(`Status updated: ${status.status}`);
            
            // Update state based on file
            if (status.status === 'playing') {
              this.isPlaying = true;
              prometheusMetrics.recordGauge('pianobar', 'status', 1);
            } else if (status.status === 'paused') {
              this.isPlaying = false;
              prometheusMetrics.recordGauge('pianobar', 'status', 0.5);
            } else if (status.status === 'stopped') {
              this.isPlaying = false;
              prometheusMetrics.recordGauge('pianobar', 'status', 0);
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

  async startPianobar(silent = false) {
    // Mutex check to prevent concurrent start operations
    if (this.startOperationInProgress) {
      logger.warn('Start operation already in progress, ignoring duplicate request');
      return {
        success: false,
        message: 'Start operation already in progress',
        error: 'OPERATION_IN_PROGRESS'
      };
    }
    
    // Rate limiting check to prevent rapid start attempts
    const now = Date.now();
    if (now - this.lastOperationTime < 5000) { // 5 second cool-down
      logger.warn('Start operation attempted too soon after previous operation');
      return {
        success: false,
        message: 'Please wait before trying again',
        error: 'RATE_LIMITED'
      };
    }
    
    // Set mutex and update timestamp
    this.startOperationInProgress = true;
    this.lastOperationTime = now;
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Check if pianobar is already running
          const isRunning = await this.checkPianobarStatus(silent);
          if (isRunning) {
            if (!silent) {
              logger.info('Pianobar is already running');
            }
            this.startOperationInProgress = false;
            return {
              success: true,
              message: 'Pianobar is already running',
              isPlaying: this.isPlaying
            };
          }
          
          // Ensure config directory exists
          await this.ensureConfigDir();
          
          // Create or update event command script
          await this.createEventCommandScript();
          
          // CRITICAL: Force cleanup of any existing processes before starting
          // This ensures we don't have multiple instances
          logger.info('Performing thorough cleanup before starting pianobar');
          await this.cleanupOrphanedProcesses(true, silent);
          
          // Double-check no processes remain
          const { stdout: checkBeforeStart } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
          if (checkBeforeStart.trim()) {
            const remainingProcesses = checkBeforeStart.trim().split('\n').filter(Boolean);
            logger.warn(`${remainingProcesses.length} pianobar processes still exist after cleanup, forcing kill`);
            
            // Force kill with extreme prejudice
            try {
              await execPromise('pkill -9 -f pianobar', { timeout: 5000 });
              await execPromise('killall -9 pianobar', { timeout: 5000 });
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processes to die
            } catch (forceKillError) {
              logger.debug(`Force kill error (can be ignored): ${forceKillError.message}`);
            }
          }
          
          // Start pianobar process with output capture for debugging
          if (!silent) {
            logger.info('Starting pianobar with output capture...');
          }
          
          // Create log files for pianobar output
          const stdout = fs.openSync('/tmp/pianobar_stdout.log', 'a');
          const stderr = fs.openSync('/tmp/pianobar_stderr.log', 'a');
          
          // First ensure the FIFO file exists and is writable
          if (!fs.existsSync(this.pianobarCtl)) {
            await execPromise(`mkfifo ${this.pianobarCtl}`);
          }
          await execPromise(`chmod 666 ${this.pianobarCtl}`);
          logger.info(`Ensured FIFO exists at ${this.pianobarCtl} with proper permissions`);
          
          // Spawn pianobar process with proper environment setup
          const env = { ...process.env };
          
          // Start pianobar with output logging for better debugging
          this.pianobarProcess = spawn('pianobar', [], {
            detached: true,
            stdio: ['ignore', stdout, stderr],
            env
          });
          
          // Log the PID for debugging
          logger.info(`Started pianobar with PID: ${this.pianobarProcess.pid}`);
          
          // Add an event listener for process exit
          this.pianobarProcess.on('exit', (code, signal) => {
            logger.info(`Pianobar process exited with code ${code} and signal ${signal}`);
            this.isPianobarRunning = false;
            this.isPlaying = false;
          });
          
          // Unref process to prevent it from keeping the Node.js process alive
          this.pianobarProcess.unref();
          
          // Wait longer for pianobar to start properly
          await new Promise(resolve => setTimeout(resolve, 8000));
          
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
            startTime: Date.now()
          });
          
          // Select default station if configured
          if (this.defaultStation && this.defaultStation !== '0') {
            await this.selectStation(this.defaultStation);
          }
          
          prometheusMetrics.recordOperation('start-pianobar', true);
          prometheusMetrics.recordGauge('pianobar', 'status', 1);
          
          // Release mutex
          this.startOperationInProgress = false;
          
          return {
            success: true,
            message: 'Pianobar started successfully',
            isPlaying: true
          };
        } catch (error) {
          logger.error(`Error starting pianobar: ${error.message}`);
          prometheusMetrics.recordOperation('start-pianobar', false);
          prometheusMetrics.recordGauge('pianobar', 'status', 0);
          
          // Clean up after failure
          try {
            await this.cleanupOrphanedProcesses(true, silent);
          } catch (cleanupError) {
            logger.error(`Cleanup after failed start error: ${cleanupError.message}`);
          }
          
          this.isPianobarRunning = false;
          this.isPlaying = false;
          this.pianobarProcess = null;
          
          // Release mutex even on error
          this.startOperationInProgress = false;
          
          throw error;
        }
      },
      {
        operationName: 'start-pianobar',
        isCritical: false,
        maxRetries: 1, // Reduce retries to prevent multiple processes
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  async stopPianobar(silent = false) {
    // Create a tracked operation ID for logging
    const operationId = `stop-${Date.now()}`;
    if (!silent) {
      logger.info(`[${operationId}] Pianobar stop requested`);
    }
    
    // CRITICAL: Ensure all mutex handling is done correctly
    // Use double check mutex pattern for maximum safety
    
    // First check: Quick return if operation already in progress
    if (this.stopOperationInProgress === true) {
      logger.warn(`[${operationId}] Stop operation already in progress, ignoring duplicate request`);
      return {
        success: false,
        message: 'Stop operation already in progress',
        error: 'OPERATION_IN_PROGRESS'
      };
    }
    
    // Try to claim mutex with critical section
    let mutexAcquired = false;
    try {
      // Ensure no other operations interfere
      if (this.startOperationInProgress === true) {
        logger.warn(`[${operationId}] Start operation in progress, cannot stop simultaneously`);
        return {
          success: false,
          message: 'Start operation in progress, please wait',
          error: 'START_OPERATION_IN_PROGRESS'
        };
      }
      
      // Rate limiting check to prevent rapid stop attempts
      const now = Date.now();
      if (now - this.lastOperationTime < 5000) { // 5 second cool-down
        logger.warn(`[${operationId}] Stop operation attempted too soon after previous operation (${now - this.lastOperationTime}ms)`);
        return {
          success: false,
          message: 'Please wait before trying again',
          error: 'RATE_LIMITED'
        };
      }
      
      // Set mutex and update timestamp ATOMICALLY
      if (this.stopOperationInProgress === true) {
        // Double check in case it changed while we were checking rate limit
        logger.warn(`[${operationId}] Stop operation claimed by another thread during rate limit check`);
        return {
          success: false,
          message: 'Stop operation already in progress',
          error: 'MUTEX_RACE_CONDITION'
        };
      }
      
      // Finally, claim the mutex
      if (!silent) logger.debug(`[${operationId}] Acquiring stop operation mutex`);
      this.stopOperationInProgress = true;
      this.lastOperationTime = now;
      mutexAcquired = true;
      
      if (!silent) logger.debug(`[${operationId}] Stop operation mutex acquired successfully`);
    } catch (mutexError) {
      logger.error(`[${operationId}] Critical error acquiring mutex: ${mutexError.message}`);
      // Force reset the mutex - better to risk operation collision than deadlock
      this.stopOperationInProgress = false;
      return {
        success: false,
        message: 'Internal error acquiring operation lock',
        error: 'MUTEX_ERROR'
      };
    }
    
    // Set operation timeout - never hang indefinitely
    const OPERATION_TIMEOUT = 60000; // 60 seconds absolute maximum
    const operationTimeout = setTimeout(async () => {
      logger.error(`[${operationId}] Stop operation timed out after ${OPERATION_TIMEOUT}ms, force releasing mutex`);
      this.stopOperationInProgress = false;
      
      // Force reset state on timeout
      this.isPianobarRunning = false;
      this.isPlaying = false;
      this.pianobarProcess = null;
      await this.saveStatus({ 
        status: 'stopped', 
        stopTime: Date.now(),
        error: 'Operation timed out'
      });
    }, OPERATION_TIMEOUT);
    
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // Step 1: Check if pianobar is actually running
          if (!silent) logger.info(`[${operationId}] STEP 1: Checking if pianobar is running`);
          
          const isRunning = await this.checkPianobarStatus(silent);
          if (!isRunning) {
            if (!silent) {
              logger.info(`[${operationId}] Pianobar is not running, no stop needed`);
            }
            
            // Update state to be consistent
            this.isPianobarRunning = false;
            this.isPlaying = false;
            this.pianobarProcess = null;
            
            // Release mutex
            clearTimeout(operationTimeout);
            this.stopOperationInProgress = false;
            
            return {
              success: true,
              message: 'Pianobar is already stopped',
              isPlaying: false
            };
          }
          
          // Step 2: Attempt graceful quit first
          if (!silent) logger.info(`[${operationId}] STEP 2: Attempting graceful quit via FIFO command`);
          
          // Try graceful quit command first with timeout protection
          let gracefulQuitSucceeded = false;
          try {
            // Track graceful quit with timeout
            const gracefulQuitPromise = this.sendCommand('q', true);
            const timeoutPromise = new Promise(resolve => setTimeout(() => {
              if (!silent) logger.debug(`[${operationId}] Graceful quit command timed out after 5s`);
              resolve({ success: false, timedOut: true });
            }, 5000));
            
            // Race the command against timeout
            const gracefulResult = await Promise.race([gracefulQuitPromise, timeoutPromise]);
            
            // Wait a moment for pianobar to exit
            if (!silent) logger.debug(`[${operationId}] Waiting for graceful exit to take effect`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if it worked
            const stillRunningAfterGraceful = await this.checkPianobarStatus(true);
            if (!stillRunningAfterGraceful) {
              if (!silent) logger.info(`[${operationId}] Graceful quit succeeded, pianobar exited cleanly`);
              gracefulQuitSucceeded = true;
            } else {
              if (!silent) logger.debug(`[${operationId}] Graceful quit did not terminate process, continuing to forced cleanup`);
            }
          } catch (quitError) {
            if (!silent) logger.debug(`[${operationId}] Error sending quit command: ${quitError.message}`);
          }
          
          // Step 3: If graceful quit didn't work, use aggressive cleanup procedure
          if (!gracefulQuitSucceeded) {
            if (!silent) logger.info(`[${operationId}] STEP 3: Graceful quit unsuccessful, using force cleanup procedure`);
            
            // Directly kill any pianobar processes first with both SIGTERM and SIGKILL
            try {
              if (!silent) logger.info(`[${operationId}] Executing direct kill commands for all pianobar processes`);
              
              // First try graceful SIGTERM
              await execPromise(`pkill -f pianobar || true`, { timeout: 5000 });
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processes to terminate
              
              // Then use SIGKILL for any stubborn processes 
              await execPromise(`pkill -9 -f pianobar || true`, { timeout: 5000 });
              await execPromise(`killall -9 pianobar || true`, { timeout: 5000 });
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processes to die
              
              if (!silent) logger.info(`[${operationId}] Direct kill commands executed`);
            } catch (killError) {
              if (!silent) logger.warn(`[${operationId}] Error during direct kill commands: ${killError.message}`);
            }
            
            // Now use our enhanced cleanup procedure with operation ID for tracing
            const cleanupResult = await this.cleanupOrphanedProcesses(true, silent);
            
            if (!silent) {
              if (cleanupResult === true) {
                logger.info(`[${operationId}] Cleanup procedure successful`);
              } else {
                logger.warn(`[${operationId}] Cleanup procedure may have had issues`);
              }
            }
          }
          
          // Step 4: Final verification and state update
          if (!silent) logger.info(`[${operationId}] STEP 4: Final verification and state update`);
          
          // Verify no processes remain - extra paranoid check with multiple verification methods
          let finalVerificationPassed = true;
          try {
            // Use multiple verification methods to be absolutely certain
            const verificationMethods = [
              { cmd: 'pgrep -f pianobar || echo ""', name: 'pgrep', timeout: 3000 },
              { cmd: 'ps -eo pid,cmd | grep -i pianobar | grep -v grep || echo ""', name: 'ps', timeout: 3000 },
              { cmd: 'pidof pianobar || echo ""', name: 'pidof', timeout: 3000 }
            ];
            
            for (const method of verificationMethods) {
              const { stdout } = await execPromise(method.cmd, { timeout: method.timeout });
              const remainingProcesses = stdout.trim().split('\n').filter(Boolean);
              
              if (remainingProcesses.length > 0) {
                if (!silent) {
                  logger.warn(`[${operationId}] ${method.name} found ${remainingProcesses.length} pianobar processes STILL exist`);
                  remainingProcesses.forEach(proc => {
                    logger.warn(`[${operationId}] - ${method.name} found: ${proc}`);
                  });
                }
                finalVerificationPassed = false;
                
                // Last-ditch desperate attempt with maximum force
                try {
                  if (!silent) logger.warn(`[${operationId}] Executing EMERGENCY kill commands`);
                  
                  // Try absolutely everything to kill these processes
                  await execPromise('pkill -9 -f pianobar || true', { timeout: 5000 });
                  await execPromise('killall -9 pianobar || true', { timeout: 5000 });
                  
                  // For stubborn processes, try direct kill with their PIDs
                  for (const procInfo of remainingProcesses) {
                    // Extract PID from process info
                    const pid = procInfo.trim().split(/\s+/)[0];
                    if (pid && /^\d+$/.test(pid)) {
                      await execPromise(`kill -9 ${pid} || true`, { timeout: 3000 });
                      if (!silent) logger.warn(`[${operationId}] Sent SIGKILL directly to PID ${pid}`);
                    }
                  }
                  
                  // Wait for processes to die
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  if (!silent) logger.debug(`[${operationId}] Emergency kill commands executed`);
                } catch (emergencyKillError) {
                  if (!silent) logger.debug(`[${operationId}] Emergency kill error: ${emergencyKillError.message}`);
                }
              } else {
                if (!silent) logger.debug(`[${operationId}] ${method.name} verification: no pianobar processes found`);
              }
            }
            
            // Do one final check with pgrep after all kill attempts
            const { stdout: finalCheck } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 3000 });
            const finalRemainingProcesses = finalCheck.trim().split('\n').filter(Boolean);
            
            if (finalRemainingProcesses.length > 0) {
              if (!silent) {
                logger.error(`[${operationId}] FATAL: ${finalRemainingProcesses.length} pianobar processes STILL exist after all attempts`);
                finalRemainingProcesses.forEach(pid => {
                  logger.error(`[${operationId}] - Cannot kill process: PID ${pid}`);
                });
              }
              finalVerificationPassed = false;
              
              // Even though processes remain, we will still update our internal state
              // to prevent the service from thinking pianobar is running
              if (!silent) logger.info(`[${operationId}] Forcing state reset despite remaining processes`);
            } else {
              if (!silent) logger.info(`[${operationId}] Final verification passed - no pianobar processes remain`);
            }
          } catch (verifyError) {
            if (!silent) logger.debug(`[${operationId}] Error in final verification: ${verifyError.message}`);
            // If verification fails, we still want to update our internal state
            if (!silent) logger.info(`[${operationId}] Forcing state reset despite verification error`);
          }
          
          // Always update status regardless of verification outcome
          this.isPianobarRunning = false;
          this.isPlaying = false;
          this.pianobarProcess = null;
          await this.saveStatus({
            status: 'stopped',
            stopTime: Date.now(),
            verificationPassed: finalVerificationPassed
          });
          
          // Update prometheus metrics
          prometheusMetrics.recordOperation('stop-pianobar', true);
          prometheusMetrics.recordGauge('pianobar', 'status', 0);
          
          // Operation completed - clear timeout and release mutex
          clearTimeout(operationTimeout);
          this.stopOperationInProgress = false;
          
          if (!silent) logger.info(`[${operationId}] Stop operation completed successfully`);
          
          return {
            success: true,
            message: 'Pianobar stopped successfully',
            isPlaying: false,
            finalVerificationPassed
          };
        } catch (error) {
          logger.error(`[${operationId}] Error in stop operation: ${error.message}`);
          prometheusMetrics.recordOperation('stop-pianobar', false);
          
          try {
            // Final safety cleanup on error
            if (!silent) logger.info(`[${operationId}] Attempting emergency cleanup after error`);
            await this.cleanupOrphanedProcesses(true, true);
          } catch (emergencyCleanupError) {
            logger.error(`[${operationId}] Emergency cleanup also failed: ${emergencyCleanupError.message}`);
          }
          
          // Force state reset regardless of errors
          this.isPianobarRunning = false;
          this.isPlaying = false;
          this.pianobarProcess = null;
          await this.saveStatus({ 
            status: 'stopped', 
            stopTime: Date.now(),
            error: error.message
          });
          
          // Always release mutex even on error
          clearTimeout(operationTimeout);
          this.stopOperationInProgress = false;
          
          // Even with an error, we return success to avoid UI blocking
          return {
            success: true,
            message: 'Forced pianobar shutdown after error',
            isPlaying: false,
            error: error.message
          };
        }
      },
      {
        operationName: 'stop-pianobar',
        isCritical: true, // Mark as critical for monitoring
        maxRetries: 1, // Reduce retries to prevent multiple cleanup attempts
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  async play() {
    // Check if pianobar is running first but don't auto-start it
    const isRunning = await this.checkPianobarStatus(true);
    if (!isRunning) {
      // Don't auto-start, return an error instead
      logger.info('Play command requested but pianobar is not running');
      return {
        success: false,
        message: 'Pianobar is not running. Please start it first.',
        error: 'NOT_RUNNING'
      };
    }
    
    // Only send play command if already running
    return this.sendCommand('P', false);
  }

  async pause() {
    return this.sendCommand('S', false);
  }

  async next() {
    return this.sendCommand('n', false);
  }

  async love() {
    return this.sendCommand('+', false);
  }

  async selectStation(stationId) {
    return this.sendCommand(`s${stationId}`, false);
  }

  async sendCommand(command, silent = false) {
    // Create a command-specific operation ID for tracing
    const operationId = `cmd-${command}-${Date.now()}`;
    
    // Set a timeout for the entire command operation
    const COMMAND_TIMEOUT = 10000; // 10 seconds maximum
    
    return this.retryHelper.retryOperation(
      async () => {
        // Track command timing
        const commandStartTime = Date.now();
        
        // Flag to track if we've modified the status file
        let statusUpdated = false;
        
        try {
          if (!silent) {
            logger.info(`[${operationId}] Sending command to pianobar: ${command}`);
          }
          
          // Step 1: Check if pianobar is running with timeout
          if (!silent) logger.debug(`[${operationId}] STEP 1: Verifying pianobar is running`);
          
          const isRunningPromise = this.checkPianobarStatus(true);
          const statusCheckTimeout = new Promise(resolve => {
            setTimeout(() => resolve(false), 3000);
          });
          
          const isRunning = await Promise.race([isRunningPromise, statusCheckTimeout]);
          
          if (!isRunning) {
            if (!silent) logger.warn(`[${operationId}] Cannot send command - pianobar is not running`);
            return {
              success: false,
              message: 'Cannot send command - pianobar is not running',
              error: 'NOT_RUNNING'
            };
          }
          
          // Step 2: Try multiple FIFO communication methods in parallel for better reliability
          if (!silent) logger.info(`[${operationId}] STEP 2: Attempting to send command using multiple methods`);
          
          // First verify the FIFO file exists with proper permissions
          if (!fs.existsSync(this.pianobarCtl)) {
            if (!silent) logger.info(`[${operationId}] FIFO doesn't exist, creating it`);
            try {
              // Create FIFO with proper permissions
              await execPromise(`mkfifo ${this.pianobarCtl}`);
              await execPromise(`chmod 666 ${this.pianobarCtl}`);
              if (!silent) logger.info(`[${operationId}] Created FIFO: ${this.pianobarCtl}`);
              
              // Update the config to use this FIFO
              await this.createEventCommandScript();
            } catch (fifoError) {
              if (!silent) logger.warn(`[${operationId}] Error creating FIFO: ${fifoError.message}`);
              // Continue and try alternatives
            }
          } else {
            // Just ensure proper permissions
            try {
              await execPromise(`chmod 666 ${this.pianobarCtl}`);
              if (!silent) logger.debug(`[${operationId}] Updated FIFO permissions`);
            } catch (permError) {
              if (!silent) logger.warn(`[${operationId}] Failed to set FIFO permissions: ${permError.message}`);
            }
          }
          
          // Create a temporary script for sending commands
          const tempScriptPath = `/tmp/pianobar_cmd_${Date.now()}.sh`;
          const scriptContent = `#!/bin/bash
# Directly send command to pianobar FIFO using multiple methods
echo "[$(date)] Sending command: ${command}" >> /tmp/pianobar_commands.log

# Check if pianobar is running
pids=$(pgrep -f pianobar || echo "")
if [ -z "$pids" ]; then
  echo "[$(date)] Error: Pianobar not running" >> /tmp/pianobar_commands.log
  exit 1
fi

# Check if FIFO exists
if [ ! -p "${this.pianobarCtl}" ]; then
  echo "[$(date)] FIFO doesn't exist, creating it" >> /tmp/pianobar_commands.log
  mkfifo "${this.pianobarCtl}"
  chmod 666 "${this.pianobarCtl}"
fi

# Try multiple ways to write to FIFO
echo "[$(date)] Trying echo method" >> /tmp/pianobar_commands.log
(echo "${command}" > "${this.pianobarCtl}") &
pid1=$!

sleep 1
kill -0 $pid1 2>/dev/null && {
  echo "[$(date)] Echo process ($pid1) still running, killing it" >> /tmp/pianobar_commands.log
  kill $pid1 2>/dev/null
}

echo "[$(date)] Trying cat method" >> /tmp/pianobar_commands.log
(cat > "${this.pianobarCtl}" << EOF
${command}
EOF
) &
pid2=$!

sleep 1
kill -0 $pid2 2>/dev/null && {
  echo "[$(date)] Cat process ($pid2) still running, killing it" >> /tmp/pianobar_commands.log
  kill $pid2 2>/dev/null
}

# For play/pause, try signal method too
if [ "${command}" = "P" ] || [ "${command}" = "S" ]; then
  echo "[$(date)] Using SIGUSR1 signal method for play/pause" >> /tmp/pianobar_commands.log
  pid=$(echo "$pids" | head -1)
  kill -SIGUSR1 $pid
fi

echo "[$(date)] Command processing complete" >> /tmp/pianobar_commands.log
`;
          fs.writeFileSync(tempScriptPath, scriptContent, { mode: 0o755 });
          
          // Execute the command script
          try {
            if (!silent) logger.info(`[${operationId}] Executing command script for better reliability`);
            await execPromise(`bash ${tempScriptPath}`, { timeout: 5000 });
            if (!silent) logger.info(`[${operationId}] Command script executed successfully`);
            var commandSuccess = true;
          } catch (scriptError) {
            if (!silent) logger.warn(`[${operationId}] Command script error: ${scriptError.message}`);
            var commandSuccess = false;
          }
          
          // Try to clean up temp file
          try {
            fs.unlinkSync(tempScriptPath);
          } catch (unlinkError) {
            // Ignore cleanup errors
          }
          
          // If all methods failed
          if (!commandSuccess) {
            if (!silent) logger.warn(`[${operationId}] Command write failed after trying all methods`);
            
            // Try more desperate measures - recreate FIFO and try direct command
            try {
              // Remove and recreate the FIFO as a last resort
              if (!silent) logger.info(`[${operationId}] Attempting last resort FIFO recreation`);
              if (fs.existsSync(this.pianobarCtl)) {
                await execPromise(`rm ${this.pianobarCtl}`);
              }
              await execPromise(`mkfifo ${this.pianobarCtl}`);
              await execPromise(`chmod 666 ${this.pianobarCtl}`);
              
              // Try a super-direct approach using a temp script
              const tempScriptPath = `/tmp/pianobar_cmd_${Date.now()}.sh`;
              const scriptContent = `#!/bin/bash
# Directly send command to pianobar FIFO using multiple methods
echo "Sending command: ${command}" >> /tmp/pianobar_commands.log
echo "${command}" > ${this.pianobarCtl} || true
cat > ${this.pianobarCtl} << EOF
${command}
EOF
`;
              fs.writeFileSync(tempScriptPath, scriptContent, { mode: 0o755 });
              
              // Execute the script with higher privileges if possible
              await execPromise(`bash ${tempScriptPath}`, { timeout: 5000 });
              
              // Try direct process signal as a last resort for play/pause commands
              if (command === 'P' || command === 'S') {
                try {
                  const { stdout } = await execPromise('pgrep -f pianobar || echo ""');
                  const pids = stdout.trim().split('\n').filter(Boolean);
                  if (pids.length > 0) {
                    // Use SIGUSR1 for play/pause toggle in pianobar
                    await execPromise(`kill -SIGUSR1 ${pids[0]}`);
                    if (!silent) logger.info(`[${operationId}] Sent SIGUSR1 to pianobar process ${pids[0]}`);
                  }
                } catch (sigError) {
                  if (!silent) logger.debug(`[${operationId}] Signal error: ${sigError.message}`);
                }
              }
              
              // Try to clean up temp file
              try {
                fs.unlinkSync(tempScriptPath);
              } catch (unlinkError) {
                // Ignore cleanup errors
              }
              
              if (!silent) logger.info(`[${operationId}] Last resort FIFO command attempts completed`);
              
              // Consider the command successful and update our state accordingly
              commandSuccess = true;
            } catch (lastResortError) {
              if (!silent) logger.error(`[${operationId}] Last resort failed: ${lastResortError.message}`);
              
              // If this is a critical command like quit, try direct process signal
              if (command === 'q') {
                if (!silent) logger.info(`[${operationId}] Quit command failed, attempting direct process termination`);
                // This will handle the direct termination
                return this.stopPianobar(silent);
              }
              
              return {
                success: false,
                message: 'Failed to send command through FIFO after trying all methods',
                error: 'FIFO_BLOCKED',
                commandAttempted: command
              };
            }
          }
          
          // Step 3: Update status based on command
          if (!silent) logger.debug(`[${operationId}] STEP 3: Updating status based on command`);
          
          const statusUpdateData = { 
            updateTime: Date.now(), 
            lastCommand: command,
            isPianobarRunning: true  // Ensure we're recording that pianobar is still running
          };
          
          if (command === 'P') {
            this.isPlaying = true;
            statusUpdateData.status = 'playing';
            statusUpdateData.isPlaying = true;
            prometheusMetrics.recordGauge('pianobar', 'status', 1);
          } else if (command === 'S') {
            this.isPlaying = false;
            statusUpdateData.status = 'paused';
            statusUpdateData.isPlaying = false;
            prometheusMetrics.recordGauge('pianobar', 'status', 0.5);
          } else if (command === 'q') {
            this.isPlaying = false;
            this.isPianobarRunning = false; // Update internal state too
            statusUpdateData.status = 'stopped';
            statusUpdateData.isPianobarRunning = false;  // Will be set to false after quit command
            statusUpdateData.isPlaying = false;
            prometheusMetrics.recordGauge('pianobar', 'status', 0);
          } else if (command === 'n') {
            // Next song
            statusUpdateData.status = this.isPlaying ? 'playing' : 'paused';
            statusUpdateData.isPlaying = this.isPlaying;
            statusUpdateData.lastCommand = 'next';
          } else if (command === '+') {
            // Love song
            statusUpdateData.status = this.isPlaying ? 'playing' : 'paused';
            statusUpdateData.isPlaying = this.isPlaying;
            statusUpdateData.lastCommand = 'love';
          } else if (command.startsWith('s')) {
            // Station selection
            statusUpdateData.status = this.isPlaying ? 'playing' : 'paused';
            statusUpdateData.isPlaying = this.isPlaying;
            statusUpdateData.lastCommand = 'station';
            statusUpdateData.stationId = command.substring(1).trim();
          }
          
          // Update status file
          try {
            await this.saveStatus(statusUpdateData);
            statusUpdated = true;
          } catch (statusError) {
            if (!silent) logger.warn(`[${operationId}] Error updating status: ${statusError.message}`);
          }
          
          // Record operation success
          prometheusMetrics.recordOperation('pianobar-command', true);
          
          // Calculate command execution time
          const commandDuration = Date.now() - commandStartTime;
          if (!silent) {
            logger.info(`[${operationId}] Command completed successfully in ${commandDuration}ms`);
          }
          
          return {
            success: true,
            message: `Command sent: ${command}`,
            command,
            duration: commandDuration
          };
        } catch (error) {
          const errorTime = Date.now() - commandStartTime;
          logger.error(`[${operationId}] Error sending command to pianobar after ${errorTime}ms: ${error.message}`);
          
          // Record operation failure
          prometheusMetrics.recordOperation('pianobar-command', false);
          
          // If we haven't updated status yet but need to
          if (!statusUpdated && ['P', 'S', 'q'].includes(command)) {
            try {
              // Attempt status update even on error
              const errorStatus = command === 'q' ? 'stopped' : (command === 'S' ? 'paused' : 'playing');
              
              // Update internal state
              if (command === 'q') {
                this.isPianobarRunning = false;
                this.isPlaying = false;
              } else if (command === 'S') {
                this.isPlaying = false;
              } else if (command === 'P') {
                this.isPlaying = true;
              }
              
              // Save status with explicit state flags
              await this.saveStatus({
                status: errorStatus,
                updateTime: Date.now(),
                error: `Command error: ${error.message}`,
                isPianobarRunning: command === 'q' ? false : true,
                isPlaying: command === 'P'
              });
              
              // Log what happened
              logger.info(`[${operationId}] Updated state after error: isPianobarRunning=${this.isPianobarRunning}, isPlaying=${this.isPlaying}`);
            } catch (statusError) {
              logger.debug(`[${operationId}] Error updating status after command error: ${statusError.message}`);
            }
          }
          
          return {
            success: false,
            message: `Failed to send command: ${error.message}`,
            error: error.message,
            command,
            duration: errorTime
          };
        }
      },
      {
        operationName: `pianobar-command-${command}`,
        isCritical: command === 'q', // Quit command is critical
        maxRetries: command === 'q' ? 1 : 2, // Fewer retries for quit
        initialDelay: 500,
        backoffFactor: 2,
      }
    );
  }

  async getStatus(silent = false) {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // IMPORTANT: DO NOT call checkPianobarStatus() here as it will check the actual process
          // Instead, just read the saved status file and return the cached status
          
          // Create a default status based on our internal state variables
          let statusData = {
            status: this.isPianobarRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
            updateTime: Date.now(),
            isPianobarRunning: this.isPianobarRunning,
            isPlaying: this.isPlaying
          };
          
          // Read from status file if it exists
          if (fs.existsSync(this.pianobarStatusFile)) {
            try {
              const fileData = JSON.parse(fs.readFileSync(this.pianobarStatusFile, 'utf8'));
              
              // Merge file data but preserve our internal state as the source of truth
              // for isPianobarRunning and isPlaying
              statusData = { 
                ...fileData,
                isPianobarRunning: this.isPianobarRunning,
                isPlaying: this.isPlaying,
                updateTime: Date.now()
              };
              
              if (!silent) {
                logger.debug(`Read status from file: ${JSON.stringify(statusData, null, 2)}`);
              }
            } catch (err) {
              logger.warn(`Error reading status file: ${err.message}`);
            }
          } else if (!silent) {
            logger.debug('Status file does not exist, using default status');
          }
          
          // No need to update the status file here - let's avoid unnecessary writes
          
          prometheusMetrics.recordOperation('get-status', true);
          
          return {
            success: true,
            data: statusData,
          };
        } catch (error) {
          logger.error(`Error getting status: ${error.message}`);
          prometheusMetrics.recordOperation('get-status', false);
          throw error;
        }
      },
      {
        operationName: 'get-status',
        isCritical: false,
        maxRetries: 2,
        initialDelay: 500,
        backoffFactor: 2,
      }
    );
  }

  async getStations(silent = false) {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          // IMPORTANT: Check if pianobar is running first, don't auto-start
          const isRunning = await this.checkPianobarStatus(true);
          if (!isRunning) {
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
            
            prometheusMetrics.recordOperation('get-stations', true);
            
            return {
              success: true,
              data: {
                stations: stationsData.stations || [],
                mock: stationsData.mock || false,
                isPianobarRunning: true // Add this flag for frontend awareness
              }
            };
          } catch (err) {
            logger.warn(`Error reading stations file: ${err.message}`);
            return this.getMockStations(silent);
          }
        } catch (error) {
          logger.error(`Error getting stations: ${error.message}`);
          prometheusMetrics.recordOperation('get-stations', false);
          throw error;
        }
      },
      {
        operationName: 'get-stations',
        isCritical: false,
        maxRetries: 2,
        initialDelay: 500,
        backoffFactor: 2,
      }
    );
  }

  async getMockStations(silent = false) {
    const mockStations = {
      stations: [
        "Quick Mix",
        "Today's Hits",
        "Pop Hits",
        "Relaxing Instrumental",
        "Classic Rock",
        "Smooth Jazz",
      ],
      mock: true,
    };
    
    // Write mock stations to file if it doesn't exist
    if (!fs.existsSync(this.pianobarStationsFile)) {
      try {
        fs.writeFileSync(this.pianobarStationsFile, JSON.stringify(mockStations, null, 2), 'utf8');
      } catch (error) {
        logger.warn(`Error writing mock stations file: ${error.message}`);
      }
    }
    
    prometheusMetrics.recordOperation('get-mock-stations', true);
    
    return { 
      success: true, 
      data: { 
        stations: mockStations.stations, 
        mock: true,
        isPianobarRunning: false // Explicitly set to false for mock stations
      },
      message: 'Pianobar is not running. Start pianobar to see your stations.' 
    };
  }

  async createEventCommandScript() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info(`ALERT: Not writing event script. Using existing script at /home/monty/.config/pianobar/eventcmd.sh`);
          
          // Instead of overwriting the existing script, we'll work with what we have
          // Read the existing configuration
          const configPath = path.join(this.pianobarConfigDir, 'config');
          let configContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
          
          // Update FIFO path if needed
          if (!configContent.includes('fifo')) {
            configContent += `\nfifo = ${this.pianobarCtl}\n`;
          } else {
            configContent = configContent.replace(/fifo\s*=\s*.*/g, `fifo = ${this.pianobarCtl}`);
          }
          
          // Update event command path if needed (but don't create a new script)
          const existingScriptPath = '/home/monty/.config/pianobar/eventcmd.sh';
          if (!configContent.includes('event_command')) {
            configContent += `\nevent_command = ${existingScriptPath}\n`;
          } else {
            configContent = configContent.replace(/event_command\s*=\s*.*/g, `event_command = ${existingScriptPath}`);
          }
          
          // Write updated config
          fs.writeFileSync(configPath, configContent);
          
          // Make sure the existing script is executable
          await execPromise(`chmod +x ${existingScriptPath}`);
          
          logger.info(`Successfully updated pianobar configuration`);
          prometheusMetrics.recordOperation('create-event-script', true);
          return true;
        } catch (error) {
          logger.error(`Error creating event command script: ${error.message}`);
          prometheusMetrics.recordOperation('create-event-script', false);
          throw error;
        }
      },
      {
        operationName: 'create-event-script',
        isCritical: false,
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  async saveStatus(status) {
    const operationId = `status-${Date.now()}`;
    const startTime = Date.now();
    
    try {
      if (!status) {
        logger.warn(`[${operationId}] Attempted to save null/undefined status`);
        return false;
      }
      
      // Make sure the parent directory exists
      const statusDir = path.dirname(this.pianobarStatusFile);
      if (!fs.existsSync(statusDir)) {
        logger.info(`[${operationId}] Creating status directory: ${statusDir}`);
        fs.mkdirSync(statusDir, { recursive: true });
      }
      
      // Use a temporary file for atomic write with unique name to avoid collisions
      const randomSuffix = Math.floor(Math.random() * 10000);
      const tempFile = `${this.pianobarStatusFile}.${process.pid}.${randomSuffix}.tmp`;
      
      // Debug log
      if (status.status) {
        logger.debug(`[${operationId}] Saving status: ${status.status}`);
      } else {
        logger.debug(`[${operationId}] Updating status (without status change)`);
      }
      
      // Try to read existing status with proper error handling
      let existingStatus = {};
      let existingData = null;
      
      if (fs.existsSync(this.pianobarStatusFile)) {
        try {
          existingData = fs.readFileSync(this.pianobarStatusFile, 'utf8');
          if (existingData && existingData.trim().length > 0) {
            existingStatus = JSON.parse(existingData);
            logger.debug(`[${operationId}] Successfully read existing status file (${existingData.length} bytes)`);
          } else {
            logger.debug(`[${operationId}] Existing status file is empty or has no content`);
          }
        } catch (readError) {
          logger.warn(`[${operationId}] Error reading status file: ${readError.message}`);
          
          // If JSON parse error, try to salvage the file contents
          if (readError instanceof SyntaxError && existingData) {
            logger.debug(`[${operationId}] Attempting to recover from corrupt JSON`);
            
            try {
              // Try to clean up the JSON by removing trailing commas and fixing quotes
              const cleanedData = existingData
                .replace(/,\s*}/g, '}')        // Remove trailing commas before }
                .replace(/,\s*\]/g, ']')       // Remove trailing commas before ]
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are quoted
                .replace(/'/g, '"');           // Replace single quotes with double quotes
              
              existingStatus = JSON.parse(cleanedData);
              logger.debug(`[${operationId}] Successfully recovered JSON from corrupt file`);
            } catch (recoveryError) {
              logger.warn(`[${operationId}] Failed to recover JSON: ${recoveryError.message}`);
              // Continue with empty object on parse error
              existingStatus = {};
            }
          } else {
            // Continue with empty object on other errors
            existingStatus = {};
          }
        }
      } else {
        logger.debug(`[${operationId}] Status file doesn't exist yet, creating new one`);
      }
      
      // Create new status by merging, ensuring updateTime is always set
      const newStatus = { 
        ...existingStatus, 
        ...status, 
        updateTime: Date.now() 
      };
      
      // Log status changes
      if (existingStatus.status !== newStatus.status && newStatus.status) {
        logger.info(`[${operationId}] Status changing: ${existingStatus.status || 'unknown'} -> ${newStatus.status}`);
      }
      
      // Write to temp file first using async write with promise wrapper
      try {
        const writePromise = new Promise((resolve, reject) => {
          // First write the data to the temp file
          fs.writeFile(tempFile, JSON.stringify(newStatus, null, 2), 'utf8', (writeErr) => {
            if (writeErr) {
              logger.error(`[${operationId}] Error writing to temp file: ${writeErr.message}`);
              reject(writeErr);
              return;
            }
            
            // Then sync to ensure it's flushed to disk
            fs.fsync(fs.openSync(tempFile, 'r'), (syncErr) => {
              if (syncErr) {
                logger.warn(`[${operationId}] Fsync warning (non-critical): ${syncErr.message}`);
                // Continue despite fsync error
              }
              
              // Now do the atomic rename
              try {
                fs.renameSync(tempFile, this.pianobarStatusFile);
                logger.debug(`[${operationId}] Atomic rename successful`);
                resolve(true);
              } catch (renameErr) {
                logger.error(`[${operationId}] Atomic rename failed: ${renameErr.message}`);
                reject(renameErr);
              }
            });
          });
        });
        
        // Wait for the write with timeout
        const writeTimeout = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Status write operation timed out after 5s'));
          }, 5000);
        });
        
        await Promise.race([writePromise, writeTimeout]);
        
        logger.debug(`[${operationId}] Status file updated successfully (${JSON.stringify(newStatus).length} bytes)`);
      } catch (writeError) {
        logger.error(`[${operationId}] Error during atomic write: ${writeError.message}`);
        
        // Fallback to direct write as last resort
        try {
          logger.debug(`[${operationId}] Attempting direct write fallback`);
          fs.writeFileSync(this.pianobarStatusFile, JSON.stringify(newStatus, null, 2), 'utf8');
          logger.debug(`[${operationId}] Direct write fallback succeeded`);
        } catch (fallbackError) {
          logger.error(`[${operationId}] Direct write fallback also failed: ${fallbackError.message}`);
          throw fallbackError; // Let the outer catch handle it
        }
      }
      
      // Update internal state based on status
      if (status.status === 'playing') {
        this.isPlaying = true;
      } else if (status.status === 'paused' || status.status === 'stopped') {
        this.isPlaying = false;
      }
      
      // Record operation success and duration
      const duration = Date.now() - startTime;
      prometheusMetrics.recordOperation('save-status', true);
      prometheusMetrics.recordGauge('pianobar', 'status-save-time', duration);
      
      logger.debug(`[${operationId}] Status save completed in ${duration}ms`);
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${operationId}] Critical error saving status after ${duration}ms: ${error.message}`);
      prometheusMetrics.recordOperation('save-status', false);
      prometheusMetrics.recordGauge('pianobar', 'status-errors', 1);
      
      // Try one last emergency direct write with minimal JSON
      try {
        const emergencyStatus = {
          status: status.status || 'unknown',
          updateTime: Date.now(),
          error: `Status save error: ${error.message}`,
          emergency: true
        };
        fs.writeFileSync(this.pianobarStatusFile, JSON.stringify(emergencyStatus), 'utf8');
        logger.debug(`[${operationId}] Emergency minimal status save succeeded`);
      } catch (emergencyError) {
        logger.error(`[${operationId}] Emergency status save also failed: ${emergencyError.message}`);
      }
      
      return false;
    }
  }
}

module.exports = PianobarService;