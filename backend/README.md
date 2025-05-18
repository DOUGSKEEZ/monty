# Monty Home Automation Backend

The backend server for the Monty home automation system provides API endpoints for shade control, music playback, weather data, and scheduling automated tasks.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on the provided `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Fill in the required environment variables in the `.env` file

## Running the Server

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

## API Documentation

### Health Check
- `GET /api/health` - Check if server is running

### Shade Control
- `POST /api/shades/control` - Control individual shade
  ```json
  {
    "shade_id": 14,
    "command": "u",
    "repeat": true
  }
  ```

- `POST /api/shades/scene` - Control a group of shades
  ```json
  {
    "scene_group": "main",
    "command": "u",
    "repeat": true
  }
  ```

- `POST /api/shades/scene-workflow` - Trigger a predefined scene
  ```json
  {
    "scene_name": "good-morning"
  }
  ```

### Configuration
- `GET /api/config` - Get all configuration
- `GET /api/config/:path` - Get specific configuration
- `PUT /api/config/:path` - Update specific configuration
  ```json
  {
    "value": "new-value"
  }
  ```
- `POST /api/config` - Update multiple configuration values
  ```json
  {
    "updates": {
      "wakeUpTime.defaultTime": "07:00",
      "shadeScenes.goodNightOffset": 45
    }
  }
  ```
- `POST /api/config/wake-up-time` - Set wake-up time
  ```json
  {
    "time": "08:30"
  }
  ```
- `POST /api/config/home-status` - Set home/away status
  ```json
  {
    "status": "away"
  }
  ```
- `POST /api/config/away-periods` - Add away period
  ```json
  {
    "startDate": "2025-06-01",
    "endDate": "2025-06-05"
  }
  ```
- `DELETE /api/config/away-periods/:index` - Remove away period

### Weather
- `GET /api/weather/current` - Get current weather
- `GET /api/weather/forecast` - Get forecast
- `GET /api/weather/sun-times` - Get sunrise/sunset times
- `GET /api/weather/temperatures` - Get all temperatures

### Scheduler
- `GET /api/scheduler/schedules` - Get all active schedules
- `POST /api/scheduler/wake-up` - Set wake-up time
  ```json
  {
    "time": "08:30"
  }
  ```
- `POST /api/scheduler/trigger` - Manually trigger a schedule
  ```json
  {
    "scene_name": "goodMorning"
  }
  ```

### Music
- `GET /api/music/status` - Get music player status
- `GET /api/music/stations` - Get list of stations
- `POST /api/music/start` - Start music player
  ```json
  {
    "connectBluetooth": true
  }
  ```
- `POST /api/music/stop` - Stop music player
  ```json
  {
    "disconnectBluetooth": true
  }
  ```
- `POST /api/music/control` - Control music playback
  ```json
  {
    "command": "p"  // p=play/pause, n=next, +=love, s=list stations, s 2=change to station 2
  }
  ```
- `POST /api/music/bluetooth/connect` - Connect to Bluetooth speaker
- `POST /api/music/bluetooth/disconnect` - Disconnect from Bluetooth speaker

## Directory Structure
- `src/`
  - `server.js` - Main server file
  - `routes/` - API route definitions
  - `services/` - Business logic
  - `utils/` - Utility functions and helpers

## Architecture

The backend is built with a modular, service-oriented architecture:

1. **API Layer** - Express.js routes map endpoints to service methods
2. **Service Layer** - Core business logic and external integrations
3. **Config Management** - Persistent settings and user preferences
4. **Logging** - Winston-based logging with file rotation

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 4000 |
| NODE_ENV | Environment (development/production) | development |
| LOG_LEVEL | Logging level | info |
| OPENWEATHERMAP_API_KEY | API key for weather data | - |
| PIANOBAR_CONFIG_DIR | Pianobar configuration directory | ~/.config/pianobar |
| BLUETOOTH_SPEAKER_MAC | Bluetooth speaker MAC address | 54:B7:E5:87:7B:73 |
| SHADE_CONTROLLER_PATH | Path to shade controller script | /home/monty/shades/control_shades.py |