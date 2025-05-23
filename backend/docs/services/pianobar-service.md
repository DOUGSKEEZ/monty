# Pianobar Service Documentation

## Overview

The Pianobar Service provides a clean, reliable interface for controlling Pianobar (a console-based Pandora client) through the Monty backend. It follows a modular architecture with two main components:

1. **PianobarCommandInterface** - Handles sending commands to pianobar via FIFO
2. **PianobarWebsocketService** - Provides real-time updates via WebSockets

## Architecture

The service follows these key design principles:

- **Separation of concerns**: Command interface is separate from status reporting
- **Simple, reliable implementation**: Uses direct Node.js file operations instead of shell commands
- **Appropriate timeouts**: Different timeouts for different command types (fast/medium/slow)
- **Real-time updates**: WebSocket support for live status changes and now-playing information
- **Fault tolerance**: Includes retry logic, circuit breakers, and recovery procedures

### Components

#### PianobarCommandInterface

- Provides a simplified interface for sending commands to pianobar via FIFO
- Uses `fs.writeFileSync()` for reliable, direct file operations
- Implements appropriate timeouts based on command type:
  - Fast commands (play/pause/love): 1000ms
  - Medium commands (next): 2500ms
  - Slow commands (station selection): 5000ms
- Handles FIFO creation and permission management
- Provides explicit command methods: play(), pause(), next(), love(), etc.

#### PianobarWebsocketService

- Provides real-time updates to clients via WebSockets
- Watches status file and event files for changes
- Broadcasts updates to all connected clients
- Handles event processing for different pianobar events
- Creates and maintains the pianobar event command script

## API Endpoints

### Status and Information

- `GET /api/pianobar/status` - Get current pianobar status
- `GET /api/pianobar/stations` - Get available stations
- `GET /api/pianobar/health` - Check service health

### Commands

- `POST /api/pianobar/initialize` - Initialize the pianobar service
- `POST /api/pianobar/start` - Start pianobar
- `POST /api/pianobar/stop` - Stop pianobar
- `POST /api/pianobar/play` - Play/resume playback
- `POST /api/pianobar/pause` - Pause playback
- `POST /api/pianobar/next` - Skip to next song
- `POST /api/pianobar/love` - Love current song
- `POST /api/pianobar/select-station` - Select a station (requires stationId in request body)
- `POST /api/pianobar/command` - Send a raw command (requires command in request body)

### WebSocket

- `ws://server:port/api/pianobar/ws` - WebSocket endpoint for real-time updates

## WebSocket Events

The WebSocket service sends these event types:

1. **status** - Current pianobar status updates
   ```json
   {
     "type": "status",
     "data": {
       "status": "playing",
       "isPianobarRunning": true,
       "isPlaying": true,
       "song": "Song Title",
       "artist": "Artist Name",
       "album": "Album Name",
       "stationName": "Station Name",
       "updateTime": 1621234567890
     }
   }
   ```

2. **event** - Pianobar events (songstart, stationchange, etc.)
   ```json
   {
     "type": "event",
     "data": {
       "eventType": "songstart",
       "title": "Song Title",
       "artist": "Artist Name",
       "album": "Album Name",
       "stationName": "Station Name",
       "stationId": "123456",
       "songDuration": "180",
       "songPlayed": "0",
       "rating": "0",
       "detailUrl": "https://www.pandora.com/...",
       "timestamp": 1621234567890
     }
   }
   ```

3. **ping** - Periodic ping to keep connections alive
   ```json
   {
     "type": "ping",
     "time": 1621234567890
   }
   ```

## Testing

A test HTML file is provided at `/frontend/public/pianobar-websocket-test.html`. This allows you to:

- Connect to the WebSocket
- Test all pianobar commands
- View real-time status and events
- Select stations

## File Structure

- `backend/src/services/PianobarCommandInterface.js` - Command interface implementation
- `backend/src/services/PianobarService.js` - Main service implementation
- `backend/src/services/PianobarWebsocketService.js` - WebSocket service
- `backend/src/services/PianobarWebsocketIntegration.js` - Integration module
- `backend/src/routes/pianobar.js` - API routes
- `backend/src/interfaces/IPianobarService.js` - Interface definition

## Implementation Notes

### Command Interface

The command interface uses direct file operations instead of shell commands:

```javascript
// Simple synchronous write - the most reliable approach
fs.writeFileSync(this.pianobarCtl, `${command}\n`, { encoding: 'utf8' });
```

### Event Script

The WebSocket service creates an event script that:
1. Captures pianobar events
2. Writes event data to JSON files
3. The WebSocket service watches for these files and broadcasts updates

### Error Handling

The implementation includes robust error handling:
- Retry logic for failed operations
- Circuit breakers for external dependencies
- Recovery procedures for service failures
- Appropriate timeouts based on command type

## Configuration

No special configuration is needed. The service automatically:
- Creates the FIFO if it doesn't exist
- Sets appropriate permissions
- Creates the event script
- Updates the pianobar config file

## Future Improvements

Potential future improvements include:

1. Adding volume control support
2. Adding support for bookmarking songs/artists
3. Enhancing the UI with album art and lyrics
4. Adding support for creating/editing stations
5. Implementing a playlist queue view