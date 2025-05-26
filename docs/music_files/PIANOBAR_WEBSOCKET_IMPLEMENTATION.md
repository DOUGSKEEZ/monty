# Pianobar WebSocket Implementation

This document provides a comprehensive overview of the WebSocket implementation for real-time Pianobar updates in the Monty home automation system.

## Features Implemented

1. **Command Interface**: 
   - `PianobarCommandInterface.js` - A simplified interface for sending commands to pianobar via FIFO
   - Reliable command sending with appropriate timeouts
   - Explicit methods for play, pause, next, love, etc.

2. **WebSocket Service**:
   - `PianobarWebsocketService.js` - Real-time updates via WebSockets
   - Event handling for song changes, playback status, etc.
   - Automatic event script creation and integration

3. **API Routes**:
   - Full set of REST endpoints for controlling pianobar
   - Status and station information endpoints
   - Health check endpoint

4. **Test UI**:
   - `/frontend/public/pianobar-websocket-test.html` - WebSocket test interface
   - `/frontend/public/pianobar-websocket-simple-test.html` - Simple WebSocket test
   - Allows testing all commands and seeing real-time updates

## Architecture Overview

The WebSocket implementation follows a pub/sub (publisher/subscriber) pattern where:

1. Pianobar events are captured using a custom event script
2. Events are processed and published to connected WebSocket clients
3. Clients can also send commands back to control Pianobar

The implementation consists of several key components:

- **PianobarWebsocketService**: Core service that manages WebSocket connections and event broadcasting
- **PianobarWebsocketIntegration**: Integration layer that connects the service with the Express server
- **Event Command Script**: Custom script that captures Pianobar events and writes them to the filesystem
- **Client Libraries**: JavaScript code for connecting to and interacting with the WebSocket API

## Design Principles

The implementation follows these key design principles:

1. **Separation of Concerns**:
   - Command interface is separate from status reporting
   - WebSocket is separate from the command interface

2. **Reliability**:
   - Uses direct file operations with fs.writeFileSync
   - Appropriate timeouts for different command types
   - Retry logic for failed operations

3. **Modularity**:
   - Components are designed to work independently
   - Integration points are clearly defined

4. **Real-time Updates**:
   - WebSocket provides real-time song/status updates
   - File watchers monitor status and event files
   - Events are broadcast to all connected clients

## Server-Side Components

### PianobarWebsocketService

The WebSocket service is responsible for:

- Creating and managing WebSocket connections
- Setting up the event command script for Pianobar
- Watching for event files and broadcasting them to clients
- Maintaining a status file with the current player state
- Processing commands from clients and sending them to Pianobar

### PianobarWebsocketIntegration

The integration layer:

- Initializes the WebSocket service when the server starts
- Registers the service with the ServiceRegistry for monitoring
- Sets up error handling and retry logic for robustness
- Creates necessary directories and files for event processing

### Event Flow

1. Pianobar triggers events (song changes, playback status, etc.)
2. The custom event script captures these events and writes them to JSON files
3. The WebSocket service detects these files and reads their contents
4. The service processes the events and broadcasts them to all connected clients
5. The service also updates the status file to maintain current state

## Client-Side Implementation

### WebSocket Connection

Clients connect to the WebSocket endpoint at:

```
ws://<server-address>:3001/api/pianobar/ws
```

### Message Types

The server sends three types of messages:

1. **Status Messages**: Current player status including playback state and song information
   ```json
   {
     "type": "status",
     "data": {
       "status": "playing",
       "song": "Song Title",
       "artist": "Artist Name",
       "album": "Album Name",
       "stationName": "Station Name",
       "songDuration": 180,
       "rating": null,
       "updateTime": 1621234567890
     }
   }
   ```

2. **Event Messages**: Real-time events from Pianobar
   ```json
   {
     "type": "event",
     "data": {
       "eventType": "songstart",
       "title": "New Song Title",
       "artist": "Artist Name",
       "album": "Album Name",
       "stationName": "Station Name",
       "songDuration": 240,
       "rating": null
     }
   }
   ```

3. **Ping Messages**: Keep-alive messages to maintain connection
   ```json
   {
     "type": "ping",
     "timestamp": 1621234567890
   }
   ```

### Client Commands

Clients can send commands to control Pianobar:

```json
{
  "type": "command",
  "command": "p"  // Play/Pause command
}
```

Common commands:
- `p`: Play/Pause
- `n`: Next song
- `+`: Love song
- `-`: Ban song
- `t`: Tired (temporarily don't play this song)
- `s`: List stations
- `s#`: Switch to station number #

## Supported Events

The implementation supports the following Pianobar events:

| Event Type | Description | Data Fields |
|------------|-------------|------------|
| songstart | Song starts playing | title, artist, album, stationName, songDuration, rating |
| songfinish | Song finishes playing | title, artist, album |
| songlove | Song is marked as loved | title, artist, album |
| songban | Song is banned | title, artist, album |
| songshelf | Song is shelved (tired) | title, artist, album |
| usergetstations | Station list is retrieved | stations (array of objects) |
| stationchange | Station is changed | stationName, stationId |
| playbackstart | Playback starts | - |
| playbackpause | Playback pauses | - |
| playbackstop | Playback stops | - |

## Test Pages

Two test pages are provided to demonstrate and test the WebSocket functionality:

1. **Simple Test Page**: Basic connection test and event logging
   - `/frontend/public/pianobar-websocket-simple-test.html`

2. **Control Panel**: Full-featured UI with controls and status display
   - `/frontend/public/pianobar-websocket-test.html`

## Testing Instructions

1. Start the backend server:
   ```
   cd /home/monty/monty/backend
   npm run dev
   ```

2. Open the WebSocket test page in a browser:
   ```
   http://localhost:3001/pianobar-websocket-test.html
   ```
   or
   ```
   http://localhost:3001/pianobar-websocket-simple-test.html
   ```

3. Test functionality:
   - Click "Connect" to establish WebSocket connection
   - Use the play/pause, next, love buttons to control playback
   - Load stations and select them from the list
   - Observe real-time updates in the event log

## React Integration Example

Here's a simple React hook for integrating with the WebSocket service:

```jsx
import { useEffect, useState } from 'react';

function usePianobarWebSocket() {
  const [status, setStatus] = useState({ status: 'unknown' });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:3001/api/pianobar/ws`);

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status') {
        setStatus(data.data);
      } else if (data.type === 'event') {
        // Handle specific events
        if (data.data.eventType === 'songstart') {
          // Update current song
          setStatus(prev => ({
            ...prev,
            song: data.data.title,
            artist: data.data.artist,
            album: data.data.album,
            stationName: data.data.stationName,
            songDuration: data.data.songDuration,
            rating: data.data.rating
          }));
        } else if (data.data.eventType === 'songlove') {
          // Update rating and trigger animation
          setStatus(prev => ({ ...prev, rating: '+1' }));
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Function to send commands to pianobar
  const sendCommand = (command) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'command',
        command
      }));
    }
  };

  return { status, connected, sendCommand };
}

export default usePianobarWebSocket;
```

## Error Handling and Resilience

The implementation includes several resilience features:

1. **RetryHelper**: Retry operations with exponential backoff
2. **CircuitBreaker**: Prevent cascading failures with circuit breaking
3. **Status File**: Maintain state between server restarts
4. **Lazy Loading**: Components are loaded only when needed
5. **Service Registry**: Register service for monitoring and health checks
6. **Reconnection Logic**: Clients can automatically reconnect if the connection is lost

## Implementation Notes

- The event command script is automatically created and configured
- Event data is stored in `~/.config/pianobar/event_data/`
- Current status is maintained in `~/monty/data/cache/pianobar_status.json`
- The WebSocket service is initialized with a delay to ensure the server is fully started
- All WebSocket connections are managed through the `/api/pianobar/ws` endpoint

## Files Created/Modified

1. New Files:
   - `/home/monty/monty/frontend/public/pianobar-websocket-test.html` - WebSocket test interface
   - `/home/monty/monty/frontend/public/pianobar-websocket-simple-test.html` - Simple WebSocket test
   - `/home/monty/monty/backend/docs/services/pianobar-service.md` - Service documentation
   - `/home/monty/monty/PIANOBAR_WEBSOCKET_IMPLEMENTATION.md` - This documentation

2. Modified Files:
   - `/home/monty/monty/backend/src/server.js` - Enabled WebSocket initialization
   - `/home/monty/monty/backend/src/services/PianobarWebsocketIntegration.js` - Fixed RetryHelper usage

## Next Steps

1. **Frontend Integration**:
   - Implement a full React component for the PianobarPage
   - Add WebSocket connection to the React frontend
   - Create a nice UI for controlling pianobar with real-time updates

2. **Feature Enhancements**:
   - Add volume control support
   - Add support for creating/editing stations
   - Enhance with album art and lyrics if available

3. **Mobile Optimization**:
   - Ensure the UI works well on mobile devices
   - Add push notifications for song changes

4. **Testing and Robustness**:
   - Add comprehensive tests for command interface and WebSocket
   - Enhance error handling and recovery procedures