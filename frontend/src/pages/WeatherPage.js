import React, { useState, useEffect } from 'react';
import { useAppContext } from '../utils/AppContext';
import WeatherMap from '../components/WeatherMap';
import AnimatedWeatherIcon from '../components/AnimatedWeatherIcon';

function WeatherPage() {
  const { weather, actions } = useAppContext();
  // eslint-disable-next-line no-unused-vars
  const [activeTab, setActiveTab] = useState('current');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [usageStats, setUsageStats] = useState(null);
  const [refreshSuccess, setRefreshSuccess] = useState(null);
  
  // Load usage stats on component mount
  useEffect(() => {
    loadUsageStats();
  }, []);

  
  // Load weather API usage statistics
  const loadUsageStats = async () => {
    try {
      const response = await fetch('http://192.168.0.15:3001/api/weather/usage');
      if (response.ok) {
        const data = await response.json();
        setUsageStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };
  
  // Enhanced refresh with usage awareness and user feedback
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setRefreshSuccess(null);
      
      // Check if refresh is allowed (respects cooldown and daily limits)
      const canRefreshResponse = await fetch('http://192.168.0.15:3001/api/weather/can-refresh');
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
      
      // Reload usage stats after refresh
      await loadUsageStats();
      
    } catch (error) {
      console.error('Refresh failed:', error);
      setRefreshSuccess('error');
      setTimeout(() => setRefreshSuccess(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Get the background color based on temperature - optimized for Silverthorne mountain climate
  const getTemperatureColor = (temp) => {
    if (!temp) return 'bg-gray-200';
    
    if (temp < 5) return 'bg-purple-100 text-purple-800'; // Arctic 🥶
    if (temp < 15) return 'bg-indigo-100 text-indigo-800'; // Bitter cold
    if (temp < 25) return 'bg-blue-200 text-blue-900'; // Very cold
    if (temp < 32) return 'bg-blue-100 text-blue-800'; // Freezing
    if (temp < 45) return 'bg-blue-50 text-blue-600'; // Cold
    if (temp < 55) return 'bg-cyan-50 text-cyan-700'; // Chilly
    if (temp < 65) return 'bg-green-50 text-green-600'; // Cool
    if (temp < 75) return 'bg-green-100 text-green-800'; // Pleasant
    if (temp < 80) return 'bg-yellow-100 text-yellow-800'; // Warm
    if (temp < 85) return 'bg-orange-100 text-orange-800'; // Hot for mountains
    return 'bg-red-100 text-red-800'; // Extreme heat (rare!)
  };
  
  // Format temperature display
  const formatTemp = (temp) => {
    if (temp === null || temp === undefined) return '--';
    return Math.round(temp);
  };

  // Format date for display
  const formatDate = (dateStr, type = 'short') => {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    if (type === 'short') {
      return new Intl.DateTimeFormat('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }).format(date);
    }
    
    if (type === 'weekday') {
      return new Intl.DateTimeFormat('en-US', { 
        weekday: 'short'
      }).format(date);
    }
    
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    }).format(date);
  };
  
  // Format time for display
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', { 
      hour: 'numeric',
      hour12: true
    }).format(date);
  };
  
  // Convert wind degrees to compass direction
  const getWindDirectionData = (degrees) => {
    if (degrees === null || degrees === undefined) return { compass: '', arrow: '' };
    const directions = [
      { compass: 'N', arrow: '↑' },
      { compass: 'NE', arrow: '↗' },
      { compass: 'E', arrow: '→' },
      { compass: 'SE', arrow: '↘' },
      { compass: 'S', arrow: '↓' },
      { compass: 'SW', arrow: '↙' },
      { compass: 'W', arrow: '←' },
      { compass: 'NW', arrow: '↖' }
    ];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  };
  
  // Get weather description
  const getWeatherDescription = () => {
    if (weather.loading || !weather.current) {
      return 'Loading...';
    }
    return weather.current.weather?.description || 'Unknown';
  };

  const description = getWeatherDescription();
  
  // Get weather icon URL - using meteocons for forecasts
  const getWeatherIconUrl = (iconCode) => {
    if (!iconCode) return null;
    return `/images/meteocons/${iconCode}.svg`;
  };
  
  // Get current weather data
  const getCurrentWeather = () => {
    if (weather.loading || !weather.current) {
      return { location: { name: 'Loading...' }, temperature: {}, weather: {} };
    }
    return weather.current;
  };
  
  const currentWeather = getCurrentWeather();
  
  // Render the current weather section
  const renderCurrentWeather = () => {
    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Location and current conditions */}
          <div className="mb-4 md:mb-0 lg:col-span-3">
            <h2 className="text-2xl font-bold">
              {currentWeather.location?.name || 'Silverthorne'}, 
              {currentWeather.location?.country || 'US'}
            </h2>
            <p className="text-gray-600">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
            <div className="flex items-center mt-4">
              <span className="text-5xl font-bold">
                {formatTemp(currentWeather.temperature?.current)}°F
              </span>
              {currentWeather.weather?.icon && (
                <AnimatedWeatherIcon 
                  iconCode={currentWeather.weather.icon} 
                  alt={description}
                  className="h-28 w-28 ml-4"
                />
              )}
            </div>
            <p className="text-lg capitalize mt-1">{currentWeather.weather?.description || 'Loading...'}</p>
            <div className="mt-2">
              <span className="text-gray-700">Feels like: </span>
              <span className="font-semibold">{formatTemp(currentWeather.temperature?.feelsLike)}°F</span>
            </div>
          </div>
          
          {/* Daily Forecast - Middle Column */}
          <div className="flex flex-col h-full lg:col-span-5">
            <h3 className="text-lg font-semibold mb-3">Daily Forecast</h3>
            <div className="overflow-x-auto flex-1">
              <div className="inline-flex space-x-3 pb-2 h-full">
                {(() => {
                  if (!weather.forecast || !weather.forecast.days || weather.forecast.days.length === 0) {
                    return <p className="text-sm text-gray-500">Daily forecast not available</p>;
                  }
                  
                  const displayDays = generateEstimatedDays(weather.forecast.days, 8);
                  
                  return displayDays.map((day, index) => (
                    <div 
                      key={index}
                      className={`flex flex-col min-w-[95px] p-3 rounded-lg relative lg:h-full ${
                        index === 0 ? 'bg-blue-50' : 
                        day.isEstimated ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                      }`}
                    >
                      {day.isEstimated && (
                        <div className="absolute top-1 right-1">
                          <span className="text-xs text-yellow-600 font-semibold" title="Estimated based on seasonal averages">
                            ~
                          </span>
                        </div>
                      )}
                      <div className="flex flex-col items-center justify-between h-full">
                        <div className="flex flex-col items-center">
                          <p className="text-xs font-semibold text-center">{index === 0 ? 'Today' : day.dayOfWeek}</p>
                          <p className="text-xs text-gray-600">{formatDate(day.date, 'short')}</p>
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          <div className="flex justify-center items-center lg:h-16">
                            {day.icon && (
                              <img 
                                src={getWeatherIconUrl(day.icon)} 
                                alt={day.weatherMain} 
                                className={`w-16 h-16 ${day.isEstimated ? 'opacity-70' : ''}`}
                              />
                            )}
                          </div>
                          <div className="flex justify-center items-center lg:h-12 px-1">
                            <p className={`text-xs capitalize text-center leading-tight ${
                              day.isEstimated ? 'text-yellow-700' : 'text-gray-600'
                            }`}>
                              {day.weatherMain}
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-between items-end text-xs w-full">
                          <span className="font-semibold">{formatTemp(day.max)}°</span>
                          <span className="text-gray-500">{formatTemp(day.min)}°</span>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
          
          {/* Details */}
          <div className="bg-gray-50 rounded-lg p-4 lg:col-span-4">
            <h3 className="text-lg font-semibold mb-2">Details</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="text-gray-600">Humidity:</span>
                <span className="ml-2 font-medium">{currentWeather.humidity || '--'}%</span>
              </div>
              <div>
                <span className="text-gray-600">Wind:</span>
                <span className="ml-2 font-medium">{currentWeather.wind?.speed || '--'} mph</span>
              </div>
              <div>
                <span className="text-gray-600">Pressure:</span>
                <span className="ml-2 font-medium">{currentWeather.pressure || '--'} hPa</span>
              </div>
              <div>
                <span className="text-gray-600">Visibility:</span>
                <span className="ml-2 font-medium">
                  {currentWeather.visibility 
                    ? `${Math.round(currentWeather.visibility / 1609)} mi` 
                    : '--'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Sunrise:</span>
                <span className="ml-2 font-medium">
                  {currentWeather.sunrise 
                    ? formatTime(currentWeather.sunrise)
                    : weather.sunTimes?.sunriseTime || '--:--'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Sunset:</span>
                <span className="ml-2 font-medium">
                  {currentWeather.sunset 
                    ? formatTime(currentWeather.sunset)
                    : weather.sunTimes?.sunsetTime || '--:--'}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-600 mb-3">
                🌤️ Weather data via OpenWeatherMap One Call API 3.0
              </div>
              
              {/* Refresh Controls */}
              <div className="flex items-center justify-between gap-3">
                <button 
                  onClick={handleRefresh}
                  className={`inline-flex items-center text-sm font-medium transition-colors self-start ${
                    refreshSuccess === 'success' ? 'text-green-600' :
                    refreshSuccess === 'error' ? 'text-red-600' :
                    refreshSuccess === 'cooldown' ? 'text-yellow-600' :
                    isRefreshing ? 'text-gray-500' :
                    'text-blue-600 hover:text-blue-800'
                  }`}
                  disabled={isRefreshing || refreshSuccess === 'cooldown'}
                >
                  <svg className={`w-3 h-3 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  {isRefreshing ? 'Refreshing...' :
                   refreshSuccess === 'success' ? '✅ Updated!' :
                   refreshSuccess === 'error' ? '❌ Failed' :
                   refreshSuccess === 'cooldown' ? '⏳ Cooldown' :
                   'Refresh Data'}
                </button>
                
                <div className="text-xs text-gray-500 text-right">
                  <div>
                    API Requests:
                    {usageStats && (
                      <span className="ml-1">({usageStats.dailyCount}/{usageStats.dailyLimit})</span>
                    )}
                  </div>
                  {usageStats?.cacheAgeSeconds && (
                    <div>📱 Updated: {Math.round(usageStats.cacheAgeSeconds / 60)}m ago</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Render the hourly forecast section
  const renderHourlyForecast = () => {
    if (!weather.forecast || !weather.forecast.days || weather.forecast.days.length === 0) {
      return (
        <div className="text-center py-10">
          <p>Hourly forecast data not available</p>
        </div>
      );
    }
    
    // Use the flat hourly array if available (48 hours of data), otherwise fall back to days
    const allHourlyData = weather.forecast.allHourly || [];
    
    if (allHourlyData.length === 0) {
      return (
        <div className="text-center py-10">
          <p>No hourly forecast data available</p>
        </div>
      );
    }
    
    // Filter and add day labels to hourly data
    const now = new Date();
    const mountainToday = new Date(now.toLocaleString("en-US", {timeZone: "America/Denver"}));
    const mountainTomorrow = new Date(mountainToday);
    mountainTomorrow.setDate(mountainToday.getDate() + 1);
    
    const allHourlyEntries = allHourlyData
      .filter(hour => {
        const hourTime = new Date(hour.timestamp);
        // Only show future hours (or current hour)
        return hourTime >= now || hourTime.getTime() >= now.getTime() - 3600000; // Within last hour
      })
      .map(hour => {
        const hourTime = new Date(hour.timestamp);
        const hourMountainTime = new Date(hourTime.toLocaleString("en-US", {timeZone: "America/Denver"}));
        
        // Determine day label based on Mountain Time
        let dayLabel;
        if (hourMountainTime.toDateString() === mountainToday.toDateString()) {
          dayLabel = 'Today';
        } else if (hourMountainTime.toDateString() === mountainTomorrow.toDateString()) {
          dayLabel = 'Tomorrow';
        } else {
          dayLabel = hourMountainTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
        
        return {
          ...hour,
          dayLabel: dayLabel
        };
      });
    
    // Show actual 48 hours of data
    const displayEntries = allHourlyEntries.slice(0, 48);
    
    if (displayEntries.length === 0) {
      return (
        <div className="text-center py-10">
          <p>No upcoming hourly forecast data available</p>
        </div>
      );
    }
    
    // Group hours by day for better organization
    const hoursByDay = [];
    let currentDay = null;
    let currentDayHours = [];
    
    displayEntries.forEach((hour, index) => {
      const hourTime = new Date(hour.timestamp);
      const mountainTime = new Date(hourTime.toLocaleString("en-US", {timeZone: "America/Denver"}));
      const dayKey = mountainTime.toDateString();
      
      if (dayKey !== currentDay) {
        if (currentDayHours.length > 0) {
          hoursByDay.push({
            dayLabel: currentDayHours[0].dayLabel,
            hours: currentDayHours
          });
        }
        currentDay = dayKey;
        currentDayHours = [hour];
      } else {
        currentDayHours.push(hour);
      }
    });
    
    // Don't forget the last day
    if (currentDayHours.length > 0) {
      hoursByDay.push({
        dayLabel: currentDayHours[0].dayLabel,
        hours: currentDayHours
      });
    }

    return (
      <div className="bg-white rounded-lg shadow-md p-4 mt-6">
        <h3 className="text-xl font-semibold mb-4">48-Hour Forecast</h3>
        <div className="overflow-x-auto">
          <div>
            {/* Day labels row */}
            <div className="inline-flex pb-2 min-w-full">
              {displayEntries.map((hour, index) => {
                const hourTime = new Date(hour.timestamp);
                const mountainTime = new Date(hourTime.toLocaleString("en-US", {timeZone: "America/Denver"}));
                const prevMountainTime = index === 0 ? null : 
                  new Date(new Date(displayEntries[index - 1].timestamp).toLocaleString("en-US", {timeZone: "America/Denver"}));
                const isNewDay = index === 0 || 
                  (prevMountainTime && prevMountainTime.toDateString() !== mountainTime.toDateString());
                
                return (
                  <div key={index} className={`min-w-[100px] text-center ${index > 0 ? 'ml-4' : ''}`}>
                    {isNewDay ? (
                      <span className="text-sm font-semibold text-blue-600">
                        {hour.dayLabel}
                      </span>
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Hourly entries row */}
            <div className="inline-flex space-x-4 pb-4 min-w-full">
              {displayEntries.map((hour, index) => (
                <div key={index} className="flex flex-col items-center min-w-[100px]">
                  <p className="text-sm font-medium">{formatTime(hour.timestamp)}</p>
                  {hour.weather.icon && (
                    <img 
                      src={getWeatherIconUrl(hour.weather.icon)} 
                      alt={hour.weather.description} 
                      className="w-16 h-16 my-0.5"
                    />
                  )}
                  <p className={`text-lg font-bold rounded-full px-2 ${getTemperatureColor(hour.temperature)}`}>
                    {formatTemp(hour.temperature)}°F
                  </p>
                  <p className="py-1.5 text-xs text-gray-500 capitalize text-center">{hour.weather.description}</p>
                  <p className="text-xs text-gray-600 mt-0">
                    {hour.windSpeed !== undefined ? (
                      <>
                        {Math.round(hour.windSpeed)} {getWindDirectionData(hour.windDirection).compass}{' '}
                        <span className="text-lg" style={{ fontFamily: 'monospace' }}>
                          {getWindDirectionData(hour.windDirection).arrow}
                        </span>
                      </>
                    ) : '\u00A0'}
                  </p>
                  <p className="py-1.5 text-xs font-medium text-blue-600">
                    {hour.precipitationProbability > 0 ? `${hour.precipitationProbability}%` : '\u00A0'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Generate estimated days for extended forecast
  const generateEstimatedDays = (realDays, targetCount = 8) => {
    const extendedDays = [...realDays];
    
    if (realDays.length >= targetCount) {
      return extendedDays.slice(0, targetCount);
    }
    
    // Generate estimated days based on seasonal averages for remaining days
    const lastRealDay = realDays[realDays.length - 1];
    const lastDate = new Date(lastRealDay.date);
    
    for (let i = realDays.length; i < targetCount; i++) {
      const estimatedDate = new Date(lastDate);
      estimatedDate.setDate(estimatedDate.getDate() + (i - realDays.length + 1));
      
      // Use seasonal averages for May/June in Colorado
      const seasonalTemp = {
        min: 35 + Math.random() * 10, // 35-45°F range
        max: 65 + Math.random() * 15, // 65-80°F range
      };
      
      extendedDays.push({
        date: estimatedDate.toISOString().split('T')[0],
        dayOfWeek: estimatedDate.toLocaleDateString('en-US', { weekday: 'short' }),
        min: Math.round(seasonalTemp.min),
        max: Math.round(seasonalTemp.max),
        avg: Math.round((seasonalTemp.min + seasonalTemp.max) / 2),
        weatherMain: 'partly cloudy',
        icon: '02d', // Partly cloudy icon
        precipitationProbability: Math.round(20 + Math.random() * 30), // 20-50%
        isEstimated: true
      });
    }
    
    return extendedDays;
  };


  // Render precipitation map - now using our integrated WeatherMap component!
  const renderPrecipitationMap = () => {
    return <WeatherMap />;
  };

  // Render house temperatures section
  const renderHouseTemperatures = () => {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">House Temperatures</h3>
          <div className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
        
        {weather.temperatures ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-lg font-medium mb-2">Outdoor</h4>
              <p className="text-3xl font-bold">{formatTemp(weather.temperatures.outdoor)}°F</p>
              <p className="text-sm text-gray-600 mt-1">From Weather Service</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium mb-2">Main Floor</h4>
              <p className="text-3xl font-bold">{formatTemp(weather.temperatures.mainFloor)}°F</p>
              <p className="text-sm text-gray-600 mt-1">Govee Sensor</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium mb-2">Master Bedroom</h4>
              <p className="text-3xl font-bold">{formatTemp(weather.temperatures.masterBedroom)}°F</p>
              <p className="text-sm text-gray-600 mt-1">Govee Sensor</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium mb-2">Guest Bedroom</h4>
              <p className="text-3xl font-bold">{formatTemp(weather.temperatures.guestBedroom)}°F</p>
              <p className="text-sm text-gray-600 mt-1">Govee Sensor</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium mb-2">Garage</h4>
              <p className="text-3xl font-bold">{formatTemp(weather.temperatures.garage)}°F</p>
              <p className="text-sm text-gray-600 mt-1">Govee Sensor</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium mb-2">Humidor</h4>
              <p className="text-3xl font-bold">{formatTemp(weather.temperatures.humidor)}°F</p>
              <p className="text-sm text-gray-600 mt-1">Govee Sensor</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <p>Temperature data not available</p>
            <p className="text-sm text-gray-500 mt-2">Govee integration pending</p>
          </div>
        )}
        
        <div className="mt-4 text-center">
          <button 
            onClick={handleRefresh}
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Temperatures'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      
      {/* Error display */}
      {weather.error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>Could not load weather data. Please check your connection.</p>
        </div>
      )}
      
      {/* Current Weather */}
      {weather.loading ? (
        <div className="text-center py-10">
          <p className="text-xl">Loading weather data...</p>
        </div>
      ) : (
        <>
          {/* Current Weather */}
          {renderCurrentWeather()}
          
          {/* Hourly Forecast */}
          {renderHourlyForecast()}
          
          {/* Precipitation Map */}
          {renderPrecipitationMap()}
          
          {/* House Temperatures */}
          {renderHouseTemperatures()}
        </>
      )}
    </div>
  );
}

export default WeatherPage;