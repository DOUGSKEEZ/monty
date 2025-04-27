import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { Weather } from '../../models/Weather';

dotenv.config();

const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const LAT = process.env.LOCATION_LAT || '51.507351';
const LON = process.env.LOCATION_LON || '-0.127758';

// Get current weather data
export const getCurrentWeather = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric`
    );

    const data = response.data;
    const weatherData: Weather = {
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      temp_min: data.main.temp_min,
      temp_max: data.main.temp_max,
      pressure: data.main.pressure,
      humidity: data.main.humidity,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      lastUpdated: new Date()
    };

    res.json(weatherData);
  } catch (error) {
    console.error('Error fetching weather data:', error);
    res.status(500).json({ message: 'Failed to fetch weather data' });
  }
};

// Get weather forecast data
export const getWeatherForecast = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric`
    );

    const forecastData = response.data.list.map((item: any) => ({
      dt: item.dt,
      temp: item.main.temp,
      feels_like: item.main.feels_like,
      temp_min: item.main.temp_min,
      temp_max: item.main.temp_max,
      pressure: item.main.pressure,
      humidity: item.main.humidity,
      description: item.weather[0].description,
      icon: item.weather[0].icon,
      windSpeed: item.wind.speed,
      windDirection: item.wind.deg,
    }));

    res.json(forecastData);
  } catch (error) {
    console.error('Error fetching forecast data:', error);
    res.status(500).json({ message: 'Failed to fetch forecast data' });
  }
};
