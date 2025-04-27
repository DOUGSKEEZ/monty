import axios from 'axios';
import { Weather } from '../models/Weather';

const API_URL = 'http://localhost:5000/api';

// Get current weather data
export const fetchCurrentWeather = async (): Promise<Weather> => {
  try {
    const response = await axios.get(`${API_URL}/weather/current`);
    return response.data;
  } catch (error) {
    console.error('Error fetching current weather:', error);
    throw new Error('Failed to fetch current weather');
  }
};

// Get weather forecast data
export const fetchWeatherForecast = async () => {
  try {
    const response = await axios.get(`${API_URL}/weather/forecast`);
    return response.data;
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    throw new Error('Failed to fetch weather forecast');
  }
};
