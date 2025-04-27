import React from 'react';
import { Weather } from '../models/Weather';
import './WeatherDisplay.css';

interface WeatherDisplayProps {
  weather: Weather | null;
  isLoading: boolean;
  error: string | null;
}

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({ weather, isLoading, error }) => {
  if (isLoading) {
    return <div className="weather-loading">Loading weather data...</div>;
  }

  if (error) {
    return <div className="weather-error">Error: {error}</div>;
  }

  if (!weather) {
    return <div className="weather-empty">No weather data available</div>;
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="weather-display card">
      <div className="weather-header">
        <div className="weather-icon">
          <img 
            src={`http://openweathermap.org/img/wn/${weather.icon}@2x.png`} 
            alt={weather.description} 
          />
        </div>
        <div className="weather-main">
          <h2>{Math.round(weather.temp)}°C</h2>
          <p className="weather-description">{weather.description}</p>
        </div>
      </div>
      
      <div className="weather-details">
        <div className="weather-detail-item">
          <span className="detail-label">Feels like:</span>
          <span className="detail-value">{Math.round(weather.feels_like)}°C</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">Min/Max:</span>
          <span className="detail-value">{Math.round(weather.temp_min)}°C / {Math.round(weather.temp_max)}°C</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">Humidity:</span>
          <span className="detail-value">{weather.humidity}%</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">Wind:</span>
          <span className="detail-value">{weather.windSpeed} m/s</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">Sunrise:</span>
          <span className="detail-value">{formatTime(weather.sunrise)}</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">Sunset:</span>
          <span className="detail-value">{formatTime(weather.sunset)}</span>
        </div>
      </div>
      
      <div className="weather-updated">
        Last updated: {new Date(weather.lastUpdated).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default WeatherDisplay;
