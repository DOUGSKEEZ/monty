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
    this.init();
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
   */
  async checkPianobarStatus() {
    try {
      const { stdout } = await execPromise('pgrep -f pianobar');
      this.isPianobarRunning = !!stdout.trim();
      
      if (this.isPianobarRunning) {
        logger.info('Pianobar is already running');
        this.isPlaying = true; // Assume it's playing if it's running
      } else {
        logger.info('Pianobar is not running');
      }
      
      return this.isPianobarRunning;
    } catch (error) {
      // pgrep returns non-zero if process not found, so this is expected
      this.isPianobarRunning = false;
      this.isPlaying = false;
      logger.info('Pianobar is not running');
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
      
      // Check if device is already connected
      const { stdout: connectedDevices } = await execPromise('bluetoothctl devices Connected');
      if (connectedDevices.includes(this.bluetoothDevice)) {
        logger.info('Bluetooth speaker already connected');
        this.isBluetoothConnected = true;
        return true;
      }
      
      // Connect to the device with a script
      const scriptContent = `
#!/bin/bash
# Connect to Bluetooth speaker
echo "Connecting to ${this.bluetoothDevice}..."
bluetoothctl power on
bluetoothctl scan on &
sleep 2
bluetoothctl scan off
bluetoothctl connect ${this.bluetoothDevice}
sleep 2
# Check if connected
if bluetoothctl info ${this.bluetoothDevice} | grep -q "Connected: yes"; then
  echo "Successfully connected"
  exit 0
else
  echo "Failed to connect"
  exit 1
fi
      `;
      
      // Write script to temporary file
      const scriptPath = '/tmp/connect_bluetooth.sh';
      fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
      
      // Execute the script
      await execPromise(`bash ${scriptPath}`);
      
      // Verify connection
      const { stdout } = await execPromise(`bluetoothctl info ${this.bluetoothDevice}`);
      this.isBluetoothConnected = stdout.includes('Connected: yes');
      
      if (this.isBluetoothConnected) {
        logger.info('Successfully connected to Bluetooth speaker');
        return true;
      } else {
        logger.error('Failed to connect to Bluetooth speaker');
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
      // Check if pianobar is already running
      if (await this.checkPianobarStatus()) {
        logger.info('Pianobar is already running');
        return {
          success: true,
          message: 'Pianobar is already running',
          isPlaying: this.isPlaying
        };
      }
      
      // Connect to Bluetooth speaker if requested
      if (connectBluetoothFirst) {
        const connected = await this.connectBluetooth();
        if (!connected) {
          logger.warn('Could not connect to Bluetooth speaker, continuing without it');
        }
      }
      
      // Create the event command script
      await this.createEventCommandScript();
      
      // Start pianobar in the background
      logger.info('Starting pianobar');
      const pianobar = spawn('pianobar', [], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore']
      });
      
      // Don't wait for child process
      pianobar.unref();
      
      // Wait a bit to allow pianobar to start
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if pianobar is running now
      const isRunning = await this.checkPianobarStatus();
      
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
        logger.error('Failed to start pianobar');
        return {
          success: false,
          error: 'Failed to start pianobar'
        };
      }
    } catch (error) {
      logger.error(`Error starting pianobar: ${error.message}`);
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
      // Check if pianobar is running
      const isRunning = await this.checkPianobarStatus();
      
      // Try to load status from file
      let statusData;
      try {
        if (fs.existsSync(this.pianobarStatusFile)) {
          const data = fs.readFileSync(this.pianobarStatusFile, 'utf8');
          statusData = JSON.parse(data);
        }
      } catch (error) {
        logger.error(`Error reading status file: ${error.message}`);
      }
      
      // Default status data if not available
      if (!statusData) {
        statusData = { status: isRunning ? 'playing' : 'stopped' };
      }
      
      return {
        success: true,
        data: {
          ...statusData,
          isPianobarRunning: isRunning,
          isPlaying: isRunning && this.isPlaying
        }
      };
    } catch (error) {
      logger.error(`Error getting music status: ${error.message}`);
      return {
        success: false,
        error: `Failed to get music status: ${error.message}`
      };
    }
  }
  
  /**
   * Get the list of available stations
   * @returns {Promise<object>} - Stations list
   */
  async getStations() {
    try {
      // Try to load stations from file
      if (fs.existsSync(this.pianobarStationsFile)) {
        const data = fs.readFileSync(this.pianobarStationsFile, 'utf8');
        const stations = JSON.parse(data);
        
        return {
          success: true,
          data: stations
        };
      }
      
      // If pianobar is running, get stations by sending the list command
      if (await this.checkPianobarStatus()) {
        logger.info('Getting stations from running pianobar');
        
        // Send the 's' command to list stations
        await this.sendCommand('s');
        
        // Wait for the eventcmd to potentially write the stations file
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try again to read the stations file
        if (fs.existsSync(this.pianobarStationsFile)) {
          const data = fs.readFileSync(this.pianobarStationsFile, 'utf8');
          const stations = JSON.parse(data);
          
          return {
            success: true,
            data: stations
          };
        }
      }
      
      // If we still don't have stations, return empty list
      logger.warn('No station information available');
      return {
        success: true,
        data: { stations: [] }
      };
    } catch (error) {
      logger.error(`Error getting stations: ${error.message}`);
      return {
        success: false,
        error: `Failed to get stations: ${error.message}`
      };
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
    "expectedEndTime": $(($(date +%s) + ${6%:*}*60 + ${6#*:}))
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
    STATIONS=\$(echo "$3" | tr '\\n' '|' | sed 's/|$//')
    
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