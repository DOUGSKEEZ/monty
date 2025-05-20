import React, { createContext, useContext, useState, useEffect } from 'react';
import { weatherApi, shadesApi, schedulerApi, musicApi } from './api';

// Create context
const AppContext = createContext();

// Custom hook for using the context
export const useAppContext = () => useContext(AppContext);

// Provider component
export const AppProvider = ({ children }) => {
  // Weather state
  const [weather, setWeather] = useState({
    current: null,
    forecast: null,
    sunTimes: null,
    temperatures: null,
    loading: true,
    error: null,
  });

  // Shade state
  const [shades, setShades] = useState({
    config: null,
    loading: true,
    error: null,
  });

  // Scheduler state
  const [scheduler, setScheduler] = useState({
    schedules: {},
    loading: true,
    error: null,
  });

  // Music state
  const [music, setMusic] = useState({
    status: null,
    stations: [],
    loading: true,
    error: null,
  });

  // Load initial data
  useEffect(() => {
    loadWeatherData();
    loadShadeData();
    loadSchedulerData();
    loadMusicData();
    
    // Set up interval to refresh data periodically
    const refreshInterval = setInterval(() => {
      loadWeatherData(false);
      loadMusicData(false);
    }, 60000); // Refresh every minute
    
    return () => clearInterval(refreshInterval);
  }, []);

  // Load weather data
  const loadWeatherData = async (showLoading = true) => {
    if (showLoading) {
      setWeather(prev => ({ ...prev, loading: true, error: null }));
    }
    
    try {
      // Load all weather data in parallel
      const [currentRes, forecastRes, sunTimesRes, temperaturesRes] = await Promise.all([
        weatherApi.getCurrent(),
        weatherApi.getForecast(),
        weatherApi.getSunTimes(),
        weatherApi.getTemperatures(),
      ]);
      
      setWeather({
        current: currentRes.data,
        forecast: forecastRes.data,
        sunTimes: sunTimesRes.data,
        temperatures: temperaturesRes.data,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading weather data:', error);
      setWeather(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load weather data',
      }));
    }
  };

  // Load shade data
  const loadShadeData = async () => {
    setShades(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const configRes = await shadesApi.getConfig();
      
      setShades({
        config: configRes.data,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading shade data:', error);
      setShades(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load shade data',
      }));
    }
  };

  // Load scheduler data
  const loadSchedulerData = async () => {
    setScheduler(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const schedulesRes = await schedulerApi.getSchedules();
      
      setScheduler({
        schedules: schedulesRes.data,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading scheduler data:', error);
      setScheduler(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load scheduler data',
      }));
    }
  };

  // Load music data
  const loadMusicData = async (showLoading = true) => {
    if (showLoading) {
      setMusic(prev => ({ ...prev, loading: true, error: null }));
    }
    
    // Use silent mode for background polling to reduce console noise
    const isSilent = !showLoading;
    
    try {
      // Load music status and stations in parallel
      const [statusRes, stationsRes] = await Promise.all([
        musicApi.getStatus(isSilent),
        musicApi.getStations(isSilent),
      ]);
      
      setMusic({
        status: statusRes.data,
        stations: stationsRes.data?.stations || [],
        loading: false,
        error: null,
      });
    } catch (error) {
      if (!isSilent) {
        console.error('Error loading music data:', error);
      }
      setMusic(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load music data',
      }));
    }
  };

  // Control a shade
  const controlShade = async (id, action) => {
    try {
      await shadesApi.controlShade(id, action);
      // Reload shade data after control
      await loadShadeData();
      return true;
    } catch (error) {
      console.error('Error controlling shade:', error);
      return false;
    }
  };

  // Trigger a shade scene
  const triggerShadeScene = async (scene) => {
    try {
      await shadesApi.triggerScene(scene);
      // Reload shade data after scene trigger
      await loadShadeData();
      return true;
    } catch (error) {
      console.error('Error triggering shade scene:', error);
      return false;
    }
  };

  // Set wake-up time
  const setWakeUpTime = async (time) => {
    try {
      await schedulerApi.setWakeUpTime(time);
      // Reload scheduler data after setting wake-up time
      await loadSchedulerData();
      return true;
    } catch (error) {
      console.error('Error setting wake-up time:', error);
      return false;
    }
  };

  // Control music player
  const controlMusic = async (action, options = {}) => {
    try {
      // Use the unified controlMusic API
      const silent = options?.silent !== false;
      
      // Call the unified endpoint
      await musicApi.controlMusic(action, options, silent);
      
      // Reload music data after control (silently to avoid logs)
      await loadMusicData(false);
      
      // For connectBluetooth action, return a boolean success indicator
      if (action === 'connectBluetooth') {
        // Check if the connection was successful by looking at the updated status
        const statusRes = await musicApi.getStatus(true);
        return statusRes.data?.isBluetoothConnected === true;
      }
      
      return true;
    } catch (error) {
      console.error(`Error controlling music (${action}):`, error);
      return false;
    }
  };

  // Context value
  const value = {
    weather,
    shades,
    scheduler,
    music,
    actions: {
      refreshWeather: loadWeatherData,
      refreshShades: loadShadeData,
      refreshSchedules: loadSchedulerData,
      refreshMusic: loadMusicData,
      controlShade,
      triggerShadeScene,
      setWakeUpTime,
      controlMusic,
    },
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;