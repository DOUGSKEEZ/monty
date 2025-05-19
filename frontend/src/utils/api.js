// API utility for frontend-backend communication

// Base API URL - hardcoded to work with IP access
// IMPORTANT: This is a direct fix for accessing via IP address
const API_BASE_URL = 'http://192.168.0.15:3001/api';

/**
 * Generic fetch function with error handling
 * @param {string} endpoint - API endpoint to call
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - API response data
 */
async function fetchApi(endpoint, options = {}) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`Making API request to: ${url}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    console.log(`Received response from ${url}:`, response.status);

    // Parse JSON response
    const data = await response.json();

    // Check if the response was not successful
    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
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
   * Get active schedules
   * @returns {Promise<Object>} - Active schedules
   */
  getSchedules: () => 
    fetchApi('/scheduler/schedules'),
  
  /**
   * Set wake-up time
   * @param {string} time - Time in HH:MM format
   * @returns {Promise<Object>} - Result
   */
  setWakeUpTime: (time) => 
    fetchApi('/scheduler/wake-up', {
      method: 'POST',
      body: JSON.stringify({ time }),
    }),
  
  /**
   * Trigger a scheduled scene
   * @param {string} sceneName - Scene name
   * @returns {Promise<Object>} - Result
   */
  triggerSchedule: (sceneName) => 
    fetchApi('/scheduler/trigger', {
      method: 'POST',
      body: JSON.stringify({ scene_name: sceneName }),
    }),
};

// Music API endpoints
export const musicApi = {
  /**
   * Get music player status
   * @returns {Promise<Object>} - Music status
   */
  getStatus: () => 
    fetchApi('/music/status'),
  
  /**
   * Get available stations
   * @returns {Promise<Object>} - Stations list
   */
  getStations: () => 
    fetchApi('/music/stations'),
  
  /**
   * Start music player
   * @param {boolean} connectBluetooth - Whether to connect to Bluetooth first
   * @returns {Promise<Object>} - Result
   */
  startPlayer: (connectBluetooth = true) => 
    fetchApi('/music/start', {
      method: 'POST',
      body: JSON.stringify({ connectBluetooth }),
    }),
  
  /**
   * Stop music player
   * @param {boolean} disconnectBluetooth - Whether to disconnect Bluetooth after
   * @returns {Promise<Object>} - Result
   */
  stopPlayer: (disconnectBluetooth = true) => 
    fetchApi('/music/stop', {
      method: 'POST',
      body: JSON.stringify({ disconnectBluetooth }),
    }),
  
  /**
   * Send control command to music player
   * @param {string} command - Control command
   * @returns {Promise<Object>} - Result
   */
  sendCommand: (command) => 
    fetchApi('/music/control', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  
  /**
   * Connect to Bluetooth speaker
   * @returns {Promise<Object>} - Result
   */
  connectBluetooth: () => 
    fetchApi('/music/bluetooth/connect', {
      method: 'POST',
    }),
  
  /**
   * Disconnect from Bluetooth speaker
   * @returns {Promise<Object>} - Result
   */
  disconnectBluetooth: () => 
    fetchApi('/music/bluetooth/disconnect', {
      method: 'POST',
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