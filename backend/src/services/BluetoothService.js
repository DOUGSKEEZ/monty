/**
 * BluetoothService - Handles Bluetooth connectivity for speakers
 * 
 * This service provides an abstraction over the bt-connect.sh script
 * to manage Bluetooth speaker connectivity. It separates Bluetooth
 * functionality from music playback concerns.
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const IBluetoothService = require('../interfaces/IBluetoothService');
const logger = require('../utils/logger').getModuleLogger('bluetooth-service');
const prometheusMetrics = require('./PrometheusMetricsService');

class BluetoothService extends IBluetoothService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog) {
    super();
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;

    // Configuration
    this.bluetoothScript = '/usr/local/bin/bt-connect.sh';
    this.bluetoothDevice = this.configManager.get('music.bluetoothDevice', '54:B7:E5:87:7B:73');
    this.bluetoothDeviceName = this.configManager.get('music.bluetoothDeviceName', 'Klipsch The Fives');
    
    // State
    this.isConnected = false;
    this.isAudioReady = false;
    this.lastConnectionAttempt = 0;
    this.connectionInProgress = false;
    
    // Auto-disconnect timer state
    this.autoDisconnectTimer = null;
    this.autoDisconnectDelay = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.pianobarIsRunning = false;

    // Register with ServiceRegistry
    this.serviceRegistry.register('BluetoothService', {
      instance: this,
      isCore: false,
      checkHealth: this.healthCheck.bind(this),
    });

    // Register with ServiceWatchdog
    this.serviceWatchdog.registerService('BluetoothService', {
      isCritical: false,
      monitorMemory: false,
      recoveryProcedure: this.recoveryProcedure.bind(this),
    });

    // Mark service as ready
    this.serviceRegistry.setStatus('BluetoothService', 'ready');
    logger.info('BluetoothService registered');

    // Check if we can access the script
    this.checkScriptAccess()
      .then(available => {
        if (available) {
          logger.info(`Bluetooth script found at ${this.bluetoothScript}`);
        } else {
          logger.warn(`Bluetooth script not found at ${this.bluetoothScript} - functionality will be limited`);
        }
      })
      .catch(err => {
        logger.error(`Error checking Bluetooth script: ${err.message}`);
      });
  }

  /**
   * Check if the bt-connect.sh script is accessible
   * @returns {Promise<boolean>} True if the script is accessible
   */
  async checkScriptAccess() {
    try {
      await execPromise(`test -x ${this.bluetoothScript}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize the Bluetooth service
   */
  async initialize() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Initializing Bluetooth subsystems...');
          
          const scriptAvailable = await this.checkScriptAccess();
          if (!scriptAvailable) {
            return {
              success: false,
              message: `Bluetooth script not found at ${this.bluetoothScript}`,
              error: 'SCRIPT_NOT_FOUND'
            };
          }

          const { stdout, stderr } = await execPromise(`${this.bluetoothScript} init`);
          
          prometheusMetrics.recordOperation('bluetooth-init', true);
          return {
            success: true,
            message: 'Bluetooth subsystems initialized successfully',
            details: {
              stdout: stdout.trim(),
              device: this.bluetoothDevice,
              deviceName: this.bluetoothDeviceName
            }
          };
        } catch (error) {
          logger.error(`Error initializing Bluetooth: ${error.message}`);
          prometheusMetrics.recordOperation('bluetooth-init', false);
          return {
            success: false,
            message: 'Failed to initialize Bluetooth subsystems',
            error: error.message
          };
        }
      },
      {
        operationName: 'bluetooth-init',
        isCritical: false,
        maxRetries: 2,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Connect to the Bluetooth device
   * @param {boolean} forceWakeup - Whether to force a wake-up sequence
   */
  async connect(forceWakeup = false) {
    // Prevent multiple simultaneous connection attempts
    if (this.connectionInProgress) {
      return {
        success: false,
        message: 'Connection already in progress',
        error: 'CONNECTION_IN_PROGRESS'
      };
    }

    // Prevent rapid connection attempts (minimum 10 seconds between attempts)
    const now = Date.now();
    if (now - this.lastConnectionAttempt < 10000) {
      return {
        success: false,
        message: 'Connection attempt too soon after previous attempt',
        error: 'TOO_SOON',
        retryAfter: Math.ceil((this.lastConnectionAttempt + 10000 - now) / 1000)
      };
    }

    this.connectionInProgress = true;
    this.lastConnectionAttempt = now;

    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info(`Connecting to Bluetooth device: ${this.bluetoothDeviceName} (${this.bluetoothDevice})`);
          
          const scriptAvailable = await this.checkScriptAccess();
          if (!scriptAvailable) {
            this.connectionInProgress = false;
            return {
              success: false,
              message: `Bluetooth script not found at ${this.bluetoothScript}`,
              error: 'SCRIPT_NOT_FOUND'
            };
          }

          // If force wakeup is specified, run the wakeup command first
          if (forceWakeup) {
            logger.info('Forcing device wake-up sequence before connection');
            await execPromise(`${this.bluetoothScript} wakeup`);
          }

          // Execute the connection command with a longer timeout
          const { stdout, stderr } = await execPromise(`${this.bluetoothScript} connect`, { timeout: 90000 });
          
          // Check for success indicators in the output
          const success = stdout.includes('Success!') || stdout.includes('ready for playback');
          const partialSuccess = stdout.includes('but may not be fully ready') || stdout.includes('Try playing some audio anyway');
          
          if (success || partialSuccess) {
            this.isConnected = true;
            this.isAudioReady = success;
            
            prometheusMetrics.recordOperation('bluetooth-connect', true);
            prometheusMetrics.setServiceHealth('BluetoothService', 'ok');
            
            this.connectionInProgress = false;
            return {
              success: true,
              audioReady: success,
              message: success ? 
                'Successfully connected to Bluetooth speakers with audio ready' : 
                'Connected to Bluetooth speakers but audio may not be fully ready',
              details: {
                stdout: stdout.trim(),
                device: this.bluetoothDevice,
                deviceName: this.bluetoothDeviceName,
                connectionTime: Date.now() - now
              }
            };
          } else {
            this.isConnected = false;
            this.isAudioReady = false;
            
            prometheusMetrics.recordOperation('bluetooth-connect', false);
            prometheusMetrics.setServiceHealth('BluetoothService', 'warning');
            
            this.connectionInProgress = false;
            return {
              success: false,
              message: 'Failed to connect to Bluetooth speakers',
              error: 'CONNECTION_FAILED',
              details: {
                stdout: stdout.trim(),
                device: this.bluetoothDevice,
                deviceName: this.bluetoothDeviceName
              }
            };
          }
        } catch (error) {
          logger.error(`Error connecting to Bluetooth: ${error.message}`);
          prometheusMetrics.recordOperation('bluetooth-connect', false);
          prometheusMetrics.setServiceHealth('BluetoothService', 'error');
          
          this.connectionInProgress = false;
          return {
            success: false,
            message: 'Error connecting to Bluetooth speakers',
            error: error.message
          };
        }
      },
      {
        operationName: 'bluetooth-connect',
        isCritical: false,
        maxRetries: 1, // Don't retry, as the script already has retry logic
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Disconnect from the Bluetooth device
   */
  async disconnect() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Disconnecting from Bluetooth speakers...');
          
          const scriptAvailable = await this.checkScriptAccess();
          if (!scriptAvailable) {
            return {
              success: false,
              message: `Bluetooth script not found at ${this.bluetoothScript}`,
              error: 'SCRIPT_NOT_FOUND'
            };
          }

          const { stdout, stderr } = await execPromise(`${this.bluetoothScript} disconnect`, { timeout: 15000 });
          
          this.isConnected = false;
          this.isAudioReady = false;
          
          prometheusMetrics.recordOperation('bluetooth-disconnect', true);
          
          return {
            success: true,
            message: 'Disconnected from Bluetooth speakers',
            details: {
              stdout: stdout.trim(),
              device: this.bluetoothDevice,
              deviceName: this.bluetoothDeviceName
            }
          };
        } catch (error) {
          logger.error(`Error disconnecting from Bluetooth: ${error.message}`);
          prometheusMetrics.recordOperation('bluetooth-disconnect', false);
          
          return {
            success: false,
            message: 'Failed to disconnect from Bluetooth speakers',
            error: error.message
          };
        }
      },
      {
        operationName: 'bluetooth-disconnect',
        isCritical: false,
        maxRetries: 2,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Get the current Bluetooth connection status
   */
  async getStatus() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.debug('Checking Bluetooth connection status...');
          
          const scriptAvailable = await this.checkScriptAccess();
          if (!scriptAvailable) {
            return {
              success: true,
              isConnected: false,
              isAudioReady: false,
              message: 'Bluetooth script not available',
              details: {
                scriptAvailable: false,
                scriptPath: this.bluetoothScript,
                device: this.bluetoothDevice,
                deviceName: this.bluetoothDeviceName
              }
            };
          }

          const { stdout, stderr, exitCode } = await execPromise(`${this.bluetoothScript} status || echo "Exit code: $?"`);
          
          // Parse the status output
          const connected = stdout.includes('Speakers are connected');
          const audioSinkExists = stdout.includes('Audio sink exists');
          const audioReady = stdout.includes('ready for playback');
          
          // Update internal state
          this.isConnected = connected;
          this.isAudioReady = audioReady;
          
          prometheusMetrics.recordOperation('bluetooth-status', true);
          prometheusMetrics.setServiceHealth('BluetoothService', connected ? 'ok' : 'warning');
          
          return {
            success: true,
            isConnected: connected,
            isAudioReady: audioReady,
            audioSinkExists: audioSinkExists,
            message: connected ? 
              (audioReady ? 'Connected to Bluetooth speakers with audio ready' : 'Connected to Bluetooth speakers but audio not fully ready') : 
              'Not connected to Bluetooth speakers',
            details: {
              stdout: stdout.trim(),
              device: this.bluetoothDevice,
              deviceName: this.bluetoothDeviceName,
              connectionInProgress: this.connectionInProgress,
              lastConnectionAttempt: this.lastConnectionAttempt,
              pianobarIsRunning: this.pianobarIsRunning,
              autoDisconnectPending: this.autoDisconnectTimer !== null,
              autoDisconnectDelayMinutes: this.autoDisconnectDelay / 1000 / 60
            }
          };
        } catch (error) {
          logger.error(`Error checking Bluetooth status: ${error.message}`);
          prometheusMetrics.recordOperation('bluetooth-status', false);
          
          return {
            success: true, // Still return success to avoid API errors
            isConnected: this.isConnected,
            isAudioReady: this.isAudioReady,
            error: error.message,
            message: 'Error checking Bluetooth status',
            details: {
              device: this.bluetoothDevice,
              deviceName: this.bluetoothDeviceName,
              connectionInProgress: this.connectionInProgress,
              lastConnectionAttempt: this.lastConnectionAttempt
            }
          };
        }
      },
      {
        operationName: 'bluetooth-status',
        isCritical: false,
        maxRetries: 1,
        initialDelay: 500,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Wake up the Bluetooth device without full connection
   */
  async wakeup() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Attempting to wake up Bluetooth speakers...');
          
          const scriptAvailable = await this.checkScriptAccess();
          if (!scriptAvailable) {
            return {
              success: false,
              message: `Bluetooth script not found at ${this.bluetoothScript}`,
              error: 'SCRIPT_NOT_FOUND'
            };
          }

          const { stdout, stderr } = await execPromise(`${this.bluetoothScript} wakeup`, { timeout: 30000 });
          
          prometheusMetrics.recordOperation('bluetooth-wakeup', true);
          
          return {
            success: true,
            message: 'Wake-up sequence completed',
            details: {
              stdout: stdout.trim(),
              device: this.bluetoothDevice,
              deviceName: this.bluetoothDeviceName
            }
          };
        } catch (error) {
          logger.error(`Error waking up Bluetooth device: ${error.message}`);
          prometheusMetrics.recordOperation('bluetooth-wakeup', false);
          
          return {
            success: false,
            message: 'Failed to wake up Bluetooth device',
            error: error.message
          };
        }
      },
      {
        operationName: 'bluetooth-wakeup',
        isCritical: false,
        maxRetries: 1,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Get RSSI (Received Signal Strength Indicator) for the connected Bluetooth device
   * @returns {Promise<Object>} RSSI value in dBm or null if not connected
   */
  async getRSSI() {
    try {
      const { stdout, stderr } = await execPromise(`hcitool rssi ${this.bluetoothDevice}`, { timeout: 5000 });

      // Parse the output
      // Connected: "RSSI return value: -58"
      // Not connected: "Not connected."

      if (stdout.includes('Not connected')) {
        return {
          success: true,
          rssi: null,
          connected: false,
          message: 'Bluetooth device not connected'
        };
      }

      // Parse RSSI value from output
      const match = stdout.match(/RSSI return value:\s*(-?\d+)/);
      if (match) {
        const rssi = parseInt(match[1], 10);

        prometheusMetrics.recordOperation('bluetooth-rssi', true);

        return {
          success: true,
          rssi: rssi,
          connected: true,
          message: `RSSI: ${rssi} dBm`
        };
      }

      // Unexpected output format
      logger.warn(`Unexpected hcitool rssi output: ${stdout}`);
      return {
        success: false,
        rssi: null,
        connected: false,
        message: 'Unable to parse RSSI value',
        details: { stdout: stdout.trim() }
      };
    } catch (error) {
      logger.debug(`Error getting Bluetooth RSSI: ${error.message}`);
      prometheusMetrics.recordOperation('bluetooth-rssi', false);

      return {
        success: false,
        rssi: null,
        connected: false,
        message: 'Failed to get RSSI',
        error: error.message
      };
    }
  }

  /**
   * Get diagnostic information about the Bluetooth system
   */
  async getDiagnostics() {
    return this.retryHelper.retryOperation(
      async () => {
        try {
          logger.info('Getting Bluetooth diagnostics...');
          
          const scriptAvailable = await this.checkScriptAccess();
          if (!scriptAvailable) {
            return {
              success: false,
              message: `Bluetooth script not found at ${this.bluetoothScript}`,
              error: 'SCRIPT_NOT_FOUND'
            };
          }

          const { stdout, stderr } = await execPromise(`${this.bluetoothScript} debug`, { timeout: 15000 });
          
          // Check system-level Bluetooth status
          let btServiceActive = false;
          try {
            const { stdout: btStatus } = await execPromise('systemctl is-active bluetooth');
            btServiceActive = btStatus.trim() === 'active';
          } catch (error) {
            logger.warn(`Error checking Bluetooth service status: ${error.message}`);
          }
          
          // Check for Bluetooth adapters
          let btAdapters = [];
          try {
            const { stdout: adapters } = await execPromise('bluetoothctl list');
            btAdapters = adapters.trim().split('\n').filter(line => line.trim() !== '');
          } catch (error) {
            logger.warn(`Error checking Bluetooth adapters: ${error.message}`);
          }
          
          prometheusMetrics.recordOperation('bluetooth-diagnostics', true);
          
          return {
            success: true,
            message: 'Bluetooth diagnostics retrieved',
            details: {
              stdout: stdout.trim(),
              device: this.bluetoothDevice,
              deviceName: this.bluetoothDeviceName,
              bluetoothServiceActive: btServiceActive,
              bluetoothAdapters: btAdapters,
              isConnected: this.isConnected,
              isAudioReady: this.isAudioReady,
              connectionInProgress: this.connectionInProgress,
              lastConnectionAttempt: this.lastConnectionAttempt
            }
          };
        } catch (error) {
          logger.error(`Error getting Bluetooth diagnostics: ${error.message}`);
          prometheusMetrics.recordOperation('bluetooth-diagnostics', false);
          
          return {
            success: false,
            message: 'Failed to get Bluetooth diagnostics',
            error: error.message
          };
        }
      },
      {
        operationName: 'bluetooth-diagnostics',
        isCritical: false,
        maxRetries: 1,
        initialDelay: 1000,
        backoffFactor: 2,
      }
    );
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    const startTime = Date.now();
    try {
      // Just check if we can access the script and get status
      const scriptAvailable = await this.checkScriptAccess();
      
      // Check if service is functional
      const status = scriptAvailable ? 'ok' : 'warning';
      prometheusMetrics.setServiceHealth('BluetoothService', status);
      
      return {
        status,
        message: scriptAvailable ? 
          'BluetoothService is operational' : 
          'BluetoothService is operational but script is not available',
        details: {
          scriptAvailable,
          scriptPath: this.bluetoothScript,
          device: this.bluetoothDevice,
          deviceName: this.bluetoothDeviceName,
          isConnected: this.isConnected,
          isAudioReady: this.isAudioReady,
          lastUpdated: Date.now(),
          responseTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      prometheusMetrics.setServiceHealth('BluetoothService', 'error');
      return {
        status: 'error',
        message: `Health check failed: ${error.message}`,
        details: { 
          lastUpdated: Date.now(), 
          responseTime: Date.now() - startTime 
        },
      };
    }
  }

  /**
   * Called when Pianobar service starts/initializes
   * Cancels any pending auto-disconnect timer
   */
  onPianobarStarted() {
    logger.info('Pianobar started - canceling any pending auto-disconnect');
    this.pianobarIsRunning = true;
    this._cancelAutoDisconnectTimer();
  }

  /**
   * Called when Pianobar service stops/quits (NOT pause)
   * Starts the 5-minute auto-disconnect timer
   */
  onPianobarStopped() {
    logger.info('Pianobar stopped - scheduling Bluetooth auto-disconnect in 5 minutes');
    this.pianobarIsRunning = false;
    this._scheduleAutoDisconnect();
  }

  /**
   * Cancel any pending auto-disconnect timer
   * @private
   */
  _cancelAutoDisconnectTimer() {
    if (this.autoDisconnectTimer) {
      clearTimeout(this.autoDisconnectTimer);
      this.autoDisconnectTimer = null;
      logger.debug('Auto-disconnect timer canceled');
    }
  }

  /**
   * Schedule auto-disconnect after 5 minutes
   * @private
   */
  _scheduleAutoDisconnect() {
    // Cancel any existing timer first
    this._cancelAutoDisconnectTimer();
    
    // Only schedule if we're actually connected
    if (!this.isConnected) {
      logger.debug('Not scheduling auto-disconnect - not connected to Bluetooth');
      return;
    }
    
    logger.info(`Bluetooth auto-disconnect scheduled in ${this.autoDisconnectDelay / 1000 / 60} minutes due to Pianobar shutdown`);
    
    this.autoDisconnectTimer = setTimeout(async () => {
      try {
        // Double-check conditions before disconnecting
        if (this.pianobarIsRunning) {
          logger.info('Auto-disconnect canceled - Pianobar is running again');
          return;
        }
        
        if (!this.isConnected) {
          logger.info('Auto-disconnect skipped - already disconnected');
          return;
        }
        
        logger.info('Auto-disconnecting Bluetooth speakers after 5 minutes of Pianobar inactivity');
        const result = await this.disconnect();
        
        if (result.success) {
          logger.info('✅ Bluetooth auto-disconnect successful - speakers can now enter sleep mode');
        } else {
          logger.warn('⚠️ Bluetooth auto-disconnect failed:', result.message);
        }
      } catch (error) {
        logger.error('❌ Error during auto-disconnect:', error.message);
      } finally {
        this.autoDisconnectTimer = null;
      }
    }, this.autoDisconnectDelay);
  }

  /**
   * Recovery procedure for the service
   */
  async recoveryProcedure(serviceName, attemptNumber) {
    logger.info(`Recovery procedure called for BluetoothService (attempt ${attemptNumber})`);
    try {
      // Reset connection state
      this.connectionInProgress = false;
      
      // Cancel any pending auto-disconnect timer
      this._cancelAutoDisconnectTimer();
      
      // If connected, try to disconnect and reconnect
      if (this.isConnected) {
        await this.disconnect();
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Initialize Bluetooth subsystems
      await this.initialize();
      
      return { 
        success: true, 
        method: 'reset' 
      };
    } catch (error) {
      logger.error(`Recovery failed: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

module.exports = BluetoothService;