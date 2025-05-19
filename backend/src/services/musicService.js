const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('music-service');

class MusicService {
  constructor() {
    // Paths for pianobar
    this.pianobarConfigDir = process.env.PIANOBAR_CONFIG_DIR || path.join(process.env.HOME || '/home/monty', '.config/pianobar');
    this.pianobarCtl = path.join(this.pianobarConfigDir, 'ctl');
    this.pianobarStatusFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
    this.pianobarStationsFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');
    
    // Bluetooth settings
    this.bluetoothDevice = process.env.BLUETOOTH_SPEAKER_MAC || '54:B7:E5:87:7B:73'; // Klipsch The Fives MAC
    
    // Status tracking
    this.isPlaying = false;
    this.isPianobarRunning = false;
    this.isBluetoothConnected = false;
    this.retries = 0;
    this.maxRetries = 3;
    
    // Initialize
    this.init().then(() => {
      // Perform a cleanup of orphaned processes on startup
      this.cleanupOrphanedProcesses(true).catch(err => {
        logger.error(`Error during startup cleanup: ${err.message}`);
      });
    });
  }
  
  /**
   * Initialize the music service
   */
  async init() {
    try {
      // Ensure config directory exists
      await this.ensureConfigDir();
      
      // Check if pianobar is already running
      this.checkPianobarStatus();
      
      // Set up status file watcher
      this.setupStatusFileWatcher();
      
      logger.info('Music service initialized');
    } catch (error) {
      logger.error(`Error initializing music service: ${error.message}`);
    }
  }
  
  /**
   * Ensure the pianobar config directory exists
   */
  async ensureConfigDir() {
    try {
      if (!fs.existsSync(this.pianobarConfigDir)) {
        await execPromise(`mkdir -p ${this.pianobarConfigDir}`);
        logger.info(`Created pianobar config directory at ${this.pianobarConfigDir}`);
      }
      
      // Check if ctl file exists, if not create it
      if (!fs.existsSync(this.pianobarCtl)) {
        await execPromise(`mkfifo ${this.pianobarCtl}`);
        logger.info('Created pianobar control FIFO');
      }
      
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.pianobarStatusFile);
      if (!fs.existsSync(dataDir)) {
        await execPromise(`mkdir -p ${dataDir}`);
        logger.info(`Created data directory at ${dataDir}`);
      }
    } catch (error) {
      logger.error(`Error ensuring config directory: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if pianobar is already running
   * @returns {Promise<boolean>} - True if running, false otherwise
   */
  async checkPianobarStatus() {
    try {
      // Set a timeout for the entire function
      return await Promise.race([
        this._checkPianobarStatusInternal(),
        new Promise(resolve => {
          setTimeout(() => {
            logger.warn('checkPianobarStatus timed out, assuming not running');
            this.isPianobarRunning = false;
            this.isPlaying = false;
            resolve(false);
          }, 2000); // 2 second timeout
        })
      ]);
    } catch (error) {
      logger.info(`Error in checkPianobarStatus: ${error.message}, assuming not running`);
      this.isPianobarRunning = false;
      this.isPlaying = false;
      return false;
    }
  }
  
  /**
   * Internal implementation of checking pianobar status
   * @private
   * @returns {Promise<boolean>} - True if running, false otherwise
   */
  async _checkPianobarStatusInternal() {
    try {
      // Get the list of processes with a timeout
      const { stdout } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 1500 });
      const processList = stdout.trim().split('\n').filter(Boolean);
      
      logger.debug(`Found ${processList.length} pianobar processes`);
      
      // Only consider it running if we have a reasonable number of processes
      if (processList.length > 0 && processList.length < 3) { // Reduced from 5 to 3
        this.isPianobarRunning = true;
        logger.info(`Pianobar is running with ${processList.length} processes`);
      } else if (processList.length >= 3) {
        logger.warn(`Found ${processList.length} pianobar processes, likely zombies - marking as not running`);
        this.isPianobarRunning = false;
        this.isPlaying = false;
        
        // Try to kill the processes in the background, but don't wait for it
        this.cleanupOrphanedProcesses(true).catch(err => {
          logger.error(`Background cleanup error: ${err.message}`);
        });
        
        return false;
      } else {
        logger.info('Pianobar is not running (no processes found)');
        this.isPianobarRunning = false;
        this.isPlaying = false;
      }
      
      return this.isPianobarRunning;
    } catch (error) {
      // pgrep returns non-zero if process not found, so this is expected
      this.isPianobarRunning = false;
      this.isPlaying = false;
      logger.info('Pianobar is not running (check error)');
      return false;
    }
  }
  
  /**
   * Cleanup orphaned pianobar processes
   * @param {boolean} force - Force kill all processes even if few in number
   * @returns {Promise<boolean>} - True if cleanup was successful
   */
  async cleanupOrphanedProcesses(force = false) {
    try {
      // For critical cleanup, set a global timeout
      const cleanupPromise = this._cleanupOrphanedProcessesInternal(force);
      const timeoutPromise = new Promise(resolve => setTimeout(() => {
        logger.warn('Process cleanup timed out, assuming it succeeded anyway');
        resolve(true);
      }, 5000)); // 5 second global timeout
      
      // Wait for either the cleanup to complete or the timeout
      return await Promise.race([cleanupPromise, timeoutPromise]);
    } catch (error) {
      logger.error(`Error in cleanupOrphanedProcesses: ${error.message}`);
      // Reset state anyway
      this.isPianobarRunning = false;
      this.isPlaying = false;
      return false;
    }
  }
  
  /**
   * Internal implementation of process cleanup
   * @private
   * @param {boolean} force - Force kill all processes even if few in number
   * @returns {Promise<boolean>} - True if cleanup was successful
   */
  async _cleanupOrphanedProcessesInternal(force = false) {
    try {
      // Get process list with a timeout
      let processList = [];
      try {
        const result = await Promise.race([
          execPromise('pgrep -f pianobar || echo ""', { timeout: 2000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('pgrep timeout')), 2000))
        ]);
        processList = result.stdout.trim().split('\n').filter(Boolean);
        logger.info(`Found ${processList.length} pianobar processes`);
      } catch (error) {
        logger.warn(`Error getting pianobar processes: ${error.message}`);
        // Continue with killall as a fallback
        processList = ['unknown']; // Just to ensure the cleanup runs
      }
      
      // If too many processes or force is true, clean them up
      if (force || processList.length >= 2) { // Reduced threshold from 3 to 2
        logger.warn(`Cleaning up ${processList.length} pianobar processes`);
        
        // Try all kill methods in parallel for maximum effectiveness
        const killPromises = [
          // Normal kill
          execPromise('pkill -f pianobar').catch(e => {
            logger.info(`Normal pkill result: ${e.message || 'success'}`);
          }),
          
          // Force kill
          execPromise('pkill -9 -f pianobar').catch(e => {
            logger.info(`Force pkill result: ${e.message || 'success'}`);
          }),
          
          // Killall
          execPromise('killall pianobar').catch(e => {
            logger.info(`Killall result: ${e.message || 'success'}`);
          }),
          
          // Force killall
          execPromise('killall -9 pianobar').catch(e => {
            logger.info(`Force killall result: ${e.message || 'success'}`);
          })
        ];
        
        // Wait for all kill commands to complete (they may fail, but that's OK)
        await Promise.allSettled(killPromises);
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify all processes are gone
        try {
          const { stdout } = await execPromise('pgrep -f pianobar || echo ""', { timeout: 2000 });
          const remaining = stdout.trim().split('\n').filter(Boolean);
          
          if (remaining.length > 0) {
            logger.warn(`Still have ${remaining.length} pianobar processes after cleanup attempts`);
          } else {
            logger.info('Successfully cleaned up all pianobar processes');
          }
        } catch (checkError) {
          logger.warn(`Error checking remaining processes: ${checkError.message}`);
        }
        
        // Reset the status file regardless of cleanup success
        this.saveStatus({ status: 'stopped', stopTime: Date.now() });
        this.isPianobarRunning = false;
        this.isPlaying = false;
        return true;
      }
      
      // If we didn't need to clean up, consider that a success
      return true;
    } catch (error) {
      logger.error(`Error in _cleanupOrphanedProcessesInternal: ${error.message}`);
      // Reset state anyway
      this.isPianobarRunning = false;
      this.isPlaying = false;
      return false;
    }
  }
  
  /**
   * Set up a watcher for the status file
   */
  setupStatusFileWatcher() {
    try {
      // Create empty status file if it doesn't exist
      if (!fs.existsSync(this.pianobarStatusFile)) {
        fs.writeFileSync(
          this.pianobarStatusFile, 
          JSON.stringify({ status: 'stopped' }), 
          'utf8'
        );
      }
      
      // Watch for file changes
      fs.watchFile(this.pianobarStatusFile, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          logger.debug('Pianobar status file updated');
        }
      });
    } catch (error) {
      logger.error(`Error setting up status file watcher: ${error.message}`);
    }
  }
  
  /**
   * Connect to Bluetooth speaker
   * @returns {Promise<boolean>} - Success or failure
   */
  async connectBluetooth() {
    try {
      logger.info(`Attempting to connect to Bluetooth speaker: ${this.bluetoothDevice}`);
      
      // Check if device is already connected with a timeout
      try {
        const { stdout: connectedDevices } = await execPromise('bluetoothctl devices Connected', { timeout: 3000 });
        if (connectedDevices.includes(this.bluetoothDevice)) {
          logger.info('Bluetooth speaker already connected');
          this.isBluetoothConnected = true;
          return true;
        }
      } catch (checkError) {
        logger.warn(`Error checking connected devices: ${checkError.message}`);
      }
      
      // Ensure Bluetooth is powered on first
      try {
        await execPromise('bluetoothctl power on', { timeout: 2000 });
        logger.info('Bluetooth powered on');
      } catch (powerError) {
        logger.warn(`Error powering on Bluetooth: ${powerError.message}`);
      }
      
      // Simplified direct connection approach with timeout
      try {
        await execPromise(`bluetoothctl connect ${this.bluetoothDevice}`, { timeout: 10000 });
        
        // Wait a moment for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify connection
        const { stdout } = await execPromise(`bluetoothctl info ${this.bluetoothDevice}`, { timeout: 3000 });
        this.isBluetoothConnected = stdout.includes('Connected: yes');
        
        if (this.isBluetoothConnected) {
          logger.info('Successfully connected to Bluetooth speaker');
          return true;
        } else {
          logger.warn('Bluetooth connection attempt completed but device not connected');
        }
      } catch (connectError) {
        logger.error(`Error during Bluetooth connection: ${connectError.message}`);
      }
      
      // If we reached here without success, try an alternative approach
      logger.info('Trying alternative connection method...');
      
      try {
        // Use a more reliable sequence
        await execPromise('bluetoothctl power on', { timeout: 2000 });
        await execPromise(`bluetoothctl scan on`, { timeout: 2000 });
        
        // Brief scan
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Stop scan and connect
        await execPromise(`bluetoothctl scan off`, { timeout: 2000 });
        await execPromise(`bluetoothctl connect ${this.bluetoothDevice}`, { timeout: 10000 });
        
        // Final verification
        const { stdout } = await execPromise(`bluetoothctl info ${this.bluetoothDevice}`, { timeout: 3000 });
        this.isBluetoothConnected = stdout.includes('Connected: yes');
        
        if (this.isBluetoothConnected) {
          logger.info('Successfully connected to Bluetooth speaker using alternative method');
          return true;
        } else {
          logger.error('All Bluetooth connection attempts failed');
          return false;
        }
      } catch (altError) {
        logger.error(`Error in alternative Bluetooth connection: ${altError.message}`);
        this.isBluetoothConnected = false;
        return false;
      }
    } catch (error) {
      logger.error(`Error connecting to Bluetooth speaker: ${error.message}`);
      this.isBluetoothConnected = false;
      return false;
    }
  }
  
  /**
   * Disconnect from Bluetooth speaker
   * @returns {Promise<boolean>} - Success or failure
   */
  async disconnectBluetooth() {
    try {
      logger.info(`Disconnecting from Bluetooth speaker: ${this.bluetoothDevice}`);
      
      // Check if device is connected
      const { stdout: connectedDevices } = await execPromise('bluetoothctl devices Connected');
      if (!connectedDevices.includes(this.bluetoothDevice)) {
        logger.info('Bluetooth speaker not connected');
        this.isBluetoothConnected = false;
        return true;
      }
      
      // Disconnect from the device
      await execPromise(`bluetoothctl disconnect ${this.bluetoothDevice}`);
      
      // Verify disconnection
      const { stdout } = await execPromise(`bluetoothctl info ${this.bluetoothDevice}`);
      this.isBluetoothConnected = stdout.includes('Connected: yes');
      
      if (!this.isBluetoothConnected) {
        logger.info('Successfully disconnected from Bluetooth speaker');
        return true;
      } else {
        logger.error('Failed to disconnect from Bluetooth speaker');
        return false;
      }
    } catch (error) {
      logger.error(`Error disconnecting from Bluetooth speaker: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Start pianobar
   * @param {boolean} connectBluetoothFirst - Whether to connect to Bluetooth first
   * @returns {Promise<object>} - Result of the operation
   */
  async startPianobar(connectBluetoothFirst = true) {
    try {
      // Set a timeout for the whole operation
      return await Promise.race([
        this._startPianobarInternal(connectBluetoothFirst),
        new Promise(resolve => setTimeout(() => {
          logger.warn('startPianobar timed out, returning failure');
          resolve({
            success: false,
            error: 'Operation timed out',
            timedOut: true
          });
        }, 15000)) // 15 second timeout for the whole operation
      ]);
    } catch (error) {
      logger.error(`Error in startPianobar: ${error.message}`);
      this.saveStatus({ status: 'stopped', error: error.message, stopTime: Date.now() });
      return {
        success: false,
        error: `Failed to start pianobar: ${error.message}`
      };
    }
  }
  
  /**
   * Internal implementation of starting pianobar
   * @private
   * @param {boolean} connectBluetoothFirst - Whether to connect to Bluetooth first
   * @returns {Promise<object>} - Result of the operation
   */
  async _startPianobarInternal(connectBluetoothFirst = true) {
    try {
      // Ensure we have a clean state by forcefully cleaning up any existing processes
      logger.info('Cleaning up any existing pianobar processes before starting');
      await this.cleanupOrphanedProcesses(true);
      
      // Double check if pianobar is still running (shouldn't be after cleanup)
      let isStillRunning = false;
      try {
        isStillRunning = await Promise.race([
          this.checkPianobarStatus(),
          new Promise(resolve => setTimeout(() => resolve(false), 2000))
        ]);
      } catch (error) {
        logger.warn(`Error checking pianobar status: ${error.message}`);
      }
      
      if (isStillRunning) {
        logger.warn('Pianobar is still running after cleanup, attempting force kill');
        try {
          // Directly use force kill methods
          await execPromise('pkill -9 -f pianobar');
          await execPromise('killall -9 pianobar');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for processes to die
        } catch (killError) {
          logger.warn(`Error during force kill: ${killError.message}`);
        }
      }
      
      // Initialize status file to indicate we're starting
      this.saveStatus({ status: 'starting', startTime: Date.now() });
      
      // Connect to Bluetooth speaker if requested
      if (connectBluetoothFirst) {
        logger.info('Attempting to connect to Bluetooth speaker before starting pianobar');
        try {
          const bluetoothPromise = this.connectBluetooth();
          const connected = await Promise.race([
            bluetoothPromise,
            new Promise(resolve => setTimeout(() => resolve(false), 5000))
          ]);
          
          if (!connected) {
            logger.warn('Could not connect to Bluetooth speaker or operation timed out, continuing without it');
          } else {
            logger.info('Successfully connected to Bluetooth speaker');
          }
        } catch (btError) {
          logger.warn(`Bluetooth connection error: ${btError.message}, continuing without it`);
        }
      }
      
      // Create the event command script
      try {
        await this.createEventCommandScript();
      } catch (scriptError) {
        logger.warn(`Error creating event script: ${scriptError.message}, continuing anyway`);
      }
      
      // Start pianobar in the background
      logger.info('Starting pianobar process');
      
      // Start with reliable error handling
      try {
        const pianobar = spawn('pianobar', [], {
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore']
        });
        
        // Don't wait for child process
        pianobar.unref();
        
        // Wait a bit to allow pianobar to start
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (spawnError) {
        logger.error(`Error spawning pianobar: ${spawnError.message}`);
        this.saveStatus({ status: 'stopped', error: spawnError.message, stopTime: Date.now() });
        return {
          success: false,
          error: `Failed to start pianobar: ${spawnError.message}`
        };
      }
      
      // Check if pianobar is running now with a timeout
      let isRunning = false;
      try {
        isRunning = await Promise.race([
          this.checkPianobarStatus(),
          new Promise(resolve => setTimeout(() => resolve(false), 3000)) // 3 second timeout
        ]);
      } catch (error) {
        logger.error(`Error checking if pianobar is running: ${error.message}`);
        isRunning = false;
      }
      
      if (isRunning) {
        this.isPianobarRunning = true;
        this.isPlaying = true;
        logger.info('Pianobar started successfully');
        
        // Update status file
        this.saveStatus({ status: 'playing', startTime: Date.now() });
        
        return {
          success: true,
          message: 'Pianobar started successfully',
          isPlaying: true
        };
      } else {
        logger.error('Failed to start pianobar or confirm it is running');
        this.saveStatus({ status: 'stopped', error: 'Failed to start', stopTime: Date.now() });
        return {
          success: false,
          error: 'Failed to start pianobar'
        };
      }
    } catch (error) {
      logger.error(`Error in _startPianobarInternal: ${error.message}`);
      this.saveStatus({ status: 'stopped', error: error.message, stopTime: Date.now() });
      return {
        success: false,
        error: `Failed to start pianobar: ${error.message}`
      };
    }
  }
  
  /**
   * Stop pianobar
   * @param {boolean} disconnectBluetooth - Whether to disconnect from Bluetooth after stopping
   * @returns {Promise<object>} - Result of the operation
   */
  async stopPianobar(disconnectBluetooth = true) {
    try {
      // Check if pianobar is running
      if (!(await this.checkPianobarStatus())) {
        logger.info('Pianobar is not running');
        return {
          success: true,
          message: 'Pianobar is already stopped',
          isPlaying: false
        };
      }
      
      // Kill pianobar
      logger.info('Stopping pianobar');
      await execPromise('pkill -f pianobar');
      
      // Verify that it stopped
      await new Promise(resolve => setTimeout(resolve, 1000));
      const isRunning = await this.checkPianobarStatus();
      
      if (!isRunning) {
        this.isPianobarRunning = false;
        this.isPlaying = false;
        logger.info('Pianobar stopped successfully');
        
        // Disconnect Bluetooth if requested
        if (disconnectBluetooth) {
          await this.disconnectBluetooth();
        }
        
        // Update status file
        this.saveStatus({ status: 'stopped', stopTime: Date.now() });
        
        return {
          success: true,
          message: 'Pianobar stopped successfully',
          isPlaying: false
        };
      } else {
        logger.error('Failed to stop pianobar');
        return {
          success: false,
          error: 'Failed to stop pianobar'
        };
      }
    } catch (error) {
      logger.error(`Error stopping pianobar: ${error.message}`);
      return {
        success: false,
        error: `Failed to stop pianobar: ${error.message}`
      };
    }
  }
  
  /**
   * Send a command to pianobar via the control FIFO
   * @param {string} command - The command to send
   * @returns {Promise<object>} - Result of the operation
   */
  async sendCommand(command) {
    try {
      // Check if pianobar is running
      if (!(await this.checkPianobarStatus())) {
        logger.warn('Cannot send command - pianobar is not running');
        return {
          success: false,
          error: 'Pianobar is not running'
        };
      }
      
      // Send the command
      logger.info(`Sending pianobar command: ${command}`);
      await execPromise(`echo "${command}" > ${this.pianobarCtl}`);
      
      // Wait a bit for command to take effect
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update play status for play/pause commands
      if (command === 'p') {
        this.isPlaying = !this.isPlaying;
        this.saveStatus({ 
          status: this.isPlaying ? 'playing' : 'paused',
          lastCommand: 'play/pause',
          commandTime: Date.now() 
        });
      } else if (command === 'S') {
        this.isPlaying = false;
        this.saveStatus({ 
          status: 'paused', 
          lastCommand: 'pause',
          commandTime: Date.now() 
        });
      } else if (command === 'P') {
        this.isPlaying = true;
        this.saveStatus({ 
          status: 'playing', 
          lastCommand: 'play',
          commandTime: Date.now() 
        });
      } else if (command === 'n') {
        this.saveStatus({ 
          status: this.isPlaying ? 'playing' : 'paused', 
          lastCommand: 'next',
          commandTime: Date.now() 
        });
      } else if (command === '+') {
        this.saveStatus({ 
          status: this.isPlaying ? 'playing' : 'paused', 
          lastCommand: 'love',
          commandTime: Date.now() 
        });
      } else if (command.startsWith('s ')) {
        this.saveStatus({ 
          status: this.isPlaying ? 'playing' : 'paused', 
          lastCommand: 'change station',
          stationId: command.substring(2),
          commandTime: Date.now() 
        });
      }
      
      return {
        success: true,
        message: `Command sent: ${command}`,
        isPlaying: this.isPlaying
      };
    } catch (error) {
      logger.error(`Error sending pianobar command: ${error.message}`);
      return {
        success: false,
        error: `Failed to send command: ${error.message}`
      };
    }
  }
  
  /**
   * Get the current music status
   * @returns {Promise<object>} - Music status
   */
  async getStatus() {
    try {
      // Set a timeout for the entire function
      return await Promise.race([
        this._getStatusInternal(),
        new Promise(resolve => {
          setTimeout(() => {
            logger.warn('getStatus timed out, returning default status');
            resolve({
              success: true,
              data: {
                status: 'stopped',
                isPianobarRunning: false,
                isPlaying: false,
                isBluetoothConnected: false,
                timedOut: true
              }
            });
          }, 2000); // 2 second timeout for the whole operation
        })
      ]);
    } catch (error) {
      logger.error(`Error in getStatus: ${error.message}`);
      return {
        success: true,
        data: {
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          isBluetoothConnected: false,
          error: `Status retrieval error: ${error.message}`
        }
      };
    }
  }
  
  /**
   * Internal implementation of getting music status
   * @private
   * @returns {Promise<object>} - Music status
   */
  async _getStatusInternal() {
    try {
      // First try to load status from file since that's the most reliable
      let statusData = null;
      try {
        if (fs.existsSync(this.pianobarStatusFile)) {
          const data = fs.readFileSync(this.pianobarStatusFile, 'utf8');
          statusData = JSON.parse(data);
          logger.debug('Successfully loaded status from file');
        }
      } catch (fileError) {
        logger.warn(`Error reading status file: ${fileError.message}`);
      }
      
      // Check if pianobar is running with a short timeout
      let isRunning = false;
      try {
        const checkPromise = this.checkPianobarStatus();
        isRunning = await Promise.race([
          checkPromise,
          new Promise(resolve => setTimeout(() => resolve(false), 1000)) // 1 second timeout
        ]);
      } catch (checkError) {
        logger.warn(`Error checking pianobar status: ${checkError.message}`);
        isRunning = false;
      }
      
      // Check Bluetooth connectivity status with short timeout (only if pianobar is running)
      let bluetoothStatus = false;
      if (isRunning) {
        try {
          const btPromise = execPromise(`bluetoothctl info ${this.bluetoothDevice}`, { timeout: 1500 });
          const btResult = await Promise.race([
            btPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Bluetooth check timeout')), 1500))
          ]);
          
          this.isBluetoothConnected = btResult.stdout.includes('Connected: yes');
          bluetoothStatus = this.isBluetoothConnected;
        } catch (btError) {
          logger.warn(`Error or timeout checking Bluetooth status: ${btError.message}`);
          this.isBluetoothConnected = false;
          bluetoothStatus = false;
        }
      }
      
      // Default status data if not available from file
      if (!statusData) {
        statusData = { status: isRunning ? 'playing' : 'stopped' };
      }
      
      // Ensure status is consistent with running state
      if (!isRunning && statusData.status !== 'stopped') {
        statusData.status = 'stopped';
        this.saveStatus({ status: 'stopped', stopTime: Date.now() });
      }
      
      // Return consistent status
      return {
        success: true,
        data: {
          ...statusData,
          isPianobarRunning: isRunning,
          isPlaying: isRunning && (statusData.status === 'playing' || statusData.status === 'starting'),
          isBluetoothConnected: bluetoothStatus
        }
      };
    } catch (error) {
      logger.error(`Error in _getStatusInternal: ${error.message}`);
      throw error; // Let the outer function handle the error
    }
  }
  
  /**
   * Get the list of available stations
   * @returns {Promise<object>} - Stations list
   */
  async getStations() {
    // Create a mock stations object if no actual data is available
    const createMockStations = () => {
      return {
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
          mock: true
        }
      };
    };
    
    try {
      // Set a quick timeout for the entire function
      const result = await Promise.race([
        this._getStationsInternal(),
        new Promise(resolve => setTimeout(() => {
          logger.warn('getStations timed out, returning mock data');
          resolve(createMockStations());
        }, 2000)) // 2 second timeout for the entire function
      ]);
      
      return result;
    } catch (error) {
      logger.error(`Error in getStations: ${error.message}`);
      return createMockStations();
    }
  }
  
  /**
   * Internal implementation of getStations with all the logic
   * @private
   * @returns {Promise<object>} - Stations list
   */
  async _getStationsInternal() {
    const createMockStations = () => {
      return {
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
          mock: true
        }
      };
    };
    
    try {
      // First cleanup any zombie processes to ensure system health
      let tooManyProcesses = false;
      try {
        tooManyProcesses = await Promise.race([
          this.checkForTooManyProcesses(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('process check timeout')), 1000))
        ]);
      } catch (error) {
        logger.warn(`Process check timed out or failed: ${error.message}`);
        tooManyProcesses = true; // Assume the worst
      }
      
      if (tooManyProcesses) {
        logger.warn('Too many pianobar processes detected, using mock stations');
        return createMockStations();
      }
      
      // Immediate return with either file data or mock data - no waiting
      if (fs.existsSync(this.pianobarStationsFile)) {
        try {
          const data = fs.readFileSync(this.pianobarStationsFile, 'utf8');
          const stations = JSON.parse(data);
          
          // If the file exists but has no stations, use mock data
          if (!stations.stations || !Array.isArray(stations.stations.stations) || stations.stations.stations.length === 0) {
            logger.info('Stations file exists but contains no stations, using mock data');
            return createMockStations();
          }
          
          return {
            success: true,
            data: stations
          };
        } catch (readError) {
          logger.warn(`Error reading stations file: ${readError.message}`);
          return createMockStations();
        }
      }
      
      // No stations file, return mock data immediately
      return createMockStations();
    } catch (error) {
      logger.error(`Error in _getStationsInternal: ${error.message}`);
      return createMockStations();
    }
  }
  
  /**
   * Check if there are too many pianobar processes running
   * @returns {Promise<boolean>}
   */
  async checkForTooManyProcesses() {
    try {
      // Quick check with timeout
      const result = await Promise.race([
        execPromise('pgrep -f pianobar || echo ""', { timeout: 1000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pgrep timeout')), 1000))
      ]);
      
      const count = result.stdout.trim().split('\n').filter(Boolean).length;
      return count >= 3; // Consider 3 or more too many
    } catch (error) {
      logger.warn(`Error checking process count: ${error.message}`);
      return true; // Assume too many on error
    }
  }
  
  /**
   * Create the event command script for pianobar
   */
  async createEventCommandScript() {
    try {
      const scriptPath = path.join(this.pianobarConfigDir, 'eventcmd.sh');
      const scriptContent = `#!/bin/bash

# Pianobar event command script
# This script is called by pianobar when events occur
# It writes song info to a JSON file for the web application to read

# File paths
STATUS_FILE="${this.pianobarStatusFile}"
STATIONS_FILE="${this.pianobarStationsFile}"

# Event type
EVENT="$1"

# Create directory if it doesn't exist
mkdir -p "$(dirname "$STATUS_FILE")"
mkdir -p "$(dirname "$STATIONS_FILE")"

# Process songstart event
if [ "$EVENT" = "songstart" ]; then
    # Create JSON with song info
    cat > "$STATUS_FILE" << EOF
{
    "status": "playing",
    "song": "$4",
    "artist": "$5",
    "album": "$7",
    "station": "$8",
    "stationId": "$10",
    "length": "$6",
    "startTime": $(date +%s),
    "expectedEndTime": $(( $(date +%s) + $(echo "$6" | cut -d':' -f1)*60 + $(echo "$6" | cut -d':' -f2) ))
}
EOF
    echo "Updated song info for: $4 by $5" >&2

# Process songfinish event
elif [ "$EVENT" = "songfinish" ]; then
    # Update status to indicate song finished
    cat > "$STATUS_FILE" << EOF
{
    "status": "changing",
    "lastSong": "$4",
    "lastArtist": "$5",
    "lastStation": "$8",
    "finishTime": $(date +%s)
}
EOF
    echo "Song finished: $4 by $5" >&2

# Process stationfetchplaylist event (indicates station change)
elif [ "$EVENT" = "stationfetchplaylist" ]; then
    # Update status to indicate station change
    cat > "$STATUS_FILE" << EOF
{
    "status": "changing",
    "station": "$8",
    "stationId": "$10",
    "changeTime": $(date +%s)
}
EOF
    echo "Changed to station: $8" >&2

# Process stations event (station list)
elif [ "$EVENT" = "stations" ]; then
    # Parse stations info
    STATIONS=$(echo "$3" | tr '\n' '|' | sed 's/|$//')
    
    # Write stations to file
    cat > "$STATIONS_FILE" << EOF
{
    "stations": [
        $(echo "$STATIONS" | sed 's/|/",\n        "/g; s/^/"/ ; s/$/"/')
    ],
    "fetchTime": $(date +%s)
}
EOF
    echo "Updated stations list" >&2

# Process pausemusic/playmusic events
elif [ "$EVENT" = "pausemusic" ]; then
    # Update status to paused
    cat > "$STATUS_FILE" << EOF
{
    "status": "paused",
    "pauseTime": $(date +%s)
}
EOF
    echo "Playback paused" >&2
    
elif [ "$EVENT" = "playmusic" ]; then
    # Update status to playing
    cat > "$STATUS_FILE" << EOF
{
    "status": "playing",
    "resumeTime": $(date +%s)
}
EOF
    echo "Playback resumed" >&2
    
# Process programmatic exit
elif [ "$EVENT" = "userquit" ] || [ "$EVENT" = "userall" ]; then
    # Update status to stopped
    cat > "$STATUS_FILE" << EOF
{
    "status": "stopped",
    "stopTime": $(date +%s)
}
EOF
    echo "Pianobar stopped" >&2
fi
`;
      
      // Write the script
      fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
      logger.info(`Created pianobar event command script at ${scriptPath}`);
      
      // Add event_command line to config if it doesn't exist
      const configPath = path.join(this.pianobarConfigDir, 'config');
      let configContent = '';
      
      if (fs.existsSync(configPath)) {
        configContent = fs.readFileSync(configPath, 'utf8');
      }
      
      // Add or update event_command line
      if (!configContent.includes('event_command')) {
        configContent += `\nevent_command = ${scriptPath}\n`;
      } else {
        configContent = configContent.replace(
          /event_command\s*=\s*.*/g,
          `event_command = ${scriptPath}`
        );
      }
      
      // Add fifo line if it doesn't exist
      if (!configContent.includes('fifo')) {
        configContent += `\nfifo = ${this.pianobarCtl}\n`;
      }
      
      // Write the updated config
      fs.writeFileSync(configPath, configContent);
      logger.info(`Updated pianobar config at ${configPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Error creating event command script: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Save current status to the status file
   * @param {object} status - Status data to save
   */
  saveStatus(status) {
    try {
      // Read existing status if available
      let existingStatus = {};
      if (fs.existsSync(this.pianobarStatusFile)) {
        const data = fs.readFileSync(this.pianobarStatusFile, 'utf8');
        try {
          existingStatus = JSON.parse(data);
        } catch (e) {
          logger.warn(`Error parsing existing status file: ${e.message}`);
        }
      }
      
      // Merge with new status
      const newStatus = {
        ...existingStatus,
        ...status,
        updateTime: Date.now()
      };
      
      // Write to file
      fs.writeFileSync(
        this.pianobarStatusFile,
        JSON.stringify(newStatus, null, 2),
        'utf8'
      );
    } catch (error) {
      logger.error(`Error saving status: ${error.message}`);
    }
  }
}

// Create and export a singleton instance
const musicService = new MusicService();
module.exports = musicService;