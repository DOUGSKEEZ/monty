import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { weatherApi, shadesApi, schedulerApi, musicApi, bluetoothApi, pianobarApi } from './api';

// Create context
const AppContext = createContext();

// Custom hook for using the context
export const useAppContext = () => useContext(AppContext);

// Guest room metadata
const GUEST_ROOM_META = {
  guestroom1: { label: 'Guestroom 1', emoji: '🦌' },
  guestroom2: { label: 'Guestroom 2', emoji: '🏋️' }
};

// Subdomain to room mapping
const SUBDOMAIN_TO_ROOM = {
  'guest1': 'guestroom1',
  'guest2': 'guestroom2'
};

// Detect guest mode from subdomain (e.g., guest1.monty.home -> guestroom1)
const detectGuestFromSubdomain = () => {
  try {
    const hostname = window.location.hostname;
    // Extract subdomain (first part before the first dot)
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const subdomain = parts[0].toLowerCase();
      const roomId = SUBDOMAIN_TO_ROOM[subdomain];
      if (roomId && GUEST_ROOM_META[roomId]) {
        return roomId;
      }
    }
  } catch (e) {
    console.error('Error detecting guest subdomain:', e);
  }
  return null;
};

// Provider component
export const AppProvider = ({ children }) => {
  // Guest state - determined entirely by subdomain (e.g., guest1.monty.home)
  const [guest] = useState(() => {
    const subdomainRoom = detectGuestFromSubdomain();
    if (subdomainRoom) {
      const meta = GUEST_ROOM_META[subdomainRoom];
      console.log(`🏠 Guest mode detected from subdomain: ${subdomainRoom}`);
      return {
        isGuest: true,
        room: subdomainRoom,
        roomEmoji: meta.emoji,
        roomLabel: meta.label
      };
    }

    return {
      isGuest: false,
      room: null,
      roomEmoji: null,
      roomLabel: null
    };
  });

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

  // Active audio source - APP-WIDE SINGLE SOURCE OF TRUTH
  // Lives at top level because it orchestrates BOTH pianobar and jukebox
  const [activeSource, setActiveSourceState] = useState('none'); // 'pianobar' | 'jukebox' | 'none'

  // Jukebox state (YouTube streaming + local music library)
  const [jukebox, setJukebox] = useState({
    isPlaying: false,
    track: {
      title: '',
      artist: '',
      duration: 0,
      position: 0,
      youtubeId: null,    // Set when playing YouTube
      filepath: null       // Set when playing local library
    },
    searchResults: [],
    searchLoading: false,
    queue: { onDeck: null, inTheHole: null },
    library: [],
    libraryLoading: false,
    saveModal: {
      isOpen: false,
      youtubeId: null,
      parsedArtist: '',
      parsedTitle: ''
    },
    toasts: []  // Array of { id, type, message }
  });

  // Removed complex currentSong state - now managed locally in components

  // Theme state - controls navbar seasonal themes and dark mode
  const [theme, setTheme] = useState(() => {
    // Load from localStorage or default to festive mode enabled
    const savedMode = localStorage.getItem('montyThemeMode'); // 'festive' or 'manual'
    const savedManualTheme = localStorage.getItem('montyManualTheme');
    const savedDarkMode = localStorage.getItem('montyDarkMode');

    return {
      mode: savedMode || 'festive', // 'festive' or 'manual'
      festiveEnabled: savedMode !== 'manual', // Deprecated but kept for compatibility
      manualTheme: savedManualTheme || 'default',
      currentTheme: 'default', // Will be calculated based on mode
      darkMode: savedDarkMode === 'true', // Dark mode preference
    };
  });

  // Birthday dates - loaded from config file
  const [birthdayDates, setBirthdayDates] = useState([]);

  // Load birthday dates from config file
  useEffect(() => {
    fetch('/config/birthdays.json')
      .then(response => response.json())
      .then(data => {
        setBirthdayDates(data.dates || []);
      })
      .catch(error => {
        console.error('Error loading birthday dates:', error);
        // Fallback to empty array if file doesn't exist
        setBirthdayDates([]);
      });
  }, []);

  // Calculate current seasonal theme based on date
  const calculateSeasonalTheme = (festiveEnabled) => {
    if (!festiveEnabled) {
      return 'default';
    }

    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();

    // Check birthday dates from config
    const isBirthday = birthdayDates.some(
      date => date.month === month && date.day === day
    );
    if (isBirthday) {
      return 'birthday';
    }

    // New Year's fireworks: January 1
    if (month === 1 && day === 1) {
      return 'fireworks';
    }

    // Patriotic fireworks: July 3-4
    if (month === 7 && (day === 3 || day === 4)) {
      return 'fireworks-patriotic';
    }

    // Sept 1 - Oct 23: autumn
    if ((month === 9) || (month === 10 && day <= 23)) {
      return 'autumn';
    }

    // Oct 24 - Oct 31: halloween
    if (month === 10 && day >= 24) {
      return 'halloween';
    }

    // Nov 1 - Jan 7: xmas
    if ((month === 11) || (month === 12) || (month === 1 && day <= 7)) {
      return 'xmas';
    }

    // Jan 8 - April 30: winter
    if ((month === 1 && day >= 8) || (month === 2) || (month === 3) || (month === 4)) {
      return 'winter';
    }

    // May 1 - Aug 31: summer
    if ((month === 5) || (month === 6) || (month === 7) || (month === 8)) {
      return 'summer';
    }

    // Fallback (shouldn't happen with full year coverage)
    return 'default';
  };

  // Update theme when mode changes
  useEffect(() => {
    let newTheme;
    if (theme.mode === 'manual') {
      newTheme = theme.manualTheme;
    } else {
      newTheme = calculateSeasonalTheme(true);
    }

    if (newTheme !== theme.currentTheme) {
      setTheme(prev => ({ ...prev, currentTheme: newTheme }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.mode, theme.manualTheme]); // calculateSeasonalTheme is stable, currentTheme check prevents loops

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
    
    // Set up intelligent polling with different intervals for different data types
    // Weather/scheduler: Every 2 minutes (less frequent, not critical for real-time updates)
    // Music: Every 30 seconds (WebSocket failover, more frequent but not excessive)
    
    const weatherSchedulerInterval = setInterval(() => {
      loadWeatherData(false);
      loadSchedulerData(false);
    }, 120000); // Weather/scheduler every 2 minutes
    
    const musicInterval = setInterval(() => {
      loadMusicData(false);
      // loadPianobarData(false); // REMOVED: WebSocket handles pianobar updates
    }, 30000); // Music every 30 seconds for WebSocket failover
    
    // Removed background sync
    
    return () => {
      clearInterval(weatherSchedulerInterval);
      clearInterval(musicInterval);
      // Removed sync interval cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: CRITICAL - prevents re-render loops
  
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bluetooth.connectionInProgress, bluetooth.disconnecting]); // Only depend on operation flags

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
        case 'skipSolar':
          result = await schedulerApi.updateSkipSolar(settings.skip_solar_today);
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

  // ============================================
  // JUKEBOX STATE UPDATE FUNCTIONS
  // ============================================

  // Set active audio source - APP-WIDE SINGLE SOURCE OF TRUTH
  // Call this OPTIMISTICALLY when user triggers playback (before API call)
  // Lives at top level (not inside jukebox) because it orchestrates BOTH sources
  const setActiveSource = (source) => {
    console.log('🎵 [ACTIVE-SOURCE] Setting to:', source);
    setActiveSourceState(source);
  };

  // Update jukebox track info (from WebSocket or API)
  const updateJukeboxTrack = (trackData) => {
    console.log('🎵 [JUKEBOX-TRACK] Updating:', trackData);
    setJukebox(prev => ({
      ...prev,
      track: {
        ...prev.track,
        ...trackData
      }
    }));
  };

  // Update jukebox status (isPlaying, etc.)
  const updateJukeboxStatus = (statusData) => {
    console.log('🎵 [JUKEBOX-STATUS] Updating:', statusData);
    setJukebox(prev => ({
      ...prev,
      ...statusData
    }));
  };

  // Set search results from YouTube search
  const setJukeboxSearchResults = (results) => {
    setJukebox(prev => ({
      ...prev,
      searchResults: results || []
    }));
  };

  // Toggle search loading state
  const setJukeboxSearchLoading = (isLoading) => {
    setJukebox(prev => ({
      ...prev,
      searchLoading: isLoading
    }));
  };

  // Update queue (onDeck / inTheHole)
  const updateJukeboxQueue = (queue) => {
    console.log('🎵 [JUKEBOX-QUEUE] Updating:', queue);
    setJukebox(prev => ({
      ...prev,
      queue: {
        ...prev.queue,
        ...queue
      }
    }));
  };

  // Set library tracks
  const setJukeboxLibrary = (tracks) => {
    setJukebox(prev => ({
      ...prev,
      library: tracks || []
    }));
  };

  // Toggle library loading state
  const setJukeboxLibraryLoading = (isLoading) => {
    setJukebox(prev => ({
      ...prev,
      libraryLoading: isLoading
    }));
  };

  // Open save modal with pre-populated data from search results
  const openSaveModal = ({ youtubeId, parsedArtist, parsedTitle }) => {
    setJukebox(prev => ({
      ...prev,
      saveModal: {
        isOpen: true,
        youtubeId,
        parsedArtist: parsedArtist || '',
        parsedTitle: parsedTitle || ''
      }
    }));
  };

  // Close save modal
  const closeSaveModal = () => {
    setJukebox(prev => ({
      ...prev,
      saveModal: {
        isOpen: false,
        youtubeId: null,
        parsedArtist: '',
        parsedTitle: ''
      }
    }));
  };

  // Show a toast notification
  // Types: 'success', 'error', 'info'
  const showToast = (type, message, duration = 4000) => {
    const id = Date.now();
    setJukebox(prev => ({
      ...prev,
      toasts: [...prev.toasts, { id, type, message }]
    }));

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }
  };

  // Dismiss a specific toast
  const dismissToast = (id) => {
    setJukebox(prev => ({
      ...prev,
      toasts: prev.toasts.filter(t => t.id !== id)
    }));
  };

  // Reset jukebox track state (e.g., after stop)
  const clearJukeboxTrack = () => {
    setJukebox(prev => ({
      ...prev,
      isPlaying: false,
      track: {
        title: '',
        artist: '',
        duration: 0,
        position: 0,
        youtubeId: null,
        filepath: null
      }
    }));
  };

  // Removed complex song update logic

  // Removed song clearing logic
  
  // Removed backend state loading

  // Removed backend sync logic

  // Set theme mode (festive or manual)
  const setThemeMode = (mode) => {
    localStorage.setItem('montyThemeMode', mode);
    setTheme(prev => ({
      ...prev,
      mode: mode,
      festiveEnabled: mode === 'festive',
      currentTheme: mode === 'festive' ? calculateSeasonalTheme(true) : prev.manualTheme,
    }));
  };

  // Set manual theme selection
  const setManualTheme = (themeName) => {
    localStorage.setItem('montyManualTheme', themeName);
    setTheme(prev => ({
      ...prev,
      mode: 'manual',
      manualTheme: themeName,
      currentTheme: themeName,
      festiveEnabled: false,
    }));
    localStorage.setItem('montyThemeMode', 'manual');
  };

  // Legacy function for compatibility
  const toggleFestiveMode = (enabled) => {
    setThemeMode(enabled ? 'festive' : 'manual');
  };

  // Toggle dark mode
  const toggleDarkMode = (enabled) => {
    localStorage.setItem('montyDarkMode', enabled ? 'true' : 'false');
    setTheme(prev => ({ ...prev, darkMode: enabled }));
  };

  // Note: Guest mode is now determined by subdomain (e.g., guest1.monty.home)
  // See detectGuestFromSubdomain() at the top of this file
  // No setGuestMode/clearGuestMode needed - subdomain is the source of truth

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
    toggleFestiveMode,
    setThemeMode,
    setManualTheme,
    toggleDarkMode,
    // Jukebox actions
    setActiveSource,
    updateJukeboxTrack,
    updateJukeboxStatus,
    setJukeboxSearchResults,
    setJukeboxSearchLoading,
    updateJukeboxQueue,
    setJukeboxLibrary,
    setJukeboxLibraryLoading,
    openSaveModal,
    closeSaveModal,
    showToast,
    dismissToast,
    clearJukeboxTrack,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // Functions are stable - intentionally omitted to prevent re-creation

  // Context value
  const value = {
    guest,
    weather,
    shades,
    scheduler,
    music,
    bluetooth,
    pianobar,
    jukebox,        // Jukebox state (YouTube + local library)
    activeSource,   // App-wide: 'pianobar' | 'jukebox' | 'none'
    theme,
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