import React, { useEffect, useState } from 'react';
import WeatherDisplay from '../components/WeatherDisplay';
import { Weather } from '../models/Weather';
import { fetchCurrentWeather, fetchWeatherForecast } from '../api/weatherApi';
import './WeatherPage.css';

interface ForecastItem {
  dt: number;
  temp: number;
  feels_like: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

const WeatherPage: React.FC = () => {
  const [currentWeather, setCurrentWeather] = useState<Weather | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWeatherData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [current, forecastData] = await Promise.all([
          fetchCurrentWeather(),
          fetchWeatherForecast()
        ]);

        setCurrentWeather(current);
        setForecast(forecastData);
      } catch (err) {
        console.error('Error loading weather data:', err);
        setError('Failed to load weather data');
      } finally {
        setIsLoading(false);
      }
    };

    loadWeatherData();

    // Refresh weather data every 15 minutes
    const refreshInterval = setInterval(loadWeatherData, 15 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, []);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="weather-page">
      <h1>Weather Information</h1>
      
      <div className="weather-container">
        <div className="current-weather">
          <h2>Current Weather</h2>
          <WeatherDisplay
            weather={currentWeather}
            isLoading={isLoading}
            error={error}
          />
        </div>
        
        <div className="weather-forecast">
          <h2>Forecast</h2>
          
          {isLoading ? (
            <div className="loading">Loading forecast...</div>
          ) : error ? (
            <div className="error">Error: {error}</div>
          ) : (
            <div className="forecast-grid">
              {forecast.slice(0, 8).map((item, index) => (
                <div key={index} className="forecast-item card">
                  <div className="forecast-time">
                    {formatTime(item.dt)}
                  </div>
                  <div className="forecast-date">
                    {formatDate(item.dt)}
                  </div>
                  <div className="forecast-icon">
                    <img 
                      src={`http://openweathermap.org/img/wn/${item.icon}.png`} 
                      alt={item.description} 
                    />
                  </div>
                  <div className="forecast-temp">
                    {Math.round(item.temp)}°C
                  </div>
                  <div className="forecast-desc">
                    {item.description}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeatherPage;
