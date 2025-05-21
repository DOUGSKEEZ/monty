const express = require('express');
const router = express.Router();
const { weatherService } = require('../services/serviceFactory');
const logger = require('../utils/logger').getModuleLogger('weather-routes');

// Initialize weather service in non-blocking way
process.nextTick(() => {
  logger.info('Weather routes initialized');
});

// Get current weather data
router.get('/current', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await weatherService.getCurrentWeather(forceRefresh);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
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
    const result = await weatherService.getForecast(forceRefresh);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
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
    
    const result = await weatherService.getSunriseSunsetTimes(date);
    
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

// Get temperatures from all sources (weather + Govee sensors)
router.get('/temperatures', async (req, res) => {
  try {
    // First get current weather for outdoor temperature
    const weatherResult = await weatherService.getCurrentWeather();
    const outdoorTemp = weatherResult.success ? weatherResult.data.temperature.current : null;
    
    // TODO: Implement Govee sensor integration in the future
    // For now, return mock data for the Govee sensors
    const temps = {
      outdoor: outdoorTemp,
      mainFloor: 72, // Mock data
      masterBedroom: 70, // Mock data
      garage: 68, // Mock data
      guestBedroom: 71, // Mock data
      humidor: 69 // Mock data
    };
    
    res.json({
      success: true,
      data: temps,
      note: "Indoor temperatures are mock data. Govee integration pending."
    });
  } catch (error) {
    logger.error(`Error getting temperatures: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get temperatures'
    });
  }
});

module.exports = router;