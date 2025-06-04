import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
    config: null,
    schedules: {},
    wakeUpStatus: null,
    status: null,
    usageStats: null,
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

  // Removed complex currentSong state - now managed locally in components

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
    // Removed backend state loading
    
    // Set up interval to refresh data periodically
    // Optimized for One Call API 3.0 limits (1000 calls/day)
    const refreshInterval = setInterval(() => {
      loadWeatherData(false);
      loadSchedulerData(false);
      loadMusicData(false);
      loadPianobarData(false);
      // Bluetooth status is refreshed separately
    }, 10000); // Refresh every 10 seconds (WebSocket priority system prevents race conditions)
    
    // Removed background sync
    
    return () => {
      clearInterval(refreshInterval);
      // Removed sync interval cleanup
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
      // Load scheduler data with individual error handling
      const [configRes, wakeUpStatusRes, statusRes] = await Promise.allSettled([
        schedulerApi.getConfig().catch(err => ({ success: false, error: err.message })),
        schedulerApi.getWakeUpStatus().catch(err => ({ success: false, error: err.message })),
        schedulerApi.getStatus().catch(err => ({ success: false, error: err.message })),
      ]);
      
      const config = configRes.status === 'fulfilled' && configRes.value.success ? configRes.value.data : null;
      const wakeUpStatus = wakeUpStatusRes.status === 'fulfilled' && wakeUpStatusRes.value.success ? wakeUpStatusRes.value.data : null;
      const status = statusRes.status === 'fulfilled' && statusRes.value.success ? statusRes.value.data : null;
      
      setScheduler({
        config: config,
        schedules: status ? status.nextSceneTimes : {},
        wakeUpStatus: wakeUpStatus,
        status: status,
        usageStats: null,
        loading: false,
        error: null,
      });
      
      console.log('✅ Scheduler data loaded:', { config: !!config, wakeUpStatus: !!wakeUpStatus, status: !!status });
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
      
      // 🚫👻 RACE CONDITION FIX: Don't overwrite recent WebSocket data
      setPianobar(prev => {
        const now = Date.now();
        const hasRecentWebSocketUpdate = prev.lastWebSocketUpdate && (now - prev.lastWebSocketUpdate < 10000); // 10 seconds
        
        // 🔴 [API-DATA] Log API data arrival
        console.log('🔴 [API-DATA]', { 
          source: 'API', 
          data: statusData, 
          timestamp: now,
          hasRecentWebSocket: hasRecentWebSocketUpdate,
          showLoading: showLoading
        });
        
        if (hasRecentWebSocketUpdate && !showLoading) {
          console.log('🔒 [DECISION] Using WebSocket data, skipping API - recent WebSocket update exists');
          
          // 🚫👻 BUG FIX: Simply preserve the current pianobar state that WebSocket already set
          // Don't mix in currentSong state as it may contain stale localStorage data
          const preservedState = {
            ...prev,
            // Only update stations since they don't come from WebSocket frequently  
            stations: stationsRes.data?.stations || prev.stations,
            loading: false,
            error: null,
          };
          console.log('🟢 [STATE-UPDATE]', { 
            source: 'API-preserve-WebSocket', 
            oldData: prev, 
            newData: preservedState, 
            timestamp: now 
          });
          return preservedState;
        }
        
        console.log('📡 [DECISION] Using API data, no recent WebSocket updates');
        const newApiState = {
          status: statusData,
          stations: stationsRes.data?.stations || [],
          isRunning: statusData.isPianobarRunning || false,
          isPlaying: statusData.isPlaying || false,
          loading: false,
          error: null,
          lastApiUpdate: now,
        };
        console.log('🟢 [STATE-UPDATE]', { 
          source: 'API-overwrite', 
          oldData: prev, 
          newData: newApiState, 
          timestamp: now 
        });
        return newApiState;
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

  // Update scheduler configuration
  const updateSchedulerConfig = async (configType, settings) => {
    console.log(`Updating scheduler ${configType}:`, settings);
    
    try {
      let result;
      switch (configType) {
        case 'scenes':
          result = await schedulerApi.updateScenes(settings);
          break;
        case 'wakeUp':
          if (settings.time === '') {
            result = await schedulerApi.disableWakeUp();
          } else {
            result = await schedulerApi.updateWakeUp(settings);
          }
          break;
        case 'music':
          result = await schedulerApi.updateMusic(settings);
          break;
        default:
          throw new Error(`Unknown config type: ${configType}`);
      }
      
      if (result.success) {
        console.log(`Scheduler ${configType} updated successfully:`, result.message);
        // Refresh scheduler data to get updated configuration
        await loadSchedulerData(false);
        return { success: true, data: result.data };
      } else {
        console.error(`Failed to update scheduler ${configType}:`, result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`Error updating scheduler ${configType}:`, error);
      return { success: false, error: error.message };
    }
  };

  // Test a scheduler scene
  const testSchedulerScene = async (sceneName) => {
    console.log('Testing scheduler scene:', sceneName);
    
    try {
      const result = await schedulerApi.testScene(sceneName);
      
      if (result.success) {
        console.log(`Scene '${sceneName}' executed successfully:`, result.message);
        return { success: true, message: result.message, data: result.data };
      } else {
        console.error(`Failed to execute scene '${sceneName}':`, result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`Error testing scene '${sceneName}':`, error);
      return { success: false, error: error.message };
    }
  };

  // Clear wake up alarm
  const clearWakeUpAlarm = async () => {
    console.log('Clearing wake up alarm');
    
    try {
      const result = await schedulerApi.disableWakeUp();
      
      if (result.success) {
        console.log('Wake up alarm cleared successfully:', result.message);
        // Refresh scheduler data to get updated status
        await loadSchedulerData(false);
        return true;
      } else {
        console.error('Failed to clear wake up alarm:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error clearing wake up alarm:', error);
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
        case 'kill':
          result = await pianobarApi.kill();
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
    const now = Date.now();
    
    // 🔵 [WS-DATA] Log WebSocket data arrival
    console.log('🔵 [WS-DATA]', { 
      source: 'WebSocket', 
      data: newStatusData, 
      timestamp: now 
    });
    
    setPianobar(prev => {
      const newWebSocketState = {
        ...prev,
        ...newStatusData,
        loading: false,
        error: null,
        lastWebSocketUpdate: now // 🚫👻 RACE CONDITION FIX: Mark WebSocket update time
      };
      
      console.log('🟢 [STATE-UPDATE]', { 
        source: 'WebSocket-update', 
        oldData: prev, 
        newData: newWebSocketState, 
        timestamp: now 
      });
      
      return newWebSocketState;
    });
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

  // Removed complex song update logic

  // Removed song clearing logic
  
  // Removed backend state loading
  
  // Removed backend sync logic

  // Memoize actions to prevent infinite re-renders
  const actions = useMemo(() => ({
    refreshWeather: loadWeatherData,
    refreshShades: loadShadeData,
    refreshScheduler: loadSchedulerData,
    refreshMusic: loadMusicData,
    refreshBluetooth: loadBluetoothStatus,
    refreshPianobar: loadPianobarData,
    controlShade,
    triggerShadeScene,
    setWakeUpTime,
    clearWakeUpAlarm,
    updateSchedulerConfig,
    testSchedulerScene,
    controlMusic,
    controlPianobar,
    connectBluetooth,
    disconnectBluetooth,
    updatePianobarStatus,
    updatePianobarStations,
    // Removed song management actions
  }), []); // Empty dependency array - functions are stable

  // Context value
  const value = {
    weather,
    shades,
    scheduler,
    music,
    bluetooth,
    pianobar,
    // Removed currentSong from context
    actions,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;