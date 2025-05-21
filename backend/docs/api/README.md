# Monty API Documentation

This directory contains documentation for the Monty RESTful API endpoints. The API provides access to all core functionality of the Monty home automation system.

## API Structure

The API is organized into domain-specific routes:

- `/api/weather` - Weather data and forecasts
- `/api/shades` - Window shade control
- `/api/music` - Music playback control
- `/api/config` - System configuration
- `/api/scheduler` - Scheduled events and automation

## API Conventions

All API endpoints follow these conventions:

1. **Response Format**: Consistent `{ success, data, error }` structure
2. **Error Handling**: Standardized error responses with codes and messages
3. **Authentication**: Local network authentication (no tokens required)
4. **Content Type**: All responses are in JSON format

## API Documentation

- [Weather API](./weather-api.md) - Weather data and forecasts
- [Shade Control API](./shade-api.md) - Window shade control
- [Music Control API](./music-api.md) - Music playback control
- [Config API](./config-api.md) - System configuration
- [Scheduler API](./scheduler-api.md) - Scheduled events and automation

## Making API Requests

API requests can be made to the backend server running at:

- Development: `http://localhost:3001/api/...`
- Production: `http://<server-ip>:3001/api/...`

Example request:

```javascript
fetch('http://localhost:3001/api/weather/current')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('Current temperature:', data.data.temperature.current);
    } else {
      console.error('Error:', data.error);
    }
  });
```

## Error Handling

API errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "WEATHER_API_ERROR",
    "message": "Failed to fetch weather data",
    "details": "API key expired"
  }
}
```