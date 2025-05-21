# Weather Service

The Weather Service provides access to current weather data, forecasts, and sunrise/sunset times.

## Interface

The Weather Service implements the `IWeatherService` interface defined in `/src/interfaces/IWeatherService.js`.

## Features

- Current weather conditions
- Multi-day forecasts
- Sunrise and sunset times
- Caching with configurable expiration
- Fallback to cached data on API failures
- Rate limiting to avoid API quota issues
- Exponential backoff for handling API errors
- Circuit breaking for fault tolerance

## Configuration

The service uses environment variables and configuration settings:

- `OPENWEATHERMAP_API_KEY` - API key for OpenWeatherMap
- `weather.refreshIntervalMin` - Cache time for current weather (default: 60 minutes)
- `weather.cacheExpirationMin` - Cache time for forecast data (default: 180 minutes)
- `location.zipCode` - Default zip code for weather lookups (default: 80498)

## Usage

```javascript
const { weatherService } = require('../services/serviceFactory');

// Get current weather (uses cache by default)
const weather = await weatherService.getCurrentWeather();

// Force a refresh from the API
const freshWeather = await weatherService.getCurrentWeather(true);

// Get forecast
const forecast = await weatherService.getForecast();

// Get sunrise/sunset times for today
const sunTimes = await weatherService.getSunriseSunsetTimes();

// Get times for a specific date
const futureSunTimes = await weatherService.getSunriseSunsetTimes(new Date('2023-12-25'));
```

## Response Format

### Current Weather

```javascript
{
  success: true,
  data: {
    location: {
      name: "Silverthorne",
      country: "US",
      coordinates: { lat: 39.63, lon: -106.07 }
    },
    temperature: {
      current: 72,
      feelsLike: 70,
      min: 68,
      max: 75
    },
    weather: {
      main: "Clear",
      description: "clear sky",
      icon: "01d"
    },
    wind: {
      speed: 5.8,
      direction: 230
    },
    humidity: 35,
    pressure: 1010,
    sunrise: 1631877600000, // Milliseconds
    sunset: 1631923800000,  // Milliseconds
    timezone: -21600,
    fetchTime: 1631900000000
  },
  cached: false
}
```

### Forecast

```javascript
{
  success: true,
  data: {
    location: {
      name: "Silverthorne",
      country: "US",
      coordinates: { lat: 39.63, lon: -106.07 }
    },
    days: [
      {
        date: "2023-05-19",
        dayOfWeek: "Friday",
        min: 68,
        max: 78,
        weatherMain: "Clear",
        icon: "01d",
        hourly: [
          {
            time: "2:00 PM",
            timestamp: 1631900400000,
            temperature: 75,
            feelsLike: 73,
            weather: {
              main: "Clear",
              description: "clear sky",
              icon: "01d"
            },
            wind: {
              speed: 6.2,
              direction: 225
            },
            humidity: 30,
            pressure: 1008
          },
          // More hourly forecasts...
        ]
      },
      // More days...
    ],
    fetchTime: 1631900000000
  },
  cached: false
}
```

### Sunrise/Sunset Times

```javascript
{
  success: true,
  data: {
    date: "2023-05-19",
    sunrise: 1631877600000,  // Milliseconds
    sunset: 1631923800000,   // Milliseconds
    sunriseTime: "6:30 AM",
    sunsetTime: "7:45 PM"
  }
}
```

## Error Handling

When errors occur, the service follows these strategies:

1. Return cached data if available (with `stale: true` flag)
2. Implement exponential backoff for API errors
3. Provide meaningful error messages
4. Use circuit breaking when APIs are consistently failing

Error response format:

```javascript
{
  success: false,
  error: "Error message",
  serviceStatus: "down",  // Optional status
  retryAfter: 300000      // Optional milliseconds to wait before retry
}
```

## Implementation Details

The service is implemented in three versions:

1. `weatherService.js` - Original implementation 
2. `weatherService.fixed.js` - Enhanced version with resilience features
3. `weatherService.di.js` - Dependency injection version (recommended)

The DI version uses constructor-based dependency injection:

```javascript
class WeatherService extends IWeatherService {
  constructor(logger, configManager) {
    // Initialize with injected dependencies
  }
  // ...
}
```