// API utility for frontend-backend communication

// Base API URL - hardcoded to work with IP access
// IMPORTANT: This is a direct fix for accessing via IP address
const API_BASE_URL = 'http://192.168.0.15:3001/api';

/**
 * Generic fetch function with error handling
 * @param {string} endpoint - API endpoint to call
 * @param {Object} options - Fetch options
 * @param {boolean} silent - Whether to suppress logging
 * @returns {Promise<Object>} - API response data
 */
async function fetchApi(endpoint, options = {}, silent = false) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    if (!silent) {
      console.log(`Making API request to: ${url}`);
    }
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!silent) {
      console.log(`Received response from ${url}:`, response.status);
    }

    // Parse JSON response
    const data = await response.json();

    // Check if the response was not successful
    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  } catch (error) {
    if (!silent) {
      console.error(`API Error (${endpoint}):`, error);
    }
    throw error;
  }
}

// Weather API endpoints
export const weatherApi = {
  /**
   * Get current weather
   * @param {boolean} refresh - Force refresh from API instead of cache
   * @returns {Promise<Object>} - Weather data
   */
  getCurrent: (refresh = false) => 
    fetchApi(`/weather/current${refresh ? '?refresh=true' : ''}`),
  
  /**
   * Get weather forecast
   * @param {boolean} refresh - Force refresh from API instead of cache
   * @returns {Promise<Object>} - Forecast data
   */
  getForecast: (refresh = false) => 
    fetchApi(`/weather/forecast${refresh ? '?refresh=true' : ''}`),
  
  /**
   * Get sunrise and sunset times
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Sun times data
   */
  getSunTimes: (date) => 
    fetchApi(`/weather/sun-times${date ? `?date=${date}` : ''}`),
  
  /**
   * Get temperatures from all sources
   * @returns {Promise<Object>} - Temperature data
   */
  getTemperatures: () => 
    fetchApi('/weather/temperatures'),
};

// Shade API endpoints
export const shadesApi = {
  /**
   * Control a single shade
   * @param {number} id - Shade ID
   * @param {string} action - Action (up, down, stop)
   * @returns {Promise<Object>} - Result
   */
  controlShade: (id, action) => 
    fetchApi('/shades/control', {
      method: 'POST',
      body: JSON.stringify({ id, action }),
    }),
  
  /**
   * Trigger a shade scene
   * @param {string} scene - Scene name
   * @returns {Promise<Object>} - Result
   */
  triggerScene: (scene) => 
    fetchApi('/shades/scene', {
      method: 'POST',
      body: JSON.stringify({ scene }),
    }),
  
  /**
   * Get all shades configuration
   * @returns {Promise<Object>} - Shade config data
   */
  getConfig: () => 
    fetchApi('/shades/config'),
};

// Scheduler API endpoints
export const schedulerApi = {
  /**
   * Get scheduler status and next scene times
   * @returns {Promise<Object>} - Scheduler status
   */
  getStatus: () => 
    fetchApi('/scheduler/status'),
  
  /**
   * Get wake up alarm status
   * @returns {Promise<Object>} - Wake up status
   */
  getWakeUpStatus: () => 
    fetchApi('/scheduler/wake-up/status'),
  
  /**
   * Get active schedules
   * @returns {Promise<Object>} - Active schedules
   */
  getSchedules: () => 
    fetchApi('/scheduler/schedules'),
  
  /**
   * Set wake-up time
   * @param {string} time - Time in HH:MM format (24-hour)
   * @returns {Promise<Object>} - Result
   */
  setWakeUpTime: (time) => 
    fetchApi('/scheduler/wake-up', {
      method: 'POST',
      body: JSON.stringify({ time }),
    }),
  
  /**
   * Disable wake up alarm
   * @returns {Promise<Object>} - Result
   */
  disableWakeUp: () => 
    fetchApi('/scheduler/wake-up', {
      method: 'DELETE',
    }),
  
  /**
   * Force SchedulerService initialization
   * @returns {Promise<Object>} - Result
   */
  initialize: () => 
    fetchApi('/scheduler/initialize', {
      method: 'POST',
    }),
  
  /**
   * Manually trigger a scene
   * @param {string} sceneName - Scene to trigger
   * @returns {Promise<Object>} - Result
   */
  triggerScene: (sceneName) => 
    fetchApi('/scheduler/trigger', {
      method: 'POST',
      body: JSON.stringify({ scene_name: sceneName }),
    }),
  
  /**
   * Trigger a scheduled scene (legacy method)
   * @param {string} sceneName - Scene name
   * @returns {Promise<Object>} - Result
   */
  triggerSchedule: (sceneName) => 
    fetchApi('/scheduler/trigger', {
      method: 'POST',
      body: JSON.stringify({ scene_name: sceneName }),
    }),

  /**
   * Get complete scheduler configuration
   * @returns {Promise<Object>} - Scheduler configuration
   */
  getConfig: () => 
    fetchApi('/scheduler/config'),

  /**
   * Update scene timing settings
   * @param {Object} settings - Scene timing settings
   * @returns {Promise<Object>} - Result
   */
  updateScenes: (settings) => 
    fetchApi('/scheduler/scenes', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /**
   * Update wake up settings
   * @param {Object} settings - Wake up settings
   * @returns {Promise<Object>} - Result
   */
  updateWakeUp: (settings) => 
    fetchApi('/scheduler/wake-up', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /**
   * Update music integration settings
   * @param {Object} settings - Music settings
   * @returns {Promise<Object>} - Result
   */
  updateMusic: (settings) => 
    fetchApi('/scheduler/music', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /**
   * Test a scene manually
   * @param {string} sceneName - Scene name to test
   * @returns {Promise<Object>} - Result
   */
  testScene: (sceneName) => 
    fetchApi(`/scheduler/test/${sceneName}`, {
      method: 'POST',
    }),
};

// Bluetooth API endpoints
export const bluetoothApi = {
  /**
   * Get Bluetooth connection status
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Bluetooth status
   */
  getStatus: (silent = false) => 
    fetchApi(`/bluetooth/status${silent ? '?silent=true' : ''}`, {}, silent),
  
  /**
   * Initialize Bluetooth subsystems
   * @returns {Promise<Object>} - Result
   */
  initialize: () => 
    fetchApi('/bluetooth/init', {
      method: 'POST',
    }),
  
  /**
   * Connect to Bluetooth speaker
   * @param {boolean} forceWakeup - Whether to force wakeup sequence
   * @returns {Promise<Object>} - Result
   */
  connect: (forceWakeup = false) => 
    fetchApi('/bluetooth/connect', {
      method: 'POST',
      body: JSON.stringify({ forceWakeup }),
    }),
  
  /**
   * Disconnect from Bluetooth speaker
   * @returns {Promise<Object>} - Result
   */
  disconnect: () => 
    fetchApi('/bluetooth/disconnect', {
      method: 'POST',
    }),
  
  /**
   * Wake up Bluetooth speaker without connecting
   * @returns {Promise<Object>} - Result
   */
  wakeup: () => 
    fetchApi('/bluetooth/wakeup', {
      method: 'POST',
    }),
  
  /**
   * Get Bluetooth diagnostics
   * @returns {Promise<Object>} - Diagnostic information
   */
  getDiagnostics: () => 
    fetchApi('/bluetooth/diagnostics'),
};

// Music API endpoints (redirected to pianobar for compatibility)
export const musicApi = {
  /**
   * Get music player status (redirected to pianobar)
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Music status
   */
  getStatus: (silent = false) => 
    fetchApi(`/pianobar/status${silent ? '?silent=true' : ''}`, {}, silent),
  
  /**
   * Get available stations (redirected to pianobar)
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Stations list
   */
  getStations: (silent = false) => 
    fetchApi(`/pianobar/stations${silent ? '?silent=true' : ''}`, {}, silent),
  
  /**
   * Control the music player with unified endpoint (mapped to pianobar actions)
   * @param {string} action - Action to perform (start, stop, play, pause, next, etc.)
   * @param {Object} options - Additional options for the action
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Result
   */
  controlMusic: (action, options = {}, silent = false) => {
    // Map legacy actions to pianobar endpoints
    switch(action) {
      case 'start':
        return fetchApi('/pianobar/start', { method: 'POST' }, silent);
      case 'stop':
        return fetchApi('/pianobar/stop', { method: 'POST' }, silent);
      case 'play':
        return fetchApi('/pianobar/play', { method: 'POST' }, silent);
      case 'pause':
        return fetchApi('/pianobar/pause', { method: 'POST' }, silent);
      case 'next':
        return fetchApi('/pianobar/next', { method: 'POST' }, silent);
      case 'love':
        return fetchApi('/pianobar/love', { method: 'POST' }, silent);
      default:
        return fetchApi('/pianobar/command', {
          method: 'POST',
          body: JSON.stringify({ command: action }),
        }, silent);
    }
  },
  
  // Legacy methods - redirected to pianobar for compatibility
  /**
   * Start music player (legacy method - redirected to pianobar)
   * @param {boolean} connectBluetooth - Whether to connect to Bluetooth first
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Result
   */
  startPlayer: (connectBluetooth = true, silent = false) => 
    fetchApi('/pianobar/start', { method: 'POST' }, silent),
  
  /**
   * Stop music player (legacy method - redirected to pianobar)
   * @param {boolean} disconnectBluetooth - Whether to disconnect Bluetooth after
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Result
   */
  stopPlayer: (disconnectBluetooth = true, silent = false) => 
    fetchApi('/pianobar/stop', { method: 'POST' }, silent),
  
  /**
   * Send control command to music player (legacy method - redirected to pianobar)
   * @param {string} command - Control command
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Result
   */
  sendCommand: (command, silent = false) => 
    fetchApi('/pianobar/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }, silent),
  
  /**
   * Connect to Bluetooth speaker (legacy method - use bluetoothApi instead)
   * @returns {Promise<Object>} - Result
   */
  connectBluetooth: () => 
    fetchApi('/bluetooth/connect', { method: 'POST' }),
  
  /**
   * Disconnect from Bluetooth speaker (legacy method - use bluetoothApi instead)
   * @returns {Promise<Object>} - Result
   */
  disconnectBluetooth: () => 
    fetchApi('/bluetooth/disconnect', { method: 'POST' }),
};

// Pianobar API endpoints
export const pianobarApi = {
  /**
   * Initialize pianobar service
   * @returns {Promise<Object>} - Result
   */
  initialize: () => 
    fetchApi('/pianobar/initialize', {
      method: 'POST',
    }),
  
  /**
   * Get current pianobar status
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Pianobar status
   */
  getStatus: (silent = false) => 
    fetchApi(`/pianobar/status${silent ? '?silent=true' : ''}`, {}, silent),
  
  /**
   * Start pianobar
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Result
   */
  start: (silent = false) => 
    fetchApi('/pianobar/start', {
      method: 'POST',
    }, silent),
  
  /**
   * Stop pianobar
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Result
   */
  stop: (silent = false) => 
    fetchApi('/pianobar/stop', {
      method: 'POST',
    }, silent),
  
  /**
   * Play or resume pianobar
   * @returns {Promise<Object>} - Result
   */
  play: () => 
    fetchApi('/pianobar/play', {
      method: 'POST',
    }),
  
  /**
   * Pause pianobar
   * @returns {Promise<Object>} - Result
   */
  pause: () => 
    fetchApi('/pianobar/pause', {
      method: 'POST',
    }),
  
  /**
   * Skip to next song
   * @returns {Promise<Object>} - Result
   */
  next: () => 
    fetchApi('/pianobar/next', {
      method: 'POST',
    }),
  
  /**
   * Love the current song
   * @returns {Promise<Object>} - Result
   */
  love: () => 
    fetchApi('/pianobar/love', {
      method: 'POST',
    }),
  
  /**
   * Get available stations
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} - Stations list
   */
  getStations: (silent = false) => 
    fetchApi(`/pianobar/stations${silent ? '?silent=true' : ''}`, {}, silent),
  
  /**
   * Select a station by ID
   * @param {string} stationId - Station ID
   * @returns {Promise<Object>} - Result
   */
  selectStation: (stationId) => 
    fetchApi('/pianobar/select-station', {
      method: 'POST',
      body: JSON.stringify({ stationId }),
    }),
  
  /**
   * Send a raw command to pianobar
   * @param {string} command - Command to send
   * @returns {Promise<Object>} - Result
   */
  sendCommand: (command) => 
    fetchApi('/pianobar/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
};

// Config API endpoints
export const configApi = {
  /**
   * Get configuration value
   * @param {string} key - Config key
   * @returns {Promise<Object>} - Config value
   */
  get: (key) => 
    fetchApi(`/config?key=${encodeURIComponent(key)}`),
  
  /**
   * Set configuration value
   * @param {string} key - Config key
   * @param {any} value - Config value
   * @returns {Promise<Object>} - Result
   */
  set: (key, value) => 
    fetchApi('/config', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    }),
};

// State API endpoints for persistent state management
export const stateApi = {
  /**
   * Get current application state
   * @returns {Promise<Object>} - Application state
   */
  getState: () => 
    fetchApi('/state'),
  
  /**
   * Update specific state key
   * @param {string} key - State key (e.g., 'currentSong')
   * @param {any} value - State value
   * @returns {Promise<Object>} - Result
   */
  updateKey: (key, value) => 
    fetchApi(`/state/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  
  /**
   * Bulk update multiple state keys
   * @param {Object} updates - Object with key-value pairs to update
   * @returns {Promise<Object>} - Result
   */
  updateState: (updates) => 
    fetchApi('/state', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
};

// ShadeCommander API configuration with fallback
console.log('Environment variable REACT_APP_SHADECOMMANDER_URL:', process.env.REACT_APP_SHADECOMMANDER_URL);
const SHADECOMMANDER_URL = process.env.REACT_APP_SHADECOMMANDER_URL || 'http://192.168.0.15:8000';
console.log('Final SHADECOMMANDER_URL:', SHADECOMMANDER_URL);

// Direct ShadeCommander API calls (FastAPI external service)
export const controlShadeCommander = async (shadeId, action) => {
  console.log(`Using ShadeCommander URL: ${SHADECOMMANDER_URL}`);
  const response = await fetch(`${SHADECOMMANDER_URL}/shades/${shadeId}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.json();
};

export const checkShadeCommanderHealth = async () => {
  const response = await fetch(`${SHADECOMMANDER_URL}/health`);
  return response.json();
};

export const triggerShadeCommanderScene = async (sceneName) => {
  console.log(`Triggering scene: ${sceneName} via ShadeCommander`);
  const response = await fetch(`${SHADECOMMANDER_URL}/scenes/${sceneName}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.json();
};


// Export fetchApi for direct usage
export { fetchApi };
