/**
 * PianobarWebsocketService.js
 * 
 * WebSocket server for pianobar real-time events and status updates
 * - Provides real-time song, artist, album info
 * - Broadcasts playback status changes
 * - Handles event scripts from pianobar
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger').getModuleLogger('pianobar-ws');

class PianobarWebsocketService {
  constructor(server, config = {}) {
    // Configuration with defaults
    this.statusFile = config.statusFile || 
      path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
    
    this.eventDir = config.eventDir || 
      path.join(process.env.HOME || '/home/monty', '.config/pianobar/event_data');
    
    // Create WebSocket server using the provided HTTP server
    this.wss = new WebSocket.Server({ 
      server,
      path: '/api/pianobar/ws'
    });
    
    // Initialize state
    this.clients = new Set();
    this.currentStatus = {
      status: 'unknown',
      updateTime: Date.now()
    };
    
    // Reference to PianobarService for central state management
    this.pianobarService = null;
    
    // Setup WebSocket handlers
    this.setupWebSocketHandlers();
    
    // Setup file watchers for pianobar events
    this.setupWatchers();
    
    // Ensure event directory exists
    this.ensureEventDirectory();
    
    logger.info('PianobarWebsocketService initialized');
  }
  
  /**
   * Set the PianobarService instance for central state management
   * @param {Object} pianobarService - The PianobarService instance
   */
  setPianobarService(pianobarService) {
    this.pianobarService = pianobarService;
    logger.info('PianobarService reference set for central state management');
  }
  
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
      this.sendToClient(ws, {
        type: 'status',
        data: this.currentStatus
      });
      
      // Handle client messages (if needed)
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          logger.debug(`Received message from client: ${JSON.stringify(data)}`);
          
          // Handle client requests if needed
          if (data.type === 'getStatus') {
            this.sendToClient(ws, {
              type: 'status',
              data: this.currentStatus
            });
          } else if (data.type === 'GET_STATE') {
            // Handle request for central state
            if (this.pianobarService) {
              try {
                const state = this.pianobarService.getState();
                this.sendToClient(ws, {
                  type: 'STATE_UPDATE',
                  data: state
                });
                logger.debug(`Sent central state to client: version ${state.version}`);
              } catch (error) {
                logger.error(`Error getting central state for client: ${error.message}`);
                this.sendToClient(ws, {
                  type: 'ERROR',
                  message: 'Failed to get central state'
                });
              }
            } else {
              this.sendToClient(ws, {
                type: 'ERROR',
                message: 'PianobarService not available'
              });
            }
          }
        } catch (error) {
          logger.warn(`Error processing client message: ${error.message}`);
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
      
      statusWatcher.on('change', (filePath) => {
        try {
          const statusData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          logger.debug(`Status file updated: ${statusData.status}`);
          
          // Update current status
          this.currentStatus = statusData;
          
          // Broadcast to all clients
          this.broadcast({
            type: 'status',
            data: statusData
          });
        } catch (error) {
          logger.error(`Error processing status file update: ${error.message}`);
        }
      });
      
      // Watch event directory for new event files
      // Use absolute path for better compatibility
      const absoluteEventDir = path.resolve(this.eventDir);
      logger.info(`🔍 Setting up file watcher for: ${absoluteEventDir}`);
      logger.info(`📁 Event directory exists: ${fs.existsSync(absoluteEventDir)}`);
      
      // Check directory permissions
      try {
        const stats = fs.statSync(absoluteEventDir);
        logger.info(`📋 Directory permissions: ${stats.mode.toString(8)}`);
        logger.info(`📂 Directory is readable: ${fs.constants.R_OK & stats.mode ? 'YES' : 'NO'}`);
      } catch (err) {
        logger.error(`❌ Cannot access event directory: ${err.message}`);
      }
      
      const eventWatcher = chokidar.watch(absoluteEventDir, {
        persistent: true,
        ignoreInitial: true,
        usePolling: false,  // Use native filesystem events (inotify) instead of polling
        awaitWriteFinish: {
          stabilityThreshold: 300,  // Wait for file to stabilize before processing
          pollInterval: 100  // Only used if usePolling is true
        },
        depth: 0  // Only watch files in the directory, not subdirectories
      });
      
      // Add comprehensive event listeners for debugging
      eventWatcher
        .on('add', (filePath) => {
          logger.info(`🔔 Event file ADDED: ${path.basename(filePath)}`);
          // Only process .json files
          if (!filePath.endsWith('.json')) {
            logger.debug(`⏭️ Skipping non-JSON file: ${path.basename(filePath)}`);
            return;
          }
          
          try {
            const eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            logger.info(`📤 Broadcasting event: ${eventData.eventType} - ${eventData.title || 'no title'}`);
            
            // Process the event based on type
            this.processEvent(eventData);
            
            // Broadcast to all clients
            this.broadcast({
              type: 'event',
              data: eventData
            });
            
            // Remove the event file after processing
            fs.unlinkSync(filePath);
            logger.debug(`🗑️ Cleaned up event file: ${path.basename(filePath)}`);
          } catch (error) {
            logger.error(`❌ Error processing event file: ${error.message}`);
          }
        })
        .on('change', (filePath) => {
          logger.debug(`📝 Event file CHANGED: ${path.basename(filePath)}`);
        })
        .on('unlink', (filePath) => {
          logger.debug(`🗑️ Event file REMOVED: ${path.basename(filePath)}`);
        })
        .on('error', (error) => {
          logger.error(`❌ Chokidar watcher error: ${error.message}`);
        })
        .on('ready', () => {
          logger.info(`✅ Event file watcher ready, watching: ${absoluteEventDir}`);
          logger.info(`🔍 Watcher is polling: ${eventWatcher.options.usePolling}`);
        });
      
      logger.info('File watchers set up for status and events');
    } catch (error) {
      logger.error(`Error setting up file watchers: ${error.message}`);
    }
  }
  
  /**
   * Process pianobar events based on event type
   * @param {Object} eventData - The event data from pianobar
   */
  processEvent(eventData) {
    if (!eventData || !eventData.eventType) {
      logger.warn('Received invalid event data');
      return;
    }
    
    switch (eventData.eventType) {
      case 'songstart':
        console.log(`[DEBUG-WS] songstart event received: ${eventData.title} by ${eventData.artist}`);
        console.log(`[DEBUG-WS] pianobarService exists: ${!!this.pianobarService}`);
        console.log(`[DEBUG-WS] pianobarService type: ${typeof this.pianobarService}`);
        
        logger.info(`Now playing: ${eventData.artist} - ${eventData.title}`);
        
        // Update central state if PianobarService is available
        if (this.pianobarService) {
          console.log(`[DEBUG-WS] About to update central state...`);
          this.pianobarService.updateCentralState({
            player: {
              isRunning: true,
              isPlaying: true,
              status: 'playing'
            },
            currentSong: {
              title: eventData.title || null,
              artist: eventData.artist || null,
              album: eventData.album || null,
              stationName: eventData.stationName || null,
              songDuration: eventData.songDuration || null,
              songPlayed: eventData.songPlayed || null,
              rating: eventData.rating || null,
              coverArt: eventData.coverArt || null,
              detailUrl: eventData.detailUrl || null
            }
          }, 'websocket-songstart').then((version) => {
            console.log(`[DEBUG-WS] Central state updated successfully to version: ${version}`);
            this.broadcastStateUpdate();
            console.log(`[DEBUG-WS] State update broadcasted`);
          }).catch(err => {
            console.error(`[DEBUG-WS] Central state update FAILED: ${err.message}`);
            console.error(`[DEBUG-WS] Error stack: ${err.stack}`);
          });
        } else {
          console.error(`[DEBUG-WS] CRITICAL: No pianobarService reference - cannot update central state!`);
          console.error(`[DEBUG-WS] this.pianobarService = ${this.pianobarService}`);
        }
        
        // Keep legacy currentStatus update for backward compatibility
        this.currentStatus = {
          ...this.currentStatus,
          status: 'playing',
          song: eventData.title,
          artist: eventData.artist,
          album: eventData.album,
          stationName: eventData.stationName,
          updateTime: Date.now()
        };
        break;
        
      case 'songfinish':
        logger.info('Song finished');
        break;
        
      case 'songlove':
        logger.info(`Song loved: ${eventData.artist} - ${eventData.title}`);
        break;
        
      case 'songban':
        logger.info(`Song banned: ${eventData.artist} - ${eventData.title}`);
        break;
        
      case 'stationchange':
        logger.info(`Station changed to: ${eventData.stationName}`);
        this.currentStatus = {
          ...this.currentStatus,
          stationName: eventData.stationName,
          updateTime: Date.now()
        };
        break;
        
      case 'playbackstart':
        logger.info('Playback started');
        this.currentStatus = {
          ...this.currentStatus,
          status: 'playing',
          updateTime: Date.now()
        };
        break;
        
      case 'playbackpause':
        logger.info('Playback paused');
        this.currentStatus = {
          ...this.currentStatus,
          status: 'paused',
          updateTime: Date.now()
        };
        break;
        
      case 'playbackstop':
        logger.info('Playback stopped');
        this.currentStatus = {
          ...this.currentStatus,
          status: 'stopped',
          updateTime: Date.now()
        };
        break;
        
      case 'usergetstations':
        logger.info(`Station list updated: ${eventData.stations?.length || 0} stations received`);
        logger.info(`🔍 Station data received: ${JSON.stringify(eventData.stations?.slice(0, 3) || [])}...`);
        // Update the stations cache file with fresh data
        try {
          const stationsData = {
            stations: eventData.stations || [],
            fetchTime: Date.now()
          };
          const stationsFile = path.join(__dirname, '../../../data/cache/pianobar_stations.json');
          logger.info(`📁 Writing to stations file: ${stationsFile}`);
          logger.info(`📄 File exists before write: ${fs.existsSync(stationsFile)}`);
          fs.writeFileSync(stationsFile, JSON.stringify(stationsData, null, 2));
          logger.info(`✅ Updated stations cache with ${stationsData.stations.length} stations at ${stationsFile}`);
          logger.info(`📄 File exists after write: ${fs.existsSync(stationsFile)}`);
        } catch (error) {
          logger.error(`❌ Failed to update stations cache: ${error.message}`);
          logger.error(`❌ Error stack: ${error.stack}`);
        }
        break;
        
      default:
        logger.debug(`Unhandled event type: ${eventData.eventType}`);
    }
  }
  
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
   * Broadcast central state update to all connected clients
   */
  broadcastStateUpdate() {
    logger.info('[DEBUG-BROADCAST] broadcastStateUpdate() CALLED!');
    if (!this.pianobarService) {
      logger.warn('Cannot broadcast state update: PianobarService not set');
      return;
    }
    
    try {
      logger.info(`[DEBUG-BROADCAST] PianobarService exists: ${!!this.pianobarService}`);
      logger.info(`[DEBUG-BROADCAST] getState method exists: ${typeof this.pianobarService.getState}`);
      
      const state = this.pianobarService.getState();
      
      logger.info(`[DEBUG-BROADCAST] State retrieved: ${JSON.stringify(state)}`);
      logger.info(`[DEBUG-BROADCAST] Broadcasting state version: ${state?.version}`);
      logger.info(`[DEBUG-BROADCAST] Number of clients: ${this.clients.size}`);
      
      this.broadcast({
        type: 'STATE_UPDATE',
        data: state
      });
      
      logger.debug(`State update broadcasted: version ${state?.version}`);
    } catch (error) {
      logger.error(`Error broadcasting state update: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
    }
  }
  
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