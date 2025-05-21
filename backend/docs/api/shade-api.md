# Shade Control API

The Shade Control API provides endpoints for controlling window shades and executing shade scenes.

## Endpoints

### GET /api/shades

Returns a list of all configured shades.

**Response:**

```json
{
  "success": true,
  "data": {
    "shades": [
      {
        "id": 14,
        "name": "Living Room North",
        "room": "Living Room",
        "type": "solar",
        "position": "up",
        "lastCommand": {
          "command": "up",
          "timestamp": "2023-07-25T14:30:00Z"
        }
      },
      // Additional shades...
    ]
  }
}
```

### GET /api/shades/rooms

Returns a list of rooms with their associated shades.

**Response:**

```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "name": "Living Room",
        "shades": [
          {
            "id": 14,
            "name": "Living Room North",
            "type": "solar",
            "position": "up"
          },
          // Additional shades in this room...
        ]
      },
      // Additional rooms...
    ]
  }
}
```

### POST /api/shades/control

Controls an individual shade.

**Request Body:**

```json
{
  "id": 14,
  "command": "down"
}
```

**Parameters:**

- `id`: Shade ID (required)
- `command`: One of: "up", "down", "stop" (required)

**Response:**

```json
{
  "success": true,
  "data": {
    "shade": {
      "id": 14,
      "name": "Living Room North",
      "command": "down",
      "timestamp": "2023-07-25T15:45:00Z"
    }
  }
}
```

### POST /api/shades/scene

Executes a predefined shade scene.

**Request Body:**

```json
{
  "scene": "goodMorning"
}
```

**Parameters:**

- `scene`: Scene name (required). Options: "goodMorning", "goodAfternoon", "goodEvening", "goodNight", "riseAndShine"

**Response:**

```json
{
  "success": true,
  "data": {
    "scene": "goodMorning",
    "shades": [
      {
        "id": 14,
        "command": "up",
        "success": true
      },
      // Additional shades affected by this scene...
    ],
    "timestamp": "2023-07-25T15:45:00Z"
  }
}
```

### GET /api/shades/status

Returns the status of the shade control service.

**Response:**

```json
{
  "success": true,
  "status": "running",
  "lastCommand": {
    "shade": 14,
    "command": "down",
    "timestamp": "2023-07-25T15:45:00Z"
  },
  "controllerConnected": true
}
```

## Error Responses

### Invalid Shade ID

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SHADE_ID",
    "message": "Shade ID 999 not found"
  }
}
```

### Invalid Command

```json
{
  "success": false,
  "error": {
    "code": "INVALID_COMMAND",
    "message": "Command 'invalid' not recognized. Must be one of: up, down, stop"
  }
}
```

### Controller Error

```json
{
  "success": false,
  "error": {
    "code": "CONTROLLER_ERROR",
    "message": "Failed to communicate with shade controller"
  }
}
```