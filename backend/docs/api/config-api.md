# Configuration API

The Configuration API provides endpoints for managing system settings and preferences for the Monty home automation system.

## Endpoints

### GET /api/config

Returns the current system configuration.

**Response:**

```json
{
  "success": true,
  "data": {
    "system": {
      "name": "Monty Home Automation",
      "version": "1.2.0",
      "environment": "production"
    },
    "weather": {
      "location": {
        "city": "Austin",
        "state": "TX",
        "latitude": 30.267,
        "longitude": -97.743
      },
      "units": "imperial",
      "updateInterval": 3600
    },
    "scheduler": {
      "wakeUpTime": "07:30",
      "bedTime": "22:30",
      "autoEnable": true
    },
    "shades": {
      "defaultRoom": "Living Room",
      "autoClose": true
    },
    "music": {
      "defaultStation": "2",
      "defaultVolume": 80,
      "bluetoothDevice": "Living Room Speaker"
    },
    "features": {
      "weatherEnabled": true,
      "shadesEnabled": true,
      "musicEnabled": true,
      "bluetoothEnabled": true,
      "schedulerEnabled": true
    }
  }
}
```

### GET /api/config/:section

Returns a specific section of the configuration.

**Parameters:**

- `section`: Section name (path parameter, required)

**Response:**

```json
{
  "success": true,
  "data": {
    "weather": {
      "location": {
        "city": "Austin",
        "state": "TX",
        "latitude": 30.267,
        "longitude": -97.743
      },
      "units": "imperial",
      "updateInterval": 3600
    }
  }
}
```

### PATCH /api/config

Updates the system configuration.

**Request Body:**

```json
{
  "weather": {
    "units": "metric",
    "updateInterval": 1800
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "updated": ["weather.units", "weather.updateInterval"],
    "timestamp": "2023-07-25T17:15:00Z"
  }
}
```

### PATCH /api/config/:section

Updates a specific section of the configuration.

**Parameters:**

- `section`: Section name (path parameter, required)

**Request Body:**

```json
{
  "wakeUpTime": "08:00",
  "bedTime": "23:00"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "section": "scheduler",
    "updated": ["wakeUpTime", "bedTime"],
    "timestamp": "2023-07-25T17:20:00Z"
  }
}
```

### GET /api/config/features

Returns the status of feature flags.

**Response:**

```json
{
  "success": true,
  "data": {
    "features": {
      "weatherEnabled": true,
      "shadesEnabled": true,
      "musicEnabled": true,
      "bluetoothEnabled": true,
      "schedulerEnabled": true
    }
  }
}
```

### PATCH /api/config/features

Updates feature flags.

**Request Body:**

```json
{
  "bluetoothEnabled": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "updated": ["bluetoothEnabled"],
    "features": {
      "weatherEnabled": true,
      "shadesEnabled": true,
      "musicEnabled": true,
      "bluetoothEnabled": false,
      "schedulerEnabled": true
    }
  }
}
```

### POST /api/config/reset

Resets configuration to default values.

**Request Body:**

```json
{
  "sections": ["weather"],  // Optional: specific sections to reset
  "confirm": true  // Required for safety
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "reset": ["weather"],
    "timestamp": "2023-07-25T17:25:00Z"
  }
}
```

## Error Responses

### Invalid Configuration

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CONFIG",
    "message": "Invalid configuration value",
    "details": "'temperature.units' must be one of: imperial, metric"
  }
}
```

### Section Not Found

```json
{
  "success": false,
  "error": {
    "code": "SECTION_NOT_FOUND",
    "message": "Configuration section 'unknown' not found"
  }
}
```

### Permission Denied

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Cannot modify system.version configuration"
  }
}
```