import React from 'react';
import { useAppContext } from '../utils/AppContext';

function Footer() {
  const { weather, music } = useAppContext();
  
  // Get the current temperature
  const getCurrentTemp = () => {
    if (weather.loading || !weather.current) {
      return null;
    }
    return Math.round(weather.current.temperature?.current);
  };
  
  // Get the current music status
  const getMusicStatus = () => {
    if (music.loading || !music.status) {
      return null;
    }
    
    if (!music.status.isPianobarRunning) {
      return null;
    }
    
    if (music.status.status === 'playing' && music.status.song) {
      return `Playing: ${music.status.song} - ${music.status.artist || ''}`;
    }
    
    return 'Music paused';
  };
  
  const currentTemp = getCurrentTemp();
  const musicStatus = getMusicStatus();

  return (
    <footer className="bg-gray-800 text-white p-4 shadow-inner">
      <div className="container mx-auto flex flex-col md:flex-row justify-between items-center text-sm">
        <div className="mb-2 md:mb-0">
          {currentTemp !== null && (
            <span className="mr-4">🌡️ {currentTemp}°F</span>
          )}
          {musicStatus && (
            <span className="mr-4">🎵 {musicStatus}</span>
          )}
        </div>
        <p>Monty Home Automation &copy; {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}

export default Footer;
