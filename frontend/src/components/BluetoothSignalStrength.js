import React, { useState, useEffect } from 'react';

// Backend API base URL (same as api.js)
const API_BASE_URL = 'http://192.168.10.15:3001/api';

/**
 * BluetoothSignalStrength Component
 *
 * Displays real-time Bluetooth RSSI (signal strength) with visual indicator
 * - Uses module-level shared state to ensure all instances show the same data
 * - Polls backend every 2 seconds when page is visible
 * - Pauses polling when page is hidden (tab switched/minimized)
 * - Shows signal bars based on strength thresholds
 * - Displays RSSI value in dBm
 *
 * @param {string} mode - "icon" to show only icon, "text" to show only text, "both" for both
 */

// Shared state across all component instances (module-level)
let sharedRssi = null;
let sharedIsConnected = false;
let subscribers = [];
let intervalId = null;
let isVisible = true;

// Fetch RSSI from backend
const fetchRSSI = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/bluetooth/rssi?silent=true`);
    if (response.ok) {
      const data = await response.json();

      // Update shared state
      sharedRssi = data.rssi;
      sharedIsConnected = data.connected;

      // Notify all subscribers
      subscribers.forEach(callback => callback(data.rssi, data.connected));
    }
  } catch (error) {
    console.warn('Failed to fetch RSSI:', error);
    sharedRssi = null;
    sharedIsConnected = false;
    subscribers.forEach(callback => callback(null, false));
  }
};

// Start polling (only once globally)
const startPolling = () => {
  if (intervalId) return; // Already polling

  // Fetch immediately
  fetchRSSI();

  // Then poll every 2 seconds
  intervalId = setInterval(() => {
    if (isVisible) {
      fetchRSSI();
    }
  }, 2000);
};

// Stop polling (only when no more subscribers)
const stopPolling = () => {
  if (intervalId && subscribers.length === 0) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

// Handle visibility change
const handleVisibilityChange = () => {
  isVisible = !document.hidden;

  if (document.hidden) {
    console.log('📊 RSSI polling paused - page hidden');
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  } else {
    console.log('📊 RSSI polling resumed - page visible');
    startPolling();
  }
};

function BluetoothSignalStrength({ mode = 'both' }) {
  const [rssi, setRssi] = useState(sharedRssi);
  const [isConnected, setIsConnected] = useState(sharedIsConnected);

  useEffect(() => {
    // Create subscriber callback
    const updateState = (newRssi, newIsConnected) => {
      setRssi(newRssi);
      setIsConnected(newIsConnected);
    };

    // Add this component as a subscriber
    subscribers.push(updateState);

    // Start polling if this is the first subscriber
    if (subscribers.length === 1) {
      startPolling();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Cleanup when component unmounts
    return () => {
      // Remove this subscriber
      subscribers = subscribers.filter(cb => cb !== updateState);

      // Stop polling if no more subscribers
      if (subscribers.length === 0) {
        stopPolling();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, []);

  // Determine signal quality and icon
  const getSignalQuality = (rssiValue) => {
    if (rssiValue === null) return { bars: 0, color: 'text-gray-400', label: 'No Signal' };
    if (rssiValue >= -49) return { bars: 4, color: 'text-green-500', label: 'Excellent' };
    if (rssiValue >= -59) return { bars: 3, color: 'text-green-400', label: 'Good' };
    if (rssiValue >= -68) return { bars: 2, color: 'text-yellow-500', label: 'Fair' };
    if (rssiValue >= -78) return { bars: 1, color: 'text-orange-500', label: 'Poor' };
    return { bars: 1, color: 'text-red-500', label: 'Very Poor' };
  };

  const quality = getSignalQuality(rssi);

  // Render signal bars icon
  const renderSignalIcon = () => {
    const { bars, color } = quality;

    return (
      <svg
        className={`w-5 h-5 ${color}`}
        viewBox="0 0 24 24"
        fill="currentColor"
        title={quality.label}
      >
        {/* Bar 1 (always shown if connected) */}
        <rect
          x="2"
          y="18"
          width="3"
          height="6"
          opacity={bars >= 1 ? 1 : 0.2}
        />
        {/* Bar 2 */}
        <rect
          x="7"
          y="14"
          width="3"
          height="10"
          opacity={bars >= 2 ? 1 : 0.2}
        />
        {/* Bar 3 */}
        <rect
          x="12"
          y="10"
          width="3"
          height="14"
          opacity={bars >= 3 ? 1 : 0.2}
        />
        {/* Bar 4 */}
        <rect
          x="17"
          y="6"
          width="3"
          height="18"
          opacity={bars >= 4 ? 1 : 0.2}
        />
      </svg>
    );
  };

  // Don't render if not connected
  if (!isConnected || rssi === null) {
    return null;
  }

  // Render based on mode
  if (mode === 'icon') {
    return (
      <span className="ml-3 inline-flex items-center self-center -translate-y-1">
        {renderSignalIcon()}
      </span>
    );
  }

  if (mode === 'text') {
    return (
      <span className="text-xs text-gray-500 font-mono ml-11">
        {rssi} dBm
      </span>
    );
  }

  // Default: both icon and text
  return (
    <div className="flex items-center space-x-2 ml-4">
      <span className="text-xs text-gray-500 font-mono">
        {rssi} dBm
      </span>
      {renderSignalIcon()}
    </div>
  );
}

export default BluetoothSignalStrength;
