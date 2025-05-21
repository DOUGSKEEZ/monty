# Monty Backend Services

This directory contains documentation for the core services in the Monty backend.

## Service Architecture

The Monty backend follows a modular service-oriented architecture:

- Each service is responsible for a specific domain of functionality
- Services can be used independently or composed together
- The new dependency injection system allows for better testing and modularity
- Services implement well-defined interfaces

## Available Services

| Service | Description | Interface |
|---------|-------------|-----------|
| [Weather Service](weather-service.md) | Provides weather data from OpenWeatherMap API | IWeatherService |
| [Scheduler Service](scheduler-service.md) | Manages scheduled events and automation | ISchedulerService |
| [Shade Service](shade-service.md) | Controls window shades | IShadeService |
| [Music Service](music-service.md) | Interface to Pandora via pianobar | IMusicService |
| [Config Service](config-service.md) | Manages application configuration and settings | IConfigService |

## Service Factory

The `serviceFactory.js` module provides a consistent way to obtain service instances. It handles dependency injection and ensures backward compatibility with code that directly imports services.

Example usage:

```javascript
const { weatherService, schedulerService, getService } = require('../services/serviceFactory');

// Use imported services directly
const weather = await weatherService.getCurrentWeather();

// Or resolve them by name
const shadeService = getService('shadeService');
```

## Implementing New Services

New services should:

1. Define an interface in `/interfaces` directory
2. Implement the interface
3. Register with the service factory
4. Use dependency injection for dependencies
5. Include proper error handling and self-healing where appropriate

See the [Developer Guide](../architecture/developer-guide.md) for more details on implementing new services.