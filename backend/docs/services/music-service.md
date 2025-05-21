# Music Service

The Music Service provides an interface to control music playback through Pandora via the pianobar command-line client. It manages station selection, playback control, and Bluetooth speaker connections.

## Interface

```javascript
class IMusicService extends BaseInterface {
  static get methods() {
    return {
      // Playback control
      play: "function",
      pause: "function",
      next: "function",
      
      // Station management
      getStations: "function",
      selectStation: "function",
      
      // Status information
      getPlaybackStatus: "function",
      getCurrentSong: "function",
      
      // Bluetooth management
      connectBluetooth: "function",
      disconnectBluetooth: "function",
      getBluetoothStatus: "function",
      
      // Service status
      getServiceStatus: "function"
    };
  }
}
```

## Features

- **Pandora integration**: Control Pandora playback via pianobar
- **Playback control**: Play, pause, skip tracks
- **Station management**: List and select Pandora stations
- **Bluetooth connectivity**: Connect to Bluetooth speakers
- **Status monitoring**: Track current song, playback status, and service health

## Usage Examples

### Control Playback

```javascript
const musicService = require('../services/serviceFactory').musicService;

async function togglePlayback() {
  const status = await musicService.getPlaybackStatus();
  
  if (status.playing) {
    await musicService.pause();
    console.log('Music paused');
  } else {
    await musicService.play();
    console.log('Music playing');
  }
}
```

### Select a Station

```javascript
async function changeStation(stationId) {
  const result = await musicService.selectStation(stationId);
  
  if (result.success) {
    console.log(`Now playing: ${result.station.name}`);
  } else {
    console.error('Failed to change station:', result.error);
  }
}

// Example: Switch to station #2
changeStation(2);
```

### Connect to Bluetooth Speaker

```javascript
async function connectToSpeaker(deviceName) {
  console.log(`Connecting to ${deviceName}...`);
  const result = await musicService.connectBluetooth(deviceName);
  
  if (result.success) {
    console.log('Connected successfully');
  } else {
    console.error('Connection failed:', result.error);
  }
}
```

## Response Format

### Playback Status Response

```javascript
{
  success: Boolean,
  playing: Boolean,
  song: {
    title: "string",
    artist: "string",
    album: "string",
    coverArt: "string", // URL to album art
    duration: Number, // In seconds
    elapsed: Number // In seconds
  },
  station: {
    id: "string",
    name: "string"
  },
  volume: Number, // 0-100
  bluetooth: {
    connected: Boolean,
    device: "string" // Connected device name
  }
}
```

### Stations Response

```javascript
{
  success: Boolean,
  stations: [
    {
      id: "string", // Station ID in pianobar format
      name: "string",
      isQuickMix: Boolean
    }
  ],
  currentStation: "string" // ID of currently selected station
}
```

### Bluetooth Status Response

```javascript
{
  success: Boolean,
  connected: Boolean,
  device: "string", // Connected device name if any
  available: [ // List of available devices
    {
      name: "string",
      address: "string"
    }
  ]
}
```

## Implementation Details

The music service interfaces with pianobar (a command-line Pandora client) using a FIFO pipe for control and reads status from cache files. It also manages Bluetooth connections via the BlueZ stack using a shell script wrapper.

### Pianobar Control

Pianobar is controlled by writing commands to its control FIFO:
- `p` - Toggle play/pause
- `n` - Skip to next song
- `s` - List stations
- `s #` - Switch to station by number

### Bluetooth Connection

The service uses the `bt-connect.sh` script to manage Bluetooth connections with elevated privileges as required.

### Dependency Injection

The DI-compatible implementation accepts dependencies through its constructor:

```javascript
class MusicService {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || console;
    this.configManager = dependencies.configManager;
    this.path = dependencies.path || require('path');
    this.fs = dependencies.fs || require('fs');
    this.exec = dependencies.exec || require('child_process').exec;
    // Initialize service
  }
  
  // Service methods...
}
```

### Service Registration

The service is registered with the dependency container:

```javascript
container.register('musicService', MusicService, {
  dependencies: ['logger', 'configManager'],
  lifecycle: Lifecycle.SINGLETON
});
```

## Related Services

- **Config Service**: Stores music service configuration and preferences
- **Cache Service**: Manages cached data like station lists and playback status