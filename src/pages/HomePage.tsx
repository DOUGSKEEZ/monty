import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WeatherDisplay from '../components/WeatherDisplay';
import { Room } from '../models/Room';
import { Weather } from '../models/Weather';
import { fetchRooms } from '../api/roomsApi';
import { fetchCurrentWeather } from '../api/weatherApi';
import './HomePage.css';

const HomePage: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch rooms and weather data in parallel
        const [roomsData, weatherData] = await Promise.all([
          fetchRooms(),
          fetchCurrentWeather()
        ]);

        setRooms(roomsData);
        setWeather(weatherData);
      } catch (err) {
        setError('Failed to load data. Please try again later.');
        console.error('Error loading home data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    // Refresh weather data every 15 minutes
    const weatherInterval = setInterval(async () => {
      try {
        const weatherData = await fetchCurrentWeather();
        setWeather(weatherData);
      } catch (err) {
        console.error('Error refreshing weather data:', err);
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(weatherInterval);
  }, []);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="home-page">
      <h1>Smart Home Dashboard</h1>
      
      <div className="home-grid">
        <div className="home-section">
          <h2>Weather</h2>
          <WeatherDisplay 
            weather={weather} 
            isLoading={isLoading} 
            error={error} 
          />
          <div className="section-footer">
            <Link to="/weather" className="btn btn-secondary">Weather Details</Link>
          </div>
        </div>
        
        <div className="home-section">
          <h2>Rooms</h2>
          <div className="rooms-grid">
            {rooms.map(room => (
              <div key={room.id} className="room-card card">
                <h3>{room.name}</h3>
                <p>Floor: {room.floor}</p>
                {room.hasShades && (
                  <Link 
                    to={`/shades?room=${room.id}`} 
                    className="btn btn-primary"
                  >
                    Control Shades
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
