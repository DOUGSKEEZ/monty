import React, { useState } from 'react';
import { useAppContext } from '../utils/AppContext';

function WeatherPage() {
  const { weather, actions } = useAppContext();
  // eslint-disable-next-line no-unused-vars
  const [activeTab, setActiveTab] = useState('current');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Refresh weather data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await actions.refreshWeather(true);
    setIsRefreshing(false);
  };
  
  // Get the background color based on temperature
  const getTemperatureColor = (temp) => {
    if (!temp) return 'bg-gray-200';
    
    if (temp < 32) return 'bg-blue-100 text-blue-800'; // Freezing
    if (temp < 45) return 'bg-blue-50 text-blue-600'; // Cold
    if (temp < 60) return 'bg-green-50 text-green-600'; // Cool
    if (temp < 75) return 'bg-green-100 text-green-800'; // Mild
    if (temp < 85) return 'bg-yellow-100 text-yellow-800'; // Warm
    if (temp < 95) return 'bg-orange-100 text-orange-800'; // Hot
    return 'bg-red-100 text-red-800'; // Very hot
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
      minute: '2-digit',
      hour12: true
    }).format(date);
  };
  
  // Get weather icon URL
  const getWeatherIconUrl = (iconCode) => {
    if (!iconCode) return null;
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
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
        <div className="p-4 flex flex-col md:flex-row justify-between">
          {/* Location and current conditions */}
          <div className="mb-4 md:mb-0">
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
                <img 
                  src={getWeatherIconUrl(currentWeather.weather.icon)} 
                  alt={currentWeather.weather.description || 'Weather icon'} 
                  className="w-20 h-20"
                />
              )}
            </div>
            <p className="text-lg capitalize mt-1">{currentWeather.weather?.description || 'Loading...'}</p>
            <div className="mt-2">
              <span className="text-gray-700">Feels like: </span>
              <span className="font-semibold">{formatTemp(currentWeather.temperature?.feelsLike)}°F</span>
            </div>
          </div>
          
          {/* Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
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
    
    // Get today's hourly forecast
    const today = weather.forecast.days[0];
    if (!today.hourly || today.hourly.length === 0) {
      return (
        <div className="text-center py-10">
          <p>Hourly forecast data not available for today</p>
        </div>
      );
    }
    
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mt-6">
        <h3 className="text-xl font-semibold mb-4">Hourly Forecast</h3>
        <div className="overflow-x-auto">
          <div className="inline-flex space-x-4 pb-4 min-w-full">
            {today.hourly.map((hour, index) => (
              <div 
                key={index} 
                className="flex flex-col items-center min-w-[100px]"
              >
                <p className="text-sm font-medium">{formatTime(hour.timestamp)}</p>
                {hour.weather.icon && (
                  <img 
                    src={getWeatherIconUrl(hour.weather.icon)} 
                    alt={hour.weather.description} 
                    className="w-12 h-12 my-1"
                  />
                )}
                <p className={`text-lg font-bold rounded-full px-2 ${getTemperatureColor(hour.temperature)}`}>
                  {formatTemp(hour.temperature)}°F
                </p>
                <p className="text-xs text-gray-500 capitalize">{hour.weather.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  
  // Render the daily forecast section
  const renderDailyForecast = () => {
    if (!weather.forecast || !weather.forecast.days || weather.forecast.days.length === 0) {
      return (
        <div className="text-center py-10">
          <p>Daily forecast data not available</p>
        </div>
      );
    }
    
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mt-6">
        <h3 className="text-xl font-semibold mb-4">8-Day Forecast</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
          {weather.forecast.days.map((day, index) => (
            <div 
              key={index}
              className={`text-center p-3 rounded-lg ${index === 0 ? 'bg-blue-50' : 'bg-gray-50'}`}
            >
              <p className="font-semibold">{index === 0 ? 'Today' : day.dayOfWeek}</p>
              <p className="text-xs text-gray-600">{formatDate(day.date)}</p>
              {day.icon && (
                <img 
                  src={getWeatherIconUrl(day.icon)} 
                  alt={day.weatherMain} 
                  className="w-12 h-12 mx-auto my-2"
                />
              )}
              <p className="text-xs text-gray-600 capitalize mb-1">{day.weatherMain}</p>
              <div className="flex justify-around text-sm">
                <span className="font-semibold">{formatTemp(day.max)}°</span>
                <span className="text-gray-500">{formatTemp(day.min)}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render precipitation map
  const renderPrecipitationMap = () => {
    // In a real implementation, we would use OpenWeatherMap's map layers API
    // For this demo, we'll use their embedded map
    const mapUrl = "https://openweathermap.org/weathermap?basemap=map&cities=true&layer=precipitation&lat=39.63&lon=-106.07&zoom=10";
    
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mt-6">
        <h3 className="text-xl font-semibold mb-4">Precipitation Map</h3>
        <div className="border rounded overflow-hidden" style={{ height: '400px' }}>
          <iframe 
            title="Weather Map"
            src={mapUrl}
            width="100%"
            height="100%"
            frameBorder="0"
            allowFullScreen
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Powered by OpenWeatherMap
        </p>
      </div>
    );
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Weather & Temperature</h1>
        <button 
          onClick={handleRefresh}
          className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded flex items-center"
          disabled={isRefreshing}
        >
          <svg className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      
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
          
          {/* Daily Forecast */}
          {renderDailyForecast()}
          
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