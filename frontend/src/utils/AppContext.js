import React, { createContext, useContext, useState, useEffect } from 'react';
import { weatherApi, shadesApi, schedulerApi, musicApi, bluetoothApi, pianobarApi, stateApi } from './api';

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
    wakeUpStatus: null,
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

  // Bluetooth state
  const [bluetooth, setBluetooth] = useState({
    status: null,
    isConnected: false,
    isAudioReady: false,
    connectionInProgress: false,
    disconnecting: false, // Add specific flag for disconnecting state
    loading: true,
    error: null,
  });
  
  // Pianobar state
  const [pianobar, setPianobar] = useState({
    status: null,
    stations: [],
    isRunning: false,
    isPlaying: false,
    loading: true,
    error: null,
  });

  // Current song state with localStorage persistence
  const [currentSong, setCurrentSong] = useState(() => {
    // Try to load from localStorage first
    try {
      const stored = localStorage.getItem('monty_currentSong');
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('🎵 Loaded currentSong from localStorage:', parsed);
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to load currentSong from localStorage:', error);
    }
    
    // Default state if no localStorage data
    return {
      title: '',
      artist: '',
      album: '',
      stationName: '',
      rating: 0,
      songDuration: 0,
      songPlayed: 0,
      coverArt: '',
      detailUrl: ''
    };
  });

  // Persistent state management
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());

  // Load initial data
  useEffect(() => {
    // Initial data loading
    loadWeatherData();
    loadShadeData();
    loadSchedulerData();
    loadMusicData();
    loadBluetoothStatus();
    loadPianobarData();
    
    // Load persistent state from backend
    loadBackendState();
    
    // Set up interval to refresh data periodically
    // Optimized for One Call API 3.0 limits (1000 calls/day)
    const refreshInterval = setInterval(() => {
      loadWeatherData(false);
      loadSchedulerData(false);
      loadMusicData(false);
      loadPianobarData(false);
      // Bluetooth status is refreshed separately
    }, 600000); // Refresh every 10 minutes (saves API calls)
    
    // Set up background state sync every 30 seconds
    const syncInterval = setInterval(() => {
      syncStateToBackend();
    }, 30000);
    
    return () => {
      clearInterval(refreshInterval);
      clearInterval(syncInterval);
    };
  }, []); // CRITICAL: Remove the dependency array that was causing re-renders
  
  // Separate effect for Bluetooth polling to avoid render loops
  useEffect(() => {
    // Only set up polling when not in an active operation
    let bluetoothInterval = null;
    
    if (!bluetooth.connectionInProgress && !bluetooth.disconnecting) {
      // Background polling only when idle (not connecting or disconnecting)
      bluetoothInterval = setInterval(() => {
        loadBluetoothStatus(false);
      }, 15000); // Reduced polling frequency to every 15 seconds when idle
      
      console.log('Setting up background Bluetooth polling');
    } else {
      console.log('Skipping background Bluetooth polling - operation in progress');
    }
    
    return () => {
      if (bluetoothInterval) {
        clearInterval(bluetoothInterval);
        bluetoothInterval = null;
      }
    };
  }, [bluetooth.connectionInProgress, bluetooth.disconnecting]); // Only depend on these two flags

  // Load weather data
  const loadWeatherData = async (forceRefresh = false, showLoading = true) => {
    if (showLoading) {
      setWeather(prev => ({ ...prev, loading: true, error: null }));
    }
    
    try {
      // Load all weather data in parallel - pass forceRefresh to weather API calls
      const [currentRes, forecastRes, sunTimesRes, temperaturesRes] = await Promise.all([
        weatherApi.getCurrent(forceRefresh),
        weatherApi.getForecast(forceRefresh),
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

  // Load shade data - DISABLED: Shades now use hardcoded config in ShadesPage
  const loadShadeData = async () => {
    // Shades configuration is now handled directly by ShadesPage with default values
    // This avoids the need for a backend shades service since ShadeCommander handles control
    setShades({
      config: null, // ShadesPage uses hardcoded defaults
      loading: false,
      error: null,
    });
  };

  // Load scheduler data
  const loadSchedulerData = async (showLoading = true) => {
    if (showLoading) {
      setScheduler(prev => ({ ...prev, loading: true, error: null }));
    }
    
    try {
      // Load wake up status
      const wakeUpStatusRes = await schedulerApi.getWakeUpStatus();
      
      setScheduler({
        schedules: {}, // Will be populated when needed
        wakeUpStatus: wakeUpStatusRes.data,
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
  
  // Load pianobar data
  const loadPianobarData = async (showLoading = true) => {
    if (showLoading) {
      setPianobar(prev => ({ ...prev, loading: true, error: null }));
    }
    
    // Use silent mode for background polling to reduce console noise
    const isSilent = !showLoading;
    
    try {
      // Load pianobar status and stations in parallel
      const [statusRes, stationsRes] = await Promise.all([
        pianobarApi.getStatus(isSilent),
        pianobarApi.getStations(isSilent),
      ]);
      
      const statusData = statusRes.data || {};
      
      setPianobar({
        status: statusData,
        stations: stationsRes.data?.stations || [],
        isRunning: statusData.isPianobarRunning || false,
        isPlaying: statusData.isPlaying || false,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (!isSilent) {
        console.error('Error loading pianobar data:', error);
      }
      setPianobar(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load pianobar data',
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
    console.log('Setting wake up time:', time);
    
    try {
      const result = await schedulerApi.setWakeUpTime(time);
      
      if (result.success) {
        console.log('Wake up time set successfully:', result.message);
        // Refresh scheduler data to get updated wake up status
        await loadSchedulerData(false);
        return true;
      } else {
        console.error('Failed to set wake up time:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error setting wake up time:', error);
      return false;
    }
  };

  // Load Bluetooth status
  const loadBluetoothStatus = async (showLoading = true) => {
    // CRITICAL: Don't disrupt ongoing operations
    // Check if we're in the middle of connecting/disconnecting
    if (bluetooth.connectionInProgress || bluetooth.disconnecting) {
      console.log('Skipping loadBluetoothStatus during active operation:', {
        connectionInProgress: bluetooth.connectionInProgress,
        disconnecting: bluetooth.disconnecting
      });
      
      // Return the current state to avoid disrupting operations
      return {
        isConnected: bluetooth.isConnected,
        isAudioReady: bluetooth.isAudioReady,
        connectionInProgress: bluetooth.connectionInProgress,
        status: 'OPERATION_IN_PROGRESS'
      };
    }
    
    // Set loading state if needed (but only if we're not in an active operation)
    if (showLoading) {
      setBluetooth(prev => ({ ...prev, loading: true, error: null }));
    }
    
    try {
      // Use silent mode for background polling to reduce console noise
      const isSilent = !showLoading;
      
      // Get the status from the API
      const statusRes = await bluetoothApi.getStatus(isSilent);
      
      // Check if an operation started while we were getting status
      if (bluetooth.connectionInProgress || bluetooth.disconnecting) {
        console.log('Operation started during status check - preserving operation flags');
        
        // Don't update operation flags if they were set during the API call
        setBluetooth(prev => ({
          ...prev,
          // Only update connection status, not operation flags
          isConnected: statusRes.isConnected,
          isAudioReady: statusRes.isAudioReady,
          loading: false,
          // Keep existing operation flags
          // connectionInProgress: prev.connectionInProgress,
          // disconnecting: prev.disconnecting,
          lastUpdated: Date.now()
        }));
      } else {
        // No active operations, safe to update all status
        setBluetooth(prev => ({
          ...prev,
          status: statusRes,
          isConnected: statusRes.isConnected,
          isAudioReady: statusRes.isAudioReady,
          // Only update these flags if we're not in an operation
          connectionInProgress: false,
          disconnecting: false,
          loading: false,
          error: null,
          lastUpdated: Date.now()
        }));
      }
      
      return statusRes;
    } catch (error) {
      console.error('Error loading Bluetooth status:', error);
      
      // Don't disrupt operation flags on error
      setBluetooth(prev => ({
        ...prev,
        loading: false,
        // Only set error if we're not in an operation
        error: !prev.connectionInProgress && !prev.disconnecting ? 
          'Failed to load Bluetooth status' : prev.error
      }));
      
      return null;
    }
  };
  
  // Connect to Bluetooth
  const connectBluetooth = async (forceWakeup = false) => {
    try {
      console.log('AppContext.connectBluetooth called with forceWakeup:', forceWakeup);
      
      // CRITICAL DEBUGGING - Log the current state for debugging
      console.log('BEFORE STATE UPDATE - Current bluetooth state:', bluetooth);
      
      // CRITICAL FIX: Use state setter function to ensure we're working with the latest state
      // This ensures that we don't lose the connectionInProgress flag due to closure issues
      setBluetooth(prev => {
        console.log('Setting connectionInProgress to true from:', prev.connectionInProgress);
        
        const newState = {
          ...prev,
          connectionInProgress: true,
          error: null
        };
        
        // Log what the new state will be
        console.log('NEW STATE WILL BE:', newState);
        
        // Return the new state object
        return newState;
      });
      
      // Immediately log this action for debugging
      console.log('AFTER setBluetooth - Current bluetooth state:', bluetooth);
      
      // CRITICAL TEST: Create a local state variable and force a direct state set
      const directState = {
        ...bluetooth,
        connectionInProgress: true,
        error: null
      };
      
      // Log the direct state for comparison
      console.log('Direct state object:', directState);
      
      // CRUCIAL TEST: Setting state directly instead of using a function
      // This is to test if setBluetooth is working at all
      setBluetooth({
        ...bluetooth,
        connectionInProgress: true,
        error: null,
        testDirectSet: true,
        timestamp: new Date().toISOString()
      });
      
      // Immediately log after direct set
      console.log('AFTER DIRECT SET - bluetooth state:', bluetooth);
      
      try {
        // Call the Bluetooth connect API with error handling
        console.log('Calling Bluetooth connect API...');
        const result = await bluetoothApi.connect(forceWakeup);
        console.log('Bluetooth connect API result:', result);
        
        if (!result.success) {
          // Handle API error and update UI state
          console.error('Bluetooth API returned error:', result.error || 'Unknown error');
          
          setBluetooth(prev => ({ 
            ...prev, 
            connectionInProgress: false,
            error: result.message || 'Failed to connect to Bluetooth speakers'
          }));
          
          return false;
        }
      } catch (apiError) {
        // Handle API call exception
        console.error('Exception calling Bluetooth API:', apiError);
        
        setBluetooth(prev => ({ 
          ...prev, 
          connectionInProgress: false,
          error: 'Error connecting to Bluetooth: ' + apiError.message
        }));
        
        return false;
      }
      
      // Start polling for status updates with a much slower rate
      // This prevents render thrashing while still providing updates
      let attempts = 0;
      const maxAttempts = 40; // 40 * 2 seconds = 80 seconds timeout
      
      // Define polling function with SLOWER polling to prevent render thrashing
      const pollStatus = async () => {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts}`);
        
        try {
          // Get current status directly from API
          const status = await bluetoothApi.getStatus(true);
          console.log('Polling status result:', status);
          
          // Check for connection success
          if (status && status.isConnected && status.isAudioReady) {
            console.log('Connected and audio ready - connection complete');
            
            // Update state when fully connected
            setBluetooth(prev => ({ 
              ...prev, 
              connectionInProgress: false,
              isConnected: true,
              isAudioReady: true,
              error: null
            }));
            
            return true;
          }
          
          // If connected but audio not ready, update state but continue polling
          if (status && status.isConnected && !status.isAudioReady) {
            console.log('Connected but audio not ready - continuing polling');
            
            // Update state but keep connectionInProgress true
            setBluetooth(prev => ({ 
              ...prev, 
              isConnected: true,
              isAudioReady: false
              // Keep connectionInProgress true
            }));
          }
          
          // If we've reached max attempts, stop polling
          if (attempts >= maxAttempts) {
            console.log('Reached max attempts - timing out');
            
            setBluetooth(prev => ({ 
              ...prev, 
              connectionInProgress: false,
              error: 'Connection timed out'
            }));
            
            return false;
          }
          
          // Continue polling with SLOWER intervals (2 seconds) to prevent render thrashing
          return new Promise(resolve => {
            setTimeout(async () => {
              resolve(await pollStatus());
            }, 2000); // Much slower polling (2s) to prevent render thrashing
          });
        } catch (pollError) {
          console.error('Error during status polling:', pollError);
          
          // If polling fails, don't immediately stop - try again unless we've hit max attempts
          if (attempts >= maxAttempts) {
            setBluetooth(prev => ({ 
              ...prev, 
              connectionInProgress: false,
              error: 'Error checking connection status'
            }));
            
            return false;
          }
          
          // Continue polling even after an error
          return new Promise(resolve => {
            setTimeout(async () => {
              resolve(await pollStatus());
            }, 2000);
          });
        }
      };
      
      // Start polling
      console.log('Starting polling for connection status');
      return await pollStatus();
    } catch (error) {
      console.error('Error in connectBluetooth function:', error);
      
      // Make sure we reset the connection flag no matter what
      setBluetooth(prev => ({ 
        ...prev, 
        connectionInProgress: false,
        error: 'Failed to connect to Bluetooth speakers: ' + error.message
      }));
      
      return false;
    }
  };
  
  // Disconnect from Bluetooth
  const disconnectBluetooth = async () => {
    try {
      console.log('disconnectBluetooth called');
      
      // CRITICAL FIX: Use state setter function to ensure we're working with the latest state
      setBluetooth(prev => {
        console.log('Setting disconnecting and connectionInProgress flags from:', 
          { disconnecting: prev.disconnecting, connectionInProgress: prev.connectionInProgress });
        
        return {
          ...prev,
          connectionInProgress: true,
          disconnecting: true,
          error: null
        };
      });
      
      console.log('Set disconnecting = true and connectionInProgress = true');
      
      try {
        // Call the Bluetooth disconnect API with error handling
        console.log('Calling Bluetooth disconnect API...');
        const result = await bluetoothApi.disconnect();
        console.log('Bluetooth disconnect API result:', result);
        
        if (!result.success) {
          // Handle API error
          console.error('Bluetooth disconnect API returned error:', result.error || 'Unknown error');
          
          setBluetooth(prev => ({ 
            ...prev, 
            connectionInProgress: false,
            disconnecting: false,
            error: result.message || 'Failed to disconnect from Bluetooth speakers'
          }));
          
          return false;
        }
      } catch (apiError) {
        // Handle API call exception
        console.error('Exception calling Bluetooth disconnect API:', apiError);
        
        setBluetooth(prev => ({ 
          ...prev, 
          connectionInProgress: false,
          disconnecting: false,
          error: 'Error disconnecting from Bluetooth: ' + apiError.message
        }));
        
        return false;
      }
      
      // Immediately update the UI state to show we're disconnected
      // This is more responsive than waiting for polling
      setBluetooth(prev => ({ 
        ...prev, 
        connectionInProgress: false,
        disconnecting: false,
        isConnected: false,
        isAudioReady: false
      }));
      
      console.log('Updated state after disconnect: isConnected=false, disconnecting=false');
      
      // Verify the disconnection with a single status check after a delay
      // This is more reliable than polling and won't cause render thrashing
      try {
        // Wait a moment for the disconnection to take effect
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get a final status check
        const finalStatus = await bluetoothApi.getStatus(true);
        console.log('Final status check after disconnect:', finalStatus);
        
        // Update state one last time based on the actual status
        if (finalStatus && finalStatus.isConnected) {
          console.warn('Device still shows as connected after disconnect attempt');
          
          setBluetooth(prev => ({ 
            ...prev, 
            isConnected: true,
            error: 'Device still shows as connected - you may need to try again'
          }));
          
          return false;
        } else {
          console.log('Disconnect confirmed by status check');
          return true;
        }
      } catch (finalCheckError) {
        console.error('Error during final status check:', finalCheckError);
        // We already updated the UI to show disconnected, so just return true
        return true;
      }
    } catch (error) {
      console.error('Error in disconnectBluetooth function:', error);
      
      // Make sure we reset the flags no matter what
      setBluetooth(prev => ({ 
        ...prev, 
        connectionInProgress: false,
        disconnecting: false,
        error: 'Failed to disconnect from Bluetooth speakers: ' + error.message
      }));
      
      return false;
    }
  };

  // Control music player
  const controlMusic = async (action, options = {}) => {
    try {
      // Use the unified controlMusic API
      const silent = options?.silent !== false;
      
      // Handle the old connectBluetooth action by redirecting to the new function
      if (action === 'connectBluetooth') {
        return await connectBluetooth(options?.forceWakeup);
      }
      
      // Handle the old disconnectBluetooth action by redirecting to the new function
      if (action === 'disconnectBluetooth') {
        return await disconnectBluetooth();
      }
      
      // Call the unified endpoint for other actions
      await musicApi.controlMusic(action, options, silent);
      
      // Reload music data after control (silently to avoid logs)
      await loadMusicData(false);
      
      return true;
    } catch (error) {
      console.error(`Error controlling music (${action}):`, error);
      return false;
    }
  };
  
  // Control pianobar player
  const controlPianobar = async (action, options = {}) => {
    try {
      const silent = options?.silent !== false;
      let result;
      
      // Handle different actions
      switch (action) {
        case 'start':
          result = await pianobarApi.start(silent);
          break;
        case 'stop':
          result = await pianobarApi.stop(silent);
          break;
        case 'play':
          result = await pianobarApi.play();
          break;
        case 'pause':
          result = await pianobarApi.pause();
          break;
        case 'next':
          result = await pianobarApi.next();
          break;
        case 'love':
          result = await pianobarApi.love();
          break;
        case 'selectStation':
          if (!options.stationId) {
            throw new Error('stationId is required for selectStation action');
          }
          result = await pianobarApi.selectStation(options.stationId);
          break;
        case 'command':
          if (!options.command) {
            throw new Error('command is required for command action');
          }
          result = await pianobarApi.sendCommand(options.command);
          break;
        default:
          throw new Error(`Unknown pianobar action: ${action}`);
      }
      
      // Reload pianobar data after control (silently to avoid logs)
      await loadPianobarData(false);
      
      return result?.success || false;
    } catch (error) {
      console.error(`Error controlling pianobar (${action}):`, error);
      return false;
    }
  };

  // Update pianobar status directly from WebSocket
  const updatePianobarStatus = (newStatusData) => {
    setPianobar(prev => ({
      ...prev,
      ...newStatusData,
      loading: false,
      error: null
    }));
  };
  
  // Update pianobar stations list directly
  const updatePianobarStations = (stations) => {
    setPianobar(prev => ({
      ...prev,
      stations: stations || [],
      loading: false,
      error: null
    }));
  };

  // Update current song data from WebSocket events with persistence
  const updateCurrentSong = (songData) => {
    const newSongData = {
      ...currentSong,
      ...songData,
      lastUpdated: Date.now()
    };
    
    setCurrentSong(newSongData);
    
    // Persist to localStorage immediately
    try {
      localStorage.setItem('monty_currentSong', JSON.stringify(newSongData));
      console.log('💾 Saved currentSong to localStorage:', newSongData);
    } catch (error) {
      console.warn('Failed to save currentSong to localStorage:', error);
    }
    
    // Debounced backend sync (only sync significant changes)
    if (shouldSyncToBackend(songData)) {
      debouncedBackendSync(newSongData);
    }
  };

  // Clear current song data with persistence
  const clearCurrentSong = () => {
    const clearedState = {
      title: '',
      artist: '',
      album: '',
      stationName: '',
      rating: 0,
      songDuration: 0,
      songPlayed: 0,
      coverArt: '',
      detailUrl: '',
      lastUpdated: Date.now()
    };
    
    setCurrentSong(clearedState);
    
    // Clear from localStorage
    try {
      localStorage.removeItem('monty_currentSong');
      console.log('🗑️ Cleared currentSong from localStorage');
    } catch (error) {
      console.warn('Failed to clear currentSong from localStorage:', error);
    }
    
    // Sync cleared state to backend
    syncStateToBackend({ currentSong: clearedState });
  };
  
  // Load state from backend API
  const loadBackendState = async () => {
    try {
      const backendState = await stateApi.getState();
      console.log('🔄 Loaded state from backend:', backendState);
      
      // Only update if backend has newer data
      if (backendState.currentSong && 
          (!currentSong.lastUpdated || 
           backendState.currentSong.lastUpdated > currentSong.lastUpdated)) {
        
        setCurrentSong(backendState.currentSong);
        
        // Update localStorage with backend data
        localStorage.setItem('monty_currentSong', JSON.stringify(backendState.currentSong));
        console.log('⬇️ Updated localStorage with newer backend data');
      }
    } catch (error) {
      console.warn('Failed to load state from backend:', error);
    }
  };
  
  // Sync state to backend API
  const syncStateToBackend = async (stateToSync = null) => {
    try {
      const stateData = stateToSync || { currentSong };
      
      const result = await stateApi.updateState(stateData);
      setLastSyncTime(result.lastUpdated);
      console.log('⬆️ Synced state to backend:', result);
    } catch (error) {
      console.warn('Failed to sync state to backend:', error);
    }
  };
  
  // Debounced backend sync (prevent too many API calls)
  let syncTimeout = null;
  const debouncedBackendSync = (songData) => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncStateToBackend({ currentSong: songData });
    }, 5000); // Sync 5 seconds after last update
  };
  
  // Check if we should sync to backend (only for significant changes)
  const shouldSyncToBackend = (songData) => {
    // Sync for new songs, rating changes, or every 30 seconds during playback
    return songData.title || 
           songData.artist || 
           songData.rating !== undefined || 
           (Date.now() - lastSyncTime > 30000);
  };

  // Context value
  const value = {
    weather,
    shades,
    scheduler,
    music,
    bluetooth,
    pianobar,
    currentSong,
    actions: {
      refreshWeather: loadWeatherData,
      refreshShades: loadShadeData,
      refreshScheduler: loadSchedulerData,
      refreshMusic: loadMusicData,
      refreshBluetooth: loadBluetoothStatus,
      refreshPianobar: loadPianobarData,
      controlShade,
      triggerShadeScene,
      setWakeUpTime,
      controlMusic,
      controlPianobar,
      connectBluetooth,
      disconnectBluetooth,
      updatePianobarStatus,
      updatePianobarStations,
      updateCurrentSong,
      clearCurrentSong
    },
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;