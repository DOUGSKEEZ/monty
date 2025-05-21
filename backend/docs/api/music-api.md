# Music Control API

The Music Control API provides endpoints for controlling music playback through Pandora via the pianobar client.

## Endpoints

### GET /api/music/status

Returns the current playback status.

**Response:**

```json
{
  "success": true,
  "data": {
    "playing": true,
    "song": {
      "title": "Hotel California",
      "artist": "Eagles",
      "album": "Hotel California",
      "coverArt": "https://example.com/cover/hotel-california.jpg",
      "duration": 391,
      "elapsed": 127
    },
    "station": {
      "id": "2",
      "name": "Classic Rock Radio"
    },
    "volume": 80,
    "bluetooth": {
      "connected": true,
      "device": "Living Room Speaker"
    }
  }
}
```

### GET /api/music/stations

Returns a list of available Pandora stations.

**Response:**

```json
{
  "success": true,
  "data": {
    "stations": [
      {
        "id": "1",
        "name": "QuickMix",
        "isQuickMix": true
      },
      {
        "id": "2",
        "name": "Classic Rock Radio",
        "isQuickMix": false
      },
      // Additional stations...
    ],
    "currentStation": "2"
  }
}
```

### POST /api/music/control

Controls music playback.

**Request Body:**

```json
{
  "command": "play"
}
```

**Parameters:**

- `command`: One of: "play", "pause", "next", "volumeUp", "volumeDown" (required)

**Response:**

```json
{
  "success": true,
  "data": {
    "command": "play",
    "playing": true,
    "timestamp": "2023-07-25T16:30:00Z"
  }
}
```

### POST /api/music/station

Selects a Pandora station.

**Request Body:**

```json
{
  "stationId": "3"
}
```

**Parameters:**

- `stationId`: Station ID to select (required)

**Response:**

```json
{
  "success": true,
  "data": {
    "station": {
      "id": "3",
      "name": "Today's Hits Radio"
    },
    "timestamp": "2023-07-25T16:35:00Z"
  }
}
```

### POST /api/music/bluetooth

Controls Bluetooth speaker connections.

**Request Body:**

```json
{
  "command": "connect",
  "device": "Living Room Speaker"
}
```

**Parameters:**

- `command`: One of: "connect", "disconnect", "list" (required)
- `device`: Device name to connect to (required for "connect")

**Response:**

```json
{
  "success": true,
  "data": {
    "command": "connect",
    "device": "Living Room Speaker",
    "connected": true,
    "timestamp": "2023-07-25T16:40:00Z"
  }
}
```

### GET /api/music/bluetooth/devices

Returns a list of available Bluetooth devices.

**Response:**

```json
{
  "success": true,
  "data": {
    "connected": "Living Room Speaker",
    "devices": [
      {
        "name": "Living Room Speaker",
        "address": "00:11:22:33:44:55",
        "connected": true
      },
      {
        "name": "Kitchen Speaker",
        "address": "AA:BB:CC:DD:EE:FF",
        "connected": false
      },
      // Additional devices...
    ]
  }
}
```

## Error Responses

### Pianobar Not Running

```json
{
  "success": false,
  "error": {
    "code": "PIANOBAR_NOT_RUNNING",
    "message": "Pianobar is not currently running"
  }
}
```

### Invalid Command

```json
{
  "success": false,
  "error": {
    "code": "INVALID_COMMAND",
    "message": "Command 'invalid' not recognized"
  }
}
```

### Bluetooth Error

```json
{
  "success": false,
  "error": {
    "code": "BLUETOOTH_ERROR",
    "message": "Failed to connect to Bluetooth device",
    "details": "Device not found or not available"
  }
}
```