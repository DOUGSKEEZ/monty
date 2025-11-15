/**
 * PianobarWebsocketService.js - SIMPLIFIED
 * 
 * Simple WebSocket server for pianobar track updates
 * - Just broadcasts song changes and status
 * - No complex state management or caching
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger').getModuleLogger('pianobar-ws');

class PianobarWebsocketService {
  constructor(server, config = {}) {
    // Simple config
    this.statusFile = config.statusFile || 
      path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
    
    this.eventDir = config.eventDir || 
      path.join(process.env.HOME || '/home/monty', '.config/pianobar/event_data');
    
    // Create WebSocket server
    this.wss = new WebSocket.Server({ 
      server,
      path: '/api/pianobar/ws'
    });
    
    // Simple state
    this.clients = new Set();
    this.currentStatus = { status: 'unknown' };
    this.currentTrack = {};
    
    this.setupWebSocketHandlers();
    this.setupWatchers();
    this.ensureEventDirectory();
    
    logger.info('Simple PianobarWebsocketService initialized');
  }
  
  // No more complex state management needed
  
  /**
   * Ensure the event directory exists
   */
  ensureEventDirectory() {
    try {
      if (!fs.existsSync(this.eventDir)) {
        fs.mkdirSync(this.eventDir, { recursive: true });
        logger.info(`Created event directory: ${this.eventDir}`);
      }
      
      // Create initial empty status file if it doesn't exist
      if (!fs.existsSync(this.statusFile)) {
        const initialStatus = {
          status: 'stopped',
          updateTime: Date.now()
        };
        fs.writeFileSync(this.statusFile, JSON.stringify(initialStatus, null, 2), 'utf8');
        logger.info(`Created initial status file: ${this.statusFile}`);
      }
    } catch (error) {
      logger.error(`Error ensuring event directory: ${error.message}`);
    }
  }
  
  /**
   * Setup WebSocket server event handlers
   */
  setupWebSocketHandlers() {
    // Handle new client connections
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      logger.info(`New WebSocket client connected: ${clientIp}`);
      
      // Add to client set
      this.clients.add(ws);
      
      // Send current status immediately to the new client
      // But first verify it's accurate by reading fresh status from file
      this.sendFreshStatusToClient(ws);
      
      // Simple ping/pong handling
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          logger.debug(`Error processing message: ${error.message}`);
        }
      });
      
      // Handle client disconnection
      ws.on('close', () => {
        logger.info(`WebSocket client disconnected: ${clientIp}`);
        this.clients.delete(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientIp}: ${error.message}`);
        this.clients.delete(ws);
      });
    });
    
    // Log server start
    logger.info(`WebSocket server started on path: /api/pianobar/ws`);
    
    // Setup periodic pings to keep connections alive
    setInterval(() => {
      this.broadcastPing();
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Setup file watchers for pianobar events and status
   */
  setupWatchers() {
    try {
      logger.info(`Setting up watchers for:`);
      logger.info(`  Status file: ${this.statusFile}`);
      logger.info(`  Event directory: ${this.eventDir}`);
      
      // Watch status file for changes
      const statusWatcher = chokidar.watch(this.statusFile, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        }
      });
      
      statusWatcher.on('change', async (filePath) => {
        try {
          let statusData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // Verify actual process state before broadcasting
          const actuallyRunning = await this.verifyPianobarProcess();
          
          // If cached status says running but process isn't running, correct it
          if (statusData.isPianobarRunning && !actuallyRunning) {
            logger.warn('Status file watcher detected stale data - correcting before broadcast');
            statusData = {
              status: 'stopped',
              isPianobarRunning: false,
              isPlaying: false,
              updateTime: Date.now(),
              corrected: true
            };
            
            // Update the file with corrected status
            fs.writeFileSync(filePath, JSON.stringify(statusData, null, 2));
          }
          
          this.currentStatus = statusData;
          
          // Broadcast verified status
          this.broadcast({
            type: 'status',
            data: statusData
          });
        } catch (error) {
          logger.error(`Error processing status file: ${error.message}`);
        }
      });
      
      // Watch event directory for new event files
      const absoluteEventDir = path.resolve(this.eventDir);
      logger.info(`Setting up file watcher for: ${absoluteEventDir}`);
      
      const eventWatcher = chokidar.watch(absoluteEventDir, {
        persistent: true,
        ignoreInitial: true,
        usePolling: false,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        },
        depth: 0
      });
      
      eventWatcher
        .on('add', (filePath) => {
          if (!filePath.endsWith('.json')) return;
          
          try {
            // Read and clean the JSON content to handle problematic characters
            let fileContent = fs.readFileSync(filePath, 'utf8');
            // Replace problematic Unicode quotes with standard quotes for JSON parsing
            fileContent = fileContent.replace(/[""]/g, '"').replace(/['']/g, "'");
            
            const eventData = JSON.parse(fileContent);
            
            // Simple event processing
            if (eventData.eventType === 'songstart') {
              this.currentTrack = {
                title: eventData.title || '',
                artist: eventData.artist || '',
                album: eventData.album || '',
                stationName: eventData.stationName || '',
                songDuration: parseInt(eventData.songDuration) || 0,
                songPlayed: parseInt(eventData.songPlayed) || 0,
                rating: parseInt(eventData.rating) || 0,
                coverArt: eventData.coverArt || '',
                detailUrl: eventData.detailUrl || ''
              };
              
              this.broadcast({
                type: 'song',
                data: this.currentTrack
              });
              
              // Also update backend shared state for cross-device sync
              this.updateBackendSharedState(this.currentTrack);
            }
            else if (eventData.eventType === 'songlove') {
              this.broadcast({ type: 'love', data: {} });
            }
            else if (eventData.eventType === 'usergetstations') {
              const stations = eventData.stations || [];
              
              // Broadcast to WebSocket clients
              this.broadcast({
                type: 'stations',
                data: { stations: stations }
              });
              
              // Update the stations file for the /stations API endpoint
              this.updateStationsFile(stations);
            }
            
            // Clean up
            fs.unlinkSync(filePath);
          } catch (error) {
            logger.error(`Error processing event file: ${error.message}`);
          }
        })
        .on('ready', () => {
          logger.info(`Event file watcher ready, watching: ${absoluteEventDir}`);
        });
      
      logger.info('File watchers set up for status and events');
    } catch (error) {
      logger.error(`Error setting up file watchers: ${error.message}`);
    }
  }
  
  // No more complex event processing needed - handled in file watcher
  
  /**
   * Send data to a specific client
   * @param {WebSocket} client - The client to send to
   * @param {Object} data - The data to send
   */
  sendToClient(client, data) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        logger.error(`Error sending to client: ${error.message}`);
        // Remove bad clients
        this.clients.delete(client);
      }
    }
  }

  /**
   * Send fresh status to a specific client (verifies actual process state)
   * @param {WebSocket} client - The client to send data to
   */
  async sendFreshStatusToClient(client) {
    try {
      // Read fresh status from file
      let statusData = { status: 'stopped', isPianobarRunning: false, isPlaying: false };
      
      if (fs.existsSync(this.statusFile)) {
        try {
          statusData = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        } catch (error) {
          logger.warn(`Error reading status file: ${error.message}`);
        }
      }

      // Verify actual process state to prevent stale data
      const actuallyRunning = await this.verifyPianobarProcess();
      
      // If cached status says running but process isn't running, correct it
      if (statusData.isPianobarRunning && !actuallyRunning) {
        logger.warn('WebSocket detected stale cache - correcting status');
        statusData = {
          status: 'stopped',
          isPianobarRunning: false,
          isPlaying: false,
          updateTime: Date.now(),
          corrected: true
        };
        
        // Update the file with corrected status
        fs.writeFileSync(this.statusFile, JSON.stringify(statusData, null, 2));
      }

      // Update our cached status
      this.currentStatus = statusData;
      
      // Send to client
      this.sendToClient(client, {
        type: 'status',
        data: statusData
      });
    } catch (error) {
      logger.error(`Error sending fresh status: ${error.message}`);
      // Send default safe status on error
      this.sendToClient(client, {
        type: 'status',
        data: { status: 'stopped', isPianobarRunning: false, isPlaying: false }
      });
    }
  }

  /**
   * Verify if pianobar process is actually running
   * @returns {Promise<boolean>} True if pianobar is running
   */
  async verifyPianobarProcess() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('pgrep pianobar || echo ""', { timeout: 3000 });
      const pids = stdout.trim().split('\n').filter(Boolean);
      return pids.length > 0 && pids.length < 3; // Avoid orphaned processes
    } catch (error) {
      logger.debug(`Error checking pianobar process: ${error.message}`);
      return false; // Assume not running on error
    }
  }
  
  /**
   * Broadcast data to all connected clients
   * @param {Object} data - The data to broadcast
   */
  broadcast(data) {
    let badClients = 0;

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(data));
        } catch (error) {
          logger.error(`Error broadcasting to client: ${error.message}`);
          badClients++;
          // Mark for removal
          client._shouldBeRemoved = true;
        }
      } else {
        badClients++;
        client._shouldBeRemoved = true;
      }
    });

    // Clean up bad clients
    if (badClients > 0) {
      this.clients.forEach(client => {
        if (client._shouldBeRemoved) {
          this.clients.delete(client);
          delete client._shouldBeRemoved;
        }
      });
      logger.debug(`Removed ${badClients} disconnected clients`);
    }

    logger.debug(`Broadcast sent to ${this.clients.size} clients`);
  }

  /**
   * Broadcast current state update to all connected clients
   * Reads the current status from file and sends it to all clients
   */
  broadcastStateUpdate() {
    try {
      // Read current status from file or use cached status
      let statusData = this.currentStatus || { status: 'stopped', isPianobarRunning: false, isPlaying: false };

      if (fs.existsSync(this.statusFile)) {
        try {
          statusData = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
          this.currentStatus = statusData;
        } catch (error) {
          logger.warn(`Error reading status file for broadcast: ${error.message}`);
        }
      }

      // Broadcast to all clients
      this.broadcast({
        type: 'status',
        data: statusData
      });

      logger.debug('State update broadcasted to all clients');
    } catch (error) {
      logger.error(`Error broadcasting state update: ${error.message}`);
    }
  }

  // No more complex state broadcasting needed

  /**
   * Send ping to all clients to keep connections alive
   */
  broadcastPing() {
    this.broadcast({
      type: 'ping',
      time: Date.now()
    });
  }
  
  /**
   * Get the number of connected clients
   * @returns {number} The number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
  
  /**
   * Update backend shared state for cross-device sync
   * @param {Object} trackData - The track information to sync
   */
  async updateBackendSharedState(trackData) {
    try {
      const axios = require('axios');
      const baseURL = 'http://localhost:3001';
      
      await axios.post(`${baseURL}/api/pianobar/sync-state`, {
        track: trackData
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      
      logger.debug('Successfully updated backend shared state with new track info');
    } catch (error) {
      logger.warn(`Failed to update backend shared state: ${error.message}`);
    }
  }
  
  /**
   * Update stations file when new station list is received
   * @param {Array} stations - The stations array from pianobar
   */
  async updateStationsFile(stations) {
    try {
      const stationsFilePath = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_stations.json');
      
      const stationsData = {
        stations: stations,
        fetchTime: Date.now(),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(stationsFilePath, JSON.stringify(stationsData, null, 2), 'utf8');
      logger.info(`Updated stations file with ${stations.length} stations`);
    } catch (error) {
      logger.warn(`Failed to update stations file: ${error.message}`);
    }
  }
  
  /**
   * Create the event command script for pianobar
   * This script will be called by pianobar for events
   * @param {string} eventScriptPath - Path to write the event script
   * @returns {Promise<boolean>} True if successful
   */
  async createEventCommandScript(eventScriptPath) {
    try {
      const eventScript = `#!/bin/bash
# Pianobar event script for WebSocket integration
# This script is called by pianobar for various events

# Path for event files
EVENT_DIR="${this.eventDir}"

# Make sure the event directory exists
mkdir -p "$EVENT_DIR"

# Function to parse key=value pairs from stdin
parse_pianobar_data() {
  local line
  declare -A data
  
  while IFS= read -r line; do
    if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
      local key="\${BASH_REMATCH[1]}"
      local value="\${BASH_REMATCH[2]}"
      data["$key"]="$value"
    fi
  done
  
  # Export parsed values
  TITLE="\${data[title]:-}"
  ARTIST="\${data[artist]:-}"  
  ALBUM="\${data[album]:-}"
  STATION_NAME="\${data[stationName]:-}"
  SONG_DURATION="\${data[songDuration]:-}"
  SONG_PLAYED="\${data[songPlayed]:-}"
  RATING="\${data[rating]:-}"
  DETAIL_URL="\${data[detailUrl]:-}"
  COVER_ART="\${data[coverArt]:-}"
  
  # Parse station list for usergetstations events
  STATIONS_JSON="[]"
  if [[ "\${data[stationCount]:-}" =~ ^[0-9]+$ ]]; then
    local station_count="\${data[stationCount]}"
    local stations=""
    for ((i=0; i<station_count; i++)); do
      local station="\${data[station$i]:-}"
      if [[ -n "$station" ]]; then
        stations="$stations,\\"$station\\""
      fi
    done
    if [[ -n "$stations" ]]; then
      STATIONS_JSON="[\${stations:1}]"  # Remove leading comma
    fi
  fi
}

# Function to write event to JSON file
write_event() {
  EVENT_TYPE="$1"
  TIMESTAMP=$(date +%s%3N)
  EVENT_FILE="$EVENT_DIR/$EVENT_TYPE-$TIMESTAMP.json"
  
  # Parse pianobar data from stdin
  parse_pianobar_data
  
  # Create properly formatted JSON
  cat > "$EVENT_FILE" << EOF
{
  "eventType": "$EVENT_TYPE",
  "title": "$TITLE",
  "artist": "$ARTIST",
  "album": "$ALBUM",
  "stationName": "$STATION_NAME",
  "songDuration": "$SONG_DURATION",
  "songPlayed": "$SONG_PLAYED",
  "rating": "$RATING",
  "detailUrl": "$DETAIL_URL",
  "coverArt": "$COVER_ART",
  "stations": $STATIONS_JSON,
  "timestamp": $TIMESTAMP
}
EOF

  chmod 666 "$EVENT_FILE"
}

# Event handler based on pianobar event
case "$1" in
  songstart)
    write_event "songstart"
    ;;
  songfinish)
    write_event "songfinish"
    ;;
  songlove)
    write_event "songlove"
    ;;
  songban)
    write_event "songban"
    ;;
  songshelf)
    write_event "songshelf"
    ;;
  stationfetchplaylist)
    write_event "stationfetchplaylist"
    ;;
  usergetstations)
    write_event "usergetstations"
    ;;
  stationaddmusic)
    write_event "stationaddmusic"
    ;;
  stationcreate)
    write_event "stationcreate"
    ;;
  stationdelete)
    write_event "stationdelete"
    ;;
  stationrename)
    write_event "stationrename"
    ;;
  stationchange)
    write_event "stationchange"
    ;;
  playbackstart)
    write_event "playbackstart"
    ;;
  playbackpause)
    write_event "playbackpause"
    ;;
  playbackstop)
    write_event "playbackstop"
    ;;
  *)
    write_event "unknown"
    ;;
esac

exit 0
`;

      // Write the event script
      fs.writeFileSync(eventScriptPath, eventScript, { mode: 0o755 });
      logger.info(`Created event command script at ${eventScriptPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Error creating event command script: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Setup pianobar configuration to use our event script
   * @param {string} configPath - Path to pianobar config file
   * @param {string} eventScriptPath - Path to the event script
   * @returns {Promise<boolean>} True if successful
   */
  async setupPianobarConfig(configPath, eventScriptPath) {
    try {
      // Create config directory if it doesn't exist
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Read existing config if it exists
      let configContent = '';
      if (fs.existsSync(configPath)) {
        configContent = fs.readFileSync(configPath, 'utf8');
      }
      
      // Update event_command setting
      if (!configContent.includes('event_command')) {
        configContent += `\nevent_command = ${eventScriptPath}\n`;
      } else {
        configContent = configContent.replace(/event_command\s*=\s*.*/g, `event_command = ${eventScriptPath}`);
      }
      
      // Write updated config
      fs.writeFileSync(configPath, configContent);
      logger.info(`Updated pianobar config at ${configPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Error setting up pianobar config: ${error.message}`);
      throw error;
    }
  }
}

module.exports = PianobarWebsocketService;