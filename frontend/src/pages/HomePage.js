import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../utils/AppContext';
import { triggerShadeCommanderScene, checkShadeCommanderHealth } from '../utils/api';
import AnimatedWeatherIcon from '../components/AnimatedWeatherIcon';

function HomePage() {
  const { weather, scheduler, actions } = useAppContext();
  const [showWakeUpModal, setShowWakeUpModal] = useState(false);
  const [wakeUpTime, setWakeUpTime] = useState('07:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [arduinoError, setArduinoError] = useState(null);
  const [lastManualScene, setLastManualScene] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(null);
  
  // Clear manual override when scheduled scene time is reached
  React.useEffect(() => {
    if (lastManualScene && scheduler.config?.nextSceneTimes) {
      // Inline scheduled scene calculation to avoid function dependency issues
      const sceneTimes = scheduler.config.nextSceneTimes;
      const timezoneInfo = scheduler.wakeUpStatus?.timezone || 'America/Denver (Mountain Time)';
      const timezone = timezoneInfo.split(' ')[0];
      
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', { 
        timeZone: timezone,
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });

      const convertTo24Hour = (timeStr) => {
        if (!timeStr) return null;
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':');
        let hour24 = parseInt(hours);
        
        if (period === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (period === 'AM' && hour24 === 12) {
          hour24 = 0;
        }
        
        return `${hour24.toString().padStart(2, '0')}:${minutes}`;
      };

      const goodAfternoon24 = convertTo24Hour(sceneTimes.good_afternoon);
      const goodEvening24 = convertTo24Hour(sceneTimes.good_evening);
      const goodNight24 = convertTo24Hour(sceneTimes.good_night);

      let scheduledSceneName;
      if (goodNight24 && currentTime >= goodNight24) {
        scheduledSceneName = 'good_night';
      } else if (goodEvening24 && currentTime >= goodEvening24) {
        scheduledSceneName = 'good_evening';
      } else if (goodAfternoon24 && currentTime >= goodAfternoon24) {
        scheduledSceneName = 'good_afternoon';
      } else {
        scheduledSceneName = 'good_morning';
      }
      
      // If the scheduled scene is different from manual override, clear it
      if (scheduledSceneName !== lastManualScene) {
        console.log(`Scheduled scene "${scheduledSceneName}" triggered, clearing manual override "${lastManualScene}"`);
        setLastManualScene(null);
      }
    }
  }, [scheduler.config?.nextSceneTimes, scheduler.wakeUpStatus?.timezone, lastManualScene]);
  
  // Helper functions for shade status display
  
  // Scene display mapping for all scenes
  const getSceneDisplay = (sceneName) => {
    const sceneMap = {
      'rise_n_shine': { name: "Rise'n'Shine", icon: '⏰', message: 'Wake up sequence started' },
      'good_morning': { name: 'Good Morning', icon: '🌅', message: 'Good morning sunshine!' },
      'good_afternoon': { name: 'Good Afternoon', icon: '☀️', message: 'Solar shades lowered to block afternoon sun' },
      'good_evening': { name: 'Good Evening', icon: '🌇', message: 'Solar shades raised to show sunset' },
      'good_night': { name: 'Good Night', icon: '🌙', message: 'Privacy shades lowered for the night' }
    };
    
    return sceneMap[sceneName] || { name: 'Unknown Scene', icon: '❓', message: 'Scene status unknown' };
  };

  // Get scheduled scene based on time and scheduler data
  const getScheduledScene = () => {
    // Use scheduled times if available
    if (scheduler.config?.nextSceneTimes) {
      const sceneTimes = scheduler.config.nextSceneTimes;
      
      // Get current time in user's timezone
      const timezoneInfo = scheduler.wakeUpStatus?.timezone || 'America/Denver (Mountain Time)';
      const timezone = timezoneInfo.split(' ')[0];
      
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', { 
        timeZone: timezone,
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });

      // Helper function to convert "1:30 PM" to "13:30" for comparison
      const convertTo24Hour = (timeStr) => {
        if (!timeStr) return null;
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':');
        let hour24 = parseInt(hours);
        
        if (period === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (period === 'AM' && hour24 === 12) {
          hour24 = 0;
        }
        
        return `${hour24.toString().padStart(2, '0')}:${minutes}`;
      };

      const goodAfternoon24 = convertTo24Hour(sceneTimes.good_afternoon);
      const goodEvening24 = convertTo24Hour(sceneTimes.good_evening);
      const goodNight24 = convertTo24Hour(sceneTimes.good_night);

      // DEBUG: Log the times for troubleshooting
      console.log('=== SHADE SCENE DEBUG ===');
      console.log('Current time (MT):', currentTime);
      console.log('Scene times (raw):', sceneTimes);
      console.log('Scene times (24hr):', {
        goodAfternoon24,
        goodEvening24,
        goodNight24
      });

      // Compare with current time to determine active scene
      // Handle day rollover: if it's between midnight and 6 AM and we had a good_night time yesterday
      const currentHour = parseInt(currentTime.split(':')[0]);
      const isNightTime = currentHour >= 0 && currentHour < 6;
      
      if (goodNight24 && currentTime >= goodNight24) {
        console.log('✓ Showing Good Night (currentTime >= goodNight24)');
        return getSceneDisplay('good_night');
      } else if (goodNight24 && isNightTime) {
        // If it's between midnight and 6 AM and we have a good_night time, we're still in good_night period
        console.log('✓ Showing Good Night (after midnight, still night time until 6 AM)');
        return getSceneDisplay('good_night');
      } else if (goodEvening24 && currentTime >= goodEvening24) {
        console.log('✓ Showing Good Evening (currentTime >= goodEvening24)');
        return getSceneDisplay('good_evening');
      } else if (goodAfternoon24 && currentTime >= goodAfternoon24) {
        console.log('✓ Showing Good Afternoon (currentTime >= goodAfternoon24)');
        return getSceneDisplay('good_afternoon');
      } else {
        console.log('✓ Showing Good Morning (fallback)');
        return getSceneDisplay('good_morning');
      }
    }

    // Fall back to basic time-based logic using configured timezone
    const timezoneInfo = scheduler.wakeUpStatus?.timezone || 'America/Denver (Mountain Time)';
    const timezone = timezoneInfo.split(' ')[0];
    
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      timeZone: timezone,
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
    
    const hour = parseInt(currentTime.split(':')[0]);
    
    if (hour >= 5 && hour < 10) return getSceneDisplay('good_morning');
    if (hour >= 10 && hour < 16) return getSceneDisplay('good_afternoon');
    if (hour >= 16 && hour < 21) return getSceneDisplay('good_evening');
    return getSceneDisplay('good_night');
  };

  // Determine current scene - prioritize manual button press over scheduled logic
  const getCurrentScene = () => {
    // If user manually pressed a button, show that
    if (lastManualScene) {
      return getSceneDisplay(lastManualScene);
    }
    // Otherwise show scheduled scene
    return getScheduledScene();
  };
  
  // Get the user-friendly text for the current scene
  const getCurrentSceneText = () => {
    const scene = getCurrentScene();
    return scene.name;
  };
  
  // Get the description for the current scene
  const getCurrentSceneDescription = () => {
    const scene = getCurrentScene();
    return scene.message;
  };
  
  // Get the icon for the current scene
  const getTimeBasedIcon = () => {
    const scene = getCurrentScene();
    const iconMap = {
      '⏰': { bg: 'bg-green-100', text: 'text-green-600' },
      '🌅': { bg: 'bg-yellow-100', text: 'text-yellow-600' },
      '☀️': { bg: 'bg-blue-100', text: 'text-blue-600' },
      '🌇': { bg: 'bg-orange-100', text: 'text-orange-600' },
      '🌙': { bg: 'bg-indigo-100', text: 'text-indigo-600' },
      '❓': { bg: 'bg-gray-100', text: 'text-gray-600' }
    };
    
    const iconStyle = iconMap[scene.icon] || { bg: 'bg-gray-100', text: 'text-gray-600' };
    
    return (
      <div className={`flex items-center justify-center h-12 w-12 rounded-full ${iconStyle.bg} ${iconStyle.text} text-xl`}>
        {scene.icon}
      </div>
    );
  };

  // Enhanced weather refresh with cooldown protection  
  const handleWeatherRefresh = async () => {
    try {
      setIsRefreshing(true);
      setRefreshSuccess(null);
      
      // Check if refresh is allowed (respects cooldown and daily limits)
      const canRefreshResponse = await fetch('http://192.168.10.15:3001/api/weather/can-refresh');
      const canRefreshData = await canRefreshResponse.json();
      
      if (!canRefreshData.data.allowed) {
        const reason = canRefreshData.data.reason;
        if (reason === 'daily_limit') {
          setRefreshSuccess('error');
          alert('⚠️ Daily API limit approaching (900+ calls). Manual refresh disabled to prevent charges.');
          return;
        } else if (reason === 'cooldown') {
          setRefreshSuccess('cooldown');
          setTimeout(() => setRefreshSuccess(null), 3000);
          return;
        }
      }
      
      // Perform the refresh
      await actions.refreshWeather(true);
      
      // Show success feedback
      setRefreshSuccess('success');
      setTimeout(() => setRefreshSuccess(null), 3000);
      
    } catch (error) {
      console.error('Weather refresh failed:', error);
      setRefreshSuccess('error');
      setTimeout(() => setRefreshSuccess(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle scene triggers via ShadeCommander and track locally
  const triggerScene = async (sceneName) => {
    try {
      setArduinoError(null); // Clear any existing errors
      console.log(`Triggering scene: ${sceneName}`);
      
      // Execute scene via ShadeCommander
      const response = await triggerShadeCommanderScene(sceneName);
      console.log(`Scene ${sceneName} executed successfully!`, response);
      
      // Track what button was pressed for display
      setLastManualScene(sceneName);
      
    } catch (error) {
      console.error(`Scene ${sceneName} failed:`, error);
      
      // Check if it's an Arduino issue
      try {
        const health = await checkShadeCommanderHealth();
        if (!health.arduino_connected) {
          setArduinoError("Arduino disconnected - check USB connection and/or reconnect in Settings.");
        } else {
          setArduinoError("Command failed - please try again");
        }
      } catch (healthError) {
        setArduinoError("ShadeCommander unavailable - please check connection");
      }
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

  // Get weather description
  const getWeatherDescription = () => {
    if (weather.loading || !weather.current) {
      return 'Loading...';
    }
    return weather.current.weather?.description || 'Unknown';
  };

  const description = getWeatherDescription();

  return (
    <div className="container mx-auto p-4">
      
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
              onClick={handleWeatherRefresh}
              className={`transition-colors ${
                refreshSuccess === 'success' ? 'text-green-600' :
                refreshSuccess === 'error' ? 'text-red-600' :
                refreshSuccess === 'cooldown' ? 'text-yellow-600' :
                isRefreshing ? 'text-gray-400' :
                'text-blue-500 hover:text-blue-700'
              }`}
              disabled={isRefreshing || refreshSuccess === 'cooldown'}
            >
              {isRefreshing ? '↻ Refreshing...' :
               refreshSuccess === 'success' ? '✅ Success!' :
               refreshSuccess === 'error' ? '❌ Failed' :
               refreshSuccess === 'cooldown' ? '⏳ Cooldown' :
               '↺ Refresh'}
            </button>
          </div>
          
          <p className="text-md mb-2">
            {weather.current?.location?.name || 'Silverthorne'}, 
            {weather.current?.location?.country || 'CO'}
          </p>
          
          <div className="flex items-center">
            <span className="px-1 text-5xl font-bold">
              {formatTemp(weather.current?.temperature?.current)}°F
            </span>
            <AnimatedWeatherIcon 
              iconCode={weather.current?.weather?.icon} 
              alt={description}
              className="h-20 w-20 ml-7"
            />
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
          
          {/* Arduino Error Display */}
          {arduinoError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {arduinoError}
            </div>
          )}
          
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
                onClick={() => triggerScene('good_morning')}
                className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 p-2 rounded"
              >
                Good Morning
              </button>
              <button 
                onClick={() => triggerScene('good_afternoon')}
                className="bg-blue-100 hover:bg-blue-200 text-blue-800 p-2 rounded"
              >
                Good Afternoon
              </button>
              <button 
                onClick={() => triggerScene('good_evening')}
                className="bg-orange-100 hover:bg-orange-200 text-orange-800 p-2 rounded"
              >
                Good Evening
              </button>
              <button 
                onClick={() => triggerScene('good_night')}
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
                <strong> {scheduler.config?.wake_up?.good_morning_delay_minutes || 15} minutes</strong> after this wake up call!
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