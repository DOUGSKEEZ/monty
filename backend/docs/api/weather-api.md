# Weather API

The Weather API provides access to current weather conditions and forecasts.

## Endpoints

### GET /api/weather/current

Returns current weather conditions.

**Response:**

```json
{
  "success": true,
  "data": {
    "temperature": {
      "current": 72,
      "feelsLike": 74,
      "min": 68,
      "max": 75
    },
    "humidity": 65,
    "wind": {
      "speed": 5,
      "direction": "NE"
    },
    "conditions": "Partly Cloudy",
    "icon": "03d",
    "location": "Austin, TX",
    "timestamp": "2023-07-25T18:30:00Z"
  }
}
```

### GET /api/weather/forecast

Returns a 5-day weather forecast.

**Query Parameters:**

- `days` (optional): Number of days to return (1-5, default: 5)

**Response:**

```json
{
  "success": true,
  "data": {
    "daily": [
      {
        "date": "2023-07-25",
        "day": "Tuesday",
        "temperature": {
          "min": 68,
          "max": 82
        },
        "conditions": "Sunny",
        "icon": "01d",
        "precipitation": 0
      },
      // Additional days...
    ],
    "location": "Austin, TX",
    "timestamp": "2023-07-25T18:30:00Z"
  }
}
```

### GET /api/weather/status

Returns the status of the weather service.

**Response:**

```json
{
  "success": true,
  "status": "running",
  "lastUpdate": "2023-07-25T18:15:00Z",
  "nextUpdate": "2023-07-25T19:15:00Z",
  "provider": "OpenWeatherMap"
}
```

## Error Responses

### API Key Error

```json
{
  "success": false,
  "error": {
    "code": "WEATHER_API_KEY_ERROR",
    "message": "Invalid or missing API key"
  }
}
```

### Service Unavailable

```json
{
  "success": false,
  "error": {
    "code": "WEATHER_SERVICE_UNAVAILABLE",
    "message": "Weather service is currently unavailable"
  }
}
```

### Location Not Found

```json
{
  "success": false,
  "error": {
    "code": "LOCATION_NOT_FOUND",
    "message": "Unable to find weather data for the specified location"
  }
}
```