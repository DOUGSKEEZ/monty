const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { createWeatherService } = require('../utils/ServiceFactory');

// Path to the readings file written by the Govee BLE reader service (govee/govee_reader.py)
const GOVEE_READINGS_PATH = path.join(__dirname, '..', '..', '..', 'data', 'govee_readings.json');
// A sensor reading older than this (ms) is considered stale (reader writes every ~15s)
const GOVEE_STALE_MS = 5 * 60 * 1000;
// Lazy-load weather service to avoid initialization timing issues
let weatherService = null;
const getWeatherService = () => {
  if (!weatherService) {
    weatherService = createWeatherService();
  }
  return weatherService;
};
const logger = require('../utils/logger').getModuleLogger('weather-routes');

// Initialize weather service in non-blocking way
process.nextTick(() => {
  logger.info('Weather routes initialized');
});

// Get current weather data
router.get('/current', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await getWeatherService().getCurrentWeather(forceRefresh);
    
    // Wrap response in consistent format for frontend
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error getting current weather: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get current weather'
    });
  }
});

// Get weather forecast
router.get('/forecast', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await getWeatherService().getForecast(forceRefresh);
    
    // Wrap response in consistent format for frontend
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error getting forecast: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get forecast'
    });
  }
});

// Get sunrise/sunset times
router.get('/sun-times', async (req, res) => {
  try {
    let date = new Date();
    
    // Check if a specific date was requested
    if (req.query.date) {
      date = new Date(req.query.date);
      
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        });
      }
    }
    
    const result = await getWeatherService().getSunriseSunsetTimes(date);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error getting sun times: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get sun times'
    });
  }
});

// Read the latest Govee sensor readings written by the BLE reader service.
// Returns { rooms: {...} } or null if the file is missing/unreadable.
function readGoveeReadings() {
  try {
    const raw = fs.readFileSync(GOVEE_READINGS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Govee readings unavailable: ${err.message}`);
    return null;
  }
}

// Get temperatures from all sources (weather + Govee sensors)
router.get('/temperatures', async (req, res) => {
  try {
    // Outdoor air temperature comes from the weather service (authoritative for outside air).
    const weatherResult = await getWeatherService().getCurrentWeather();
    const outdoorTemp = weatherResult?.temperature?.current ?? null;

    // Indoor/outdoor sensor readings come from the Govee BLE reader.
    const govee = readGoveeReadings();
    const rooms = govee?.rooms || {};
    const now = Date.now();

    // Backward-compatible flat temperature map (numbers) the existing UI reads.
    const temps = { outdoor: outdoorTemp };
    // Parallel humidity map and rich per-sensor detail (battery, staleness, signal).
    const humidity = {};
    const sensors = {};

    for (const [room, r] of Object.entries(rooms)) {
      temps[room] = r.temp_f ?? null;
      humidity[room] = r.humidity ?? null;
      const ageMs = r.last_seen ? now - new Date(r.last_seen).getTime() : null;
      sensors[room] = {
        label: r.label,
        temp_f: r.temp_f ?? null,
        humidity: r.humidity ?? null,
        battery: r.battery ?? null,
        rssi: r.rssi ?? null,
        lastSeen: r.last_seen ?? null,
        stale: ageMs == null || ageMs > GOVEE_STALE_MS,
      };
    }

    res.json({
      success: true,
      data: {
        ...temps,
        humidity,
        sensors,
        updated: govee?.updated ?? null,
      },
      note: govee ? undefined : 'Govee reader offline — indoor sensor data unavailable.'
    });
  } catch (error) {
    logger.error(`Error getting temperatures: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get temperatures'
    });
  }
});

// Get API usage statistics for dashboard
router.get('/usage', async (req, res) => {
  try {
    const stats = getWeatherService().getUsageStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`Error getting weather API usage: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get API usage stats'
    });
  }
});

// Check if manual refresh is allowed
router.get('/can-refresh', async (req, res) => {
  try {
    const refreshStatus = getWeatherService().canManualRefresh();
    
    res.json({
      success: true,
      data: refreshStatus
    });
  } catch (error) {
    logger.error(`Error checking refresh status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to check refresh status'
    });
  }
});

// Proxy endpoint for weather map tiles (secure API key handling)
router.get('/map-tile/:layer/:z/:x/:y', async (req, res) => {
  try {
    const { layer, z, x, y } = req.params;
    
    // Get API key securely from weather service
    const weatherService = getWeatherService();
    const apiKey = process.env.OPENWEATHERMAP_API_KEY || weatherService.configManager.get('weather.apiKey');
    
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Weather API key not configured'
      });
    }
    
    // Validate parameters
    const validLayers = ['precipitation_new', 'clouds_new', 'pressure_new', 'temp_new', 'wind_new'];
    if (!validLayers.includes(layer)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid map layer'
      });
    }
    
    const zoomLevel = parseInt(z);
    if (isNaN(zoomLevel) || zoomLevel < 0 || zoomLevel > 18) {
      return res.status(400).json({
        success: false,
        error: 'Invalid zoom level'
      });
    }
    
    // Build OpenWeatherMap tile URL with secure API key
    // Note: Using Weather Maps 1.0 API - this shows current conditions but may have 3-hour model intervals
    // For more precise current data, consider upgrading to Weather Maps 2.0 API with date parameter
    const tileUrl = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${apiKey}`;
    
    // Map tile request (logging disabled to reduce verbosity)
    
    // Fetch the tile from OpenWeatherMap
    const https = require('https');
    const response = await new Promise((resolve, reject) => {
      const request = https.get(tileUrl, (res) => {
        resolve(res);
      });
      
      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.abort();
        reject(new Error('Tile request timeout'));
      });
    });
    
    // Set appropriate headers for map tiles
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=600', // Cache for 10 minutes
      'Access-Control-Allow-Origin': '*', // Allow cross-origin for map tiles
    });
    
    // Pipe the image data to the response
    response.pipe(res);
    
  } catch (error) {
    logger.error(`Error proxying map tile: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to load map tile'
    });
  }
});

module.exports = router;