import express from 'express';
import * as weatherController from '../controllers/weatherController';

const router = express.Router();

// Get current weather data
router.get('/current', weatherController.getCurrentWeather);

// Get forecast data
router.get('/forecast', weatherController.getWeatherForecast);

export default router;
