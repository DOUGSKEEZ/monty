import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../utils/AppContext';

function HomePage() {
  const { weather, scheduler, actions } = useAppContext();
  const [showWakeUpModal, setShowWakeUpModal] = useState(false);
  const [wakeUpTime, setWakeUpTime] = useState('07:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Helper functions for shade status display
  
  // Determine current scene based on time of day
  const getCurrentScene = () => {
    const now = new Date();
    const hour = now.getHours();
    
    // Early morning (5am - 10am): Good Morning
    if (hour >= 5 && hour < 10) {
      return 'good-morning';
    }
    
    // Mid-day (10am - 4pm): Good Afternoon
    if (hour >= 10 && hour < 16) {
      return 'good-afternoon';
    }
    
    // Evening (4pm - 9pm): Good Evening
    if (hour >= 16 && hour < 21) {
      return 'good-evening';
    }
    
    // Night (9pm - 5am): Good Night
    return 'good-night';
  };
  
  // Get the user-friendly text for the current scene
  const getCurrentSceneText = () => {
    const scene = getCurrentScene();
    
    switch (scene) {
      case 'good-morning':
        return 'Good Morning Mode';
      case 'good-afternoon':
        return 'Good Afternoon Mode';
      case 'good-evening':
        return 'Good Evening Mode';
      case 'good-night':
        return 'Good Night Mode';
      default:
        return 'Unknown Mode';
    }
  };
  
  // Get the description for the current scene
  const getCurrentSceneDescription = () => {
    const scene = getCurrentScene();
    
    switch (scene) {
      case 'good-morning':
        return 'Privacy and blackout shades are raised';
      case 'good-afternoon':
        return 'Solar shades are lowered to block sun';
      case 'good-evening':
        return 'Solar shades are raised to show sunset';
      case 'good-night':
        return 'Privacy and blackout shades are lowered';
      default:
        return '';
    }
  };
  
  // Get the icon for the current scene
  const getTimeBasedIcon = () => {
    const scene = getCurrentScene();
    
    switch (scene) {
      case 'good-morning':
        return (
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 text-yellow-600 text-xl">
            🌅
          </div>
        );
      case 'good-afternoon':
        return (
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 text-blue-600 text-xl">
            ☀️
          </div>
        );
      case 'good-evening':
        return (
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 text-orange-600 text-xl">
            🌇
          </div>
        );
      case 'good-night':
        return (
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 text-xl">
            🌙
          </div>
        );
      default:
        return null;
    }
  };
  
  // Format temperature display
  const formatTemp = (temp) => {
    if (temp === null || temp === undefined) return '--';
    return Math.round(temp);
  };

  // Format sunrise/sunset times
  const formatSunTime = (timestamp) => {
    if (!timestamp) return '--:--';
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Get wake-up display information
  const getWakeUpDisplay = () => {
    if (scheduler.loading || !scheduler.wakeUpStatus) {
      return {
        isSet: false,
        displayText: 'Loading...',
        timeUntil: null
      };
    }
    
    const wakeUpData = scheduler.wakeUpStatus;
    
    if (!wakeUpData.enabled || !wakeUpData.nextWakeUpDateTime) {
      return {
        isSet: false,
        displayText: 'Not Set',
        timeUntil: null
      };
    }
    
    // Parse the display format: "Fri, May 30, 08:15 AM"
    const fullDateTime = wakeUpData.nextWakeUpDateTime;
    
    // Extract time and date parts
    const timeMatch = fullDateTime.match(/(\d{1,2}:\d{2} [AP]M)$/);
    const dateMatch = fullDateTime.match(/^(.+?), (\d{1,2}:\d{2} [AP]M)$/);
    
    if (!timeMatch || !dateMatch) {
      return {
        isSet: true,
        displayText: fullDateTime,
        timeUntil: null
      };
    }
    
    const timeOnly = timeMatch[1]; // "08:15 AM"
    const dateOnly = dateMatch[1]; // "Fri, May 30"
    
    // Calculate time until wake up
    const calculateTimeUntil = () => {
      try {
        // Get current time in Mountain Time
        const now = new Date();
        const currentMT = now.toLocaleString("en-US", { timeZone: "America/Denver" });
        const currentTime = new Date(currentMT);
        
        // Parse the wake up time - convert "Fri, May 30, 08:15 AM" to a Date
        // We need to construct a proper date string
        const currentYear = new Date().getFullYear();
        const wakeUpDateStr = `${dateOnly}, ${currentYear} ${timeOnly}`;
        const wakeUpTime = new Date(wakeUpDateStr);
        
        // If wake up time is in the past (same day), it's for tomorrow
        if (wakeUpTime <= currentTime) {
          wakeUpTime.setDate(wakeUpTime.getDate() + 1);
        }
        
        const diff = wakeUpTime - currentTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours === 0) {
          return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else if (minutes === 0) {
          return `${hours} hour${hours !== 1 ? 's' : ''}`;
        } else {
          return `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
      } catch (error) {
        console.error('Error calculating time until wake up:', error);
        return null;
      }
    };
    
    return {
      isSet: true,
      timeOnly: timeOnly,
      dateOnly: dateOnly,
      fullDateTime: fullDateTime,
      timeUntil: calculateTimeUntil()
    };
  };

  // Handle wake-up time setting
  const handleSetWakeUpTime = async () => {
    setIsSubmitting(true);
    
    try {
      const success = await actions.setWakeUpTime(wakeUpTime);
      
      if (success) {
        // Close modal and refresh scheduler data
        setShowWakeUpModal(false);
        await actions.refreshScheduler();
      } else {
        alert('Failed to set wake-up time. Please try again.');
      }
    } catch (error) {
      console.error('Error setting wake-up time:', error);
      alert('Failed to set wake-up time. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get weather description and icon
  const getWeatherInfo = () => {
    if (weather.loading || !weather.current) {
      return { description: 'Loading...', icon: null };
    }
    
    const weatherData = weather.current;
    let iconUrl = null;
    
    if (weatherData.weather?.icon) {
      iconUrl = `https://openweathermap.org/img/wn/${weatherData.weather.icon}@2x.png`;
    }
    
    return { 
      description: weatherData.weather?.description || 'Unknown',
      icon: iconUrl
    };
  };

  const { description, icon } = getWeatherInfo();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Welcome to Monty</h1>
      
      {/* Error alerts */}
      {weather.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Weather data could not be loaded. Please check your connection.
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Weather Widget */}
        <div className="bg-white p-4 rounded shadow">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Weather</h2>
            <button 
              onClick={() => actions.refreshWeather(true)}
              className="text-blue-500 hover:text-blue-700"
            >
              ↺ Refresh
            </button>
          </div>
          
          <p className="text-md mb-2">
            {weather.current?.location?.name || 'Silverthorne'}, 
            {weather.current?.location?.country || 'CO'}
          </p>
          
          <div className="flex items-center">
            <span className="text-4xl font-bold">
              {formatTemp(weather.current?.temperature?.current)}°F
            </span>
            {icon && <img src={icon} alt={description} className="h-16 w-16" />}
          </div>
          
          <p className="capitalize">{description}</p>
          
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <div>
              <span className="font-semibold">Feels like:</span> {formatTemp(weather.current?.temperature?.feelsLike)}°F
            </div>
            <div>
              <span className="font-semibold">Humidity:</span> {weather.current?.humidity || '--'}%
            </div>
          </div>
          
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <div>
              <span className="font-semibold">Sunrise:</span> {formatSunTime(weather.sunTimes?.sunrise)}
            </div>
            <div>
              <span className="font-semibold">Sunset:</span> {formatSunTime(weather.sunTimes?.sunset)}
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <h3 className="font-semibold mb-2">House Temperatures</h3>
            {weather.temperatures ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Main Floor: {formatTemp(weather.temperatures.mainFloor)}°F</div>
                <div>Bedroom: {formatTemp(weather.temperatures.masterBedroom)}°F</div>
                <div>Garage: {formatTemp(weather.temperatures.garage)}°F</div>
                <div>Guest Room: {formatTemp(weather.temperatures.guestBedroom)}°F</div>
              </div>
            ) : (
              <p>No temperature data available</p>
            )}
          </div>
          
          <div className="mt-4 text-center">
            <Link 
              to="/weather"
              className="inline-block text-blue-500 hover:text-blue-700 hover:underline"
            >
              See detailed forecast →
            </Link>
          </div>
        </div>
        
        {/* Shade Status Widget */}
        <div className="bg-white p-4 rounded shadow">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold">Shade Status</h2>
            <div className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
          
          {/* Current Shade Automation State */}
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="flex items-center">
              {/* Icon based on time of day */}
              {getTimeBasedIcon()}
              <div className="ml-4">
                <h3 className="text-lg font-semibold">{getCurrentSceneText()}</h3>
                <p className="text-sm text-gray-600">{getCurrentSceneDescription()}</p>
              </div>
            </div>
          </div>
          
          {/* Manual Override Section */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-md font-medium mb-2">Manual Override</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button 
                onClick={() => actions.triggerShadeScene('good-morning')} 
                className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 p-2 rounded"
              >
                Good Morning
              </button>
              <button 
                onClick={() => actions.triggerShadeScene('good-afternoon')} 
                className="bg-blue-100 hover:bg-blue-200 text-blue-800 p-2 rounded"
              >
                Good Afternoon
              </button>
              <button 
                onClick={() => actions.triggerShadeScene('good-evening')} 
                className="bg-orange-100 hover:bg-orange-200 text-orange-800 p-2 rounded"
              >
                Good Evening
              </button>
              <button 
                onClick={() => actions.triggerShadeScene('good-night')} 
                className="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 p-2 rounded"
              >
                Good Night
              </button>
            </div>
          </div>
          
          <div className="mt-4">
            <Link to="/shades" className="w-full block text-center bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
              Detailed Shade Control
            </Link>
          </div>
        </div>
        
        {/* Wake Up Widget */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Wake Up Alarm</h2>
          
          <div className="mb-4">
            <p className="text-sm mb-2">Tomorrow's Wake Up:</p>
            
            {(() => {
              const wakeUpInfo = getWakeUpDisplay();
              
              if (!wakeUpInfo.isSet) {
                return (
                  <p className="text-xl font-bold text-gray-500">{wakeUpInfo.displayText}</p>
                );
              }
              
              return (
                <div className="space-y-2">
                  {/* Prominent time display */}
                  <div className="text-3xl font-bold text-green-600">
                    {wakeUpInfo.timeOnly}
                  </div>
                  
                  {/* Less prominent date */}
                  <div className="text-lg text-gray-600">
                    {wakeUpInfo.dateOnly}
                  </div>
                  
                  {/* Time until wake up */}
                  {wakeUpInfo.timeUntil && (
                    <div className="text-sm text-gray-500 italic">
                      (Alarm set for {wakeUpInfo.timeUntil} from now)
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          
          <div className="text-sm text-gray-600 mb-4">
            <p className="mb-2">The wake-up alarm will:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Raise bedroom blackout shades</li>
              <li>
                Monty's Prospect will open to the world 
                <strong> 15 minutes</strong> after this wake up call!
              </li>
            </ul>
          </div>
          
          <button 
            onClick={() => setShowWakeUpModal(true)} 
            className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
          >
            Set Wake Up Time
          </button>
        </div>
      </div>
      
      {/* Wake Up Time Modal */}
      {showWakeUpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-xl font-bold mb-4">Set Wake Up Time</h3>
            
            <p className="mb-4 text-sm text-gray-600">
              Select the time for tomorrow's wake-up alarm.
              This will trigger the Rise and Shine scene at that time.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Time (24-hour format)</label>
              <input 
                type="time" 
                value={wakeUpTime} 
                onChange={(e) => setWakeUpTime(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowWakeUpModal(false)} 
                className="px-4 py-2 border rounded hover:bg-gray-100"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={handleSetWakeUpTime} 
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Setting...' : 'Set Wake Up Time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;