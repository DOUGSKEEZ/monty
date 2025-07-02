import React from 'react';
import { useAppContext } from '../utils/AppContext';

function Footer() {
  const { weather } = useAppContext();
  
  // Get the current temperature
  const getCurrentTemp = () => {
    if (weather.loading || !weather.current) {
      return null;
    }
    return Math.round(weather.current.temperature?.current);
  };
  
  const currentTemp = getCurrentTemp();

  return (
    <footer className="bg-gray-800 text-white p-4 shadow-inner">
      <div className="container mx-auto flex flex-col md:flex-row justify-between items-center text-medium">
        <div className="mb-2 md:mb-0">
          {currentTemp !== null && (
            <span className="mr-4">🌡️ {currentTemp}°F</span>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <p>Monty Home Automation &copy; {new Date().getFullYear()}</p>
          <img 
            src="/images/Monty.png" 
            alt="Monty" 
            className="w-10 h-10 opacity-75 hover:opacity-100 transition-opacity duration-300"
            title="Monty, your home automation butler"
          />
        </div>
      </div>
    </footer>
  );
}

export default Footer;
