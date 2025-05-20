import React, { useState, useEffect } from 'react';
import { useAppContext } from '../utils/AppContext';

function MusicPage() {
  const { music, actions } = useAppContext();
  const [selectedStation, setSelectedStation] = useState('');
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);
  const [showConnectingMessage, setShowConnectingMessage] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState('unknown'); // 'unknown', 'connecting', 'connected', 'failed'
  
  // Update selected station when music status changes
  useEffect(() => {
    if (music.status && music.status.stationId) {
      setSelectedStation(music.status.stationId);
    }
    
    // Update bluetooth status when music status changes
    if (music.status && music.status.isBluetoothConnected) {
      setBluetoothStatus('connected');
    } else if (music.status && !music.status.isBluetoothConnected && !isConnectingBluetooth) {
      setBluetoothStatus('disconnected');
    }
  }, [music.status, isConnectingBluetooth]);
  
  // Helper to check if player is on
  const isPlayerOn = () => {
    return music.status && 
           music.status.isPianobarRunning && 
           (music.status.status !== 'stopped');
  };
  
  // Helper to check if player is playing
  const isPlaying = () => {
    return isPlayerOn() && music.status.status === 'playing';
  };
  
  // Format song time as MM:SS (for future use)
  // const formatTime = (seconds) => {
  //   if (!seconds) return '--:--';
  //   const mins = Math.floor(seconds / 60);
  //   const secs = seconds % 60;
  //   return `${mins}:${secs.toString().padStart(2, '0')}`;
  // };
  
  // Connect to Bluetooth speakers without starting pianobar
  const handleConnectBluetooth = async () => {
    setBluetoothStatus('connecting');
    setIsConnectingBluetooth(true);
    
    try {
      console.log('Starting Bluetooth connection process to wake speakers from sleep mode...');
      const btResult = await actions.controlMusic('connectBluetooth');
      
      if (btResult) {
        console.log('Bluetooth connection successful, speakers should be awake now');
        setBluetoothStatus('connected');
      } else {
        console.warn('Bluetooth connection failed');
        setBluetoothStatus('failed');
      }
      
      // Refresh status to update UI
      await actions.refreshMusic(false);
    } catch (error) {
      console.error('Error connecting to Bluetooth:', error);
      setBluetoothStatus('failed');
    } finally {
      setIsConnectingBluetooth(false);
    }
  };
  
  // Start the player - WITHOUT any Bluetooth connectivity
  const handleStartPlayer = async () => {
    setShowConnectingMessage(true);
    
    try {
      console.log('Starting Pandora music player...');
      
      // Start player WITHOUT initiating Bluetooth connection
      await actions.controlMusic('start', { connectBluetooth: false, silent: true });
      
      // Refresh music status (silent mode for background refresh)
      await actions.refreshMusic(false);
      
      // Set up staggered status refresh timers to catch player status changes
      // Multiple refreshes with progressively longer intervals
      // This helps detect player status changes
      
      // First check after 5 seconds
      setTimeout(async () => {
        console.log('First status refresh after 5s');
        await actions.refreshMusic(false);
        
        // Second check after 8 more seconds (13s total)
        setTimeout(async () => {
          console.log('Second status refresh after 13s');
          await actions.refreshMusic(false);
          
          // Third check after 12 more seconds (25s total)
          setTimeout(async () => {
            console.log('Third status refresh after 25s');
            await actions.refreshMusic(false);
          }, 12000);
        }, 8000);
      }, 5000);
    } catch (error) {
      console.error('Error starting player:', error);
    } finally {
      // Keep the message visible briefly for feedback
      setTimeout(() => {
        setShowConnectingMessage(false);
      }, 2000);
    }
  };
  
  // Stop the player
  const handleStopPlayer = async () => {
    try {
      // Use silent mode to reduce console noise
      // Do NOT disconnect Bluetooth when stopping player
      await actions.controlMusic('stop', { disconnectBluetooth: false, silent: true });
      // Use silent mode for refresh after stopping
      await actions.refreshMusic(false);
    } catch (error) {
      console.error('Error stopping player:', error);
    }
  };
  
  // Disconnect from Bluetooth
  const handleDisconnectBluetooth = async () => {
    try {
      setIsConnectingBluetooth(true);
      await actions.controlMusic('disconnectBluetooth');
      await actions.refreshMusic(false);
      setBluetoothStatus('disconnected');
    } catch (error) {
      console.error('Error disconnecting from Bluetooth:', error);
    } finally {
      setIsConnectingBluetooth(false);
    }
  };
  
  // Send control command
  const handleCommand = async (command) => {
    if (!isPlayerOn()) return;
    
    try {
      await actions.controlMusic('command', { command, silent: true });
      
      // Give the command time to take effect
      setTimeout(() => {
        // Use silent mode for automatic refresh after command
        actions.refreshMusic(false);
      }, 1000);
    } catch (error) {
      console.error(`Error sending command ${command}:`, error);
    }
  };
  
  // Change station
  const handleChangeStation = async () => {
    if (!selectedStation || !isPlayerOn()) return;
    
    try {
      // Log the selected station for debugging
      console.log('Changing to station:', selectedStation);
      
      // Check if we have station IDs available (from CSV)
      const stationIds = music.stations?.stationIds;
      const index = parseInt(selectedStation, 10);
      
      if (Array.isArray(stationIds) && stationIds.length > index) {
        // We have actual station IDs, use the direct station ID
        console.log(`Using direct station ID: ${stationIds[index]}`);
        await actions.controlMusic('command', { command: `s ${stationIds[index]}`, silent: true });
      } else {
        // Fallback to using index
        console.log(`Using station index: ${index}`);
        await actions.controlMusic('command', { command: `s ${index}`, silent: true });
      }
      
      // Give the station change time to take effect and attempt multiple refreshes
      // First refresh after 2 seconds
      setTimeout(() => {
        actions.refreshMusic(false);
        
        // Second refresh after 5 seconds (total 7s delay)
        setTimeout(() => {
          actions.refreshMusic(false);
          
          // Third refresh after 10 seconds (total 17s delay)
          setTimeout(() => {
            actions.refreshMusic(false);
          }, 10000);
        }, 5000);
      }, 2000);
    } catch (error) {
      console.error('Error changing station:', error);
    }
  };
  
  // Get current song info
  const getSongInfo = () => {
    if (!music.status) {
      return { song: 'Not Playing', artist: '', album: '', station: '' };
    }
    
    return {
      song: music.status.song || 'Not Playing',
      artist: music.status.artist || '',
      album: music.status.album || '',
      station: music.status.station || '',
      stationId: music.status.stationId || '',
    };
  };
  
  const { song, artist, album, station } = getSongInfo();
  
  // Calculate progress percentage if we have the data
  const getProgressPercent = () => {
    if (!music.status || !music.status.startTime || !music.status.expectedEndTime) {
      return 0;
    }
    
    const startTime = music.status.startTime;
    const endTime = music.status.expectedEndTime;
    const now = Date.now() / 1000; // Convert to seconds
    
    if (now >= endTime) return 100;
    
    const totalDuration = endTime - startTime;
    const elapsed = now - startTime;
    
    return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  };
  
  const progressPercent = getProgressPercent();
  
  // Get the appropriate Bluetooth status display info
  const getBluetoothStatusInfo = () => {
    if (isConnectingBluetooth) {
      return {
        text: 'Connecting to Klipsch The Fives...',
        colorClass: 'text-amber-600',
        showProgress: true,
        showReconnectButton: false
      };
    }
    
    if (music.status?.isBluetoothConnected) {
      return {
        text: 'Connected to Klipsch The Fives ✓',
        colorClass: 'text-green-600',
        showProgress: false,
        showReconnectButton: false
      };
    }
    
    if (isPlayerOn() && !music.status?.isBluetoothConnected) {
      return {
        text: 'Not Connected to Speakers',
        colorClass: 'text-amber-600',
        showProgress: false,
        showReconnectButton: true
      };
    }
    
    return {
      text: 'Not Connected',
      colorClass: 'text-gray-600',
      showProgress: false,
      showReconnectButton: false
    };
  };
  
  const bluetoothStatusInfo = getBluetoothStatusInfo();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Monty's Music Player</h1>
      
      {/* Error Display */}
      {music.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Connection Error</p>
          <p>{music.message || "Could not connect to music player. Please check your connection."}</p>
        </div>
      )}
      
      {/* Loading Indicator */}
      {music.loading && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          Loading music player status...
        </div>
      )}
      
      {/* Bluetooth Connection Panel */}
      <div className="bg-white p-6 rounded shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Bluetooth Speaker</h2>
          <div>
            {music.status?.isBluetoothConnected ? (
              <button 
                onClick={handleDisconnectBluetooth}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
                disabled={isConnectingBluetooth}
              >
                Disconnect
              </button>
            ) : (
              <button 
                onClick={handleConnectBluetooth}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                disabled={isConnectingBluetooth}
              >
                {isConnectingBluetooth ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
        </div>
        
        <div className="mb-2">
          <p className={`${bluetoothStatusInfo.colorClass}`}>
            <span className="font-semibold">Status:</span> {bluetoothStatusInfo.text}
          </p>
          {bluetoothStatusInfo.showProgress && (
            <div className="mt-1">
              <p className="text-sm text-amber-600 animate-pulse">
                <span className="inline-block mr-2">⚠️</span>
                Waking up speakers from sleep mode - may take up to 30 seconds
              </p>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}
        </div>
        
        <div className="text-sm text-gray-600 mt-2">
          <p>The Klipsch The Fives speakers go into deep sleep mode when inactive. Connecting may take 20-40 seconds when waking them up.</p>
        </div>
      </div>
      
      {/* Music Player Controls */}
      <div className="bg-white p-6 rounded shadow">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            Player Status: {isPlayerOn() ? (isPlaying() ? 'Playing' : 'Paused') : 'Off'}
          </h2>
          {isPlayerOn() ? (
            <button 
              onClick={handleStopPlayer}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
              disabled={music.loading}
            >
              Turn Off
            </button>
          ) : (
            <button 
              onClick={handleStartPlayer}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
              disabled={music.loading || showConnectingMessage}
            >
              {showConnectingMessage ? 'Starting Player...' : 'Turn On'}
            </button>
          )}
        </div>
        
        {/* Song Info (Hidden when player is off) */}
        <div className={isPlayerOn() ? '' : 'opacity-50'}>
          <div className="mb-4">
            <p className="text-lg font-semibold">Now Playing</p>
            <p className="text-xl font-bold">{song}</p>
            <p>{artist}</p>
            <p className="text-sm text-gray-600">Album: {album}</p>
            <p className="text-sm text-gray-600">Station: {station}</p>
          </div>
          
          {/* Progress Bar */}
          {isPlayerOn() && (
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-blue-500" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          )}
          
          {/* Playback Controls */}
          <div className="flex space-x-4 my-4">
            <button 
              onClick={() => handleCommand('+')}
              className={`p-2 rounded-full ${
                isPlayerOn() 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isPlayerOn()}
              title="Love This Song"
            >
              ❤️
            </button>
            <button 
              onClick={() => handleCommand(isPlaying() ? 'p' : 'P')}
              className={`p-2 rounded-full ${
                isPlayerOn() 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isPlayerOn()}
              title={isPlaying() ? 'Pause' : 'Play'}
            >
              {isPlaying() ? '⏸️' : '▶️'}
            </button>
            <button 
              onClick={() => handleCommand('n')}
              className={`p-2 rounded-full ${
                isPlayerOn() 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isPlayerOn()}
              title="Next Song"
            >
              ⏭️
            </button>
            <button 
              onClick={() => actions.refreshMusic()}
              className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full"
              title="Refresh Status"
            >
              🔄
            </button>
          </div>
          
          {/* Station Selector */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Select Station</label>
              {music.message && (
                <span className="text-xs text-amber-600">
                  {music.message}
                </span>
              )}
              {(!isPlayerOn() || !Array.isArray(music.stations) || music.stations.length === 0) && !music.message && (
                <span className="text-xs text-amber-600">
                  {isPlayerOn() ? 'Waiting for stations...' : 'Turn on player to see your stations'}
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              <select 
                className={`block w-full p-2 border rounded ${!isPlayerOn() ? 'bg-gray-100' : ''}`}
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                disabled={!isPlayerOn() || music.loading || !Array.isArray(music.stations) || music.stations.length === 0}
              >
                <option value="">Select a station...</option>
                {Array.isArray(music.stations) && music.stations.map((station, index) => {
                  // Use index as the station identifier
                  return (
                    <option key={index} value={index}>{station}</option>
                  );
                })}
              </select>
              <button
                onClick={handleChangeStation}
                className={`px-4 py-2 rounded ${
                  isPlayerOn() && selectedStation 
                    ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!isPlayerOn() || !selectedStation}
              >
                Change
              </button>
            </div>
          </div>
          
          {/* Bluetooth Status */}
          {isPlayerOn() && !music.status?.isBluetoothConnected && !isConnectingBluetooth && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
              <p className="text-amber-700 text-sm font-medium mb-2">
                <span className="inline-block mr-1">⚠️</span>
                Bluetooth connection issue detected
              </p>
              <p className="text-amber-600 text-xs mb-2">
                The speakers may be in sleep mode. Music will not play until Bluetooth is connected.
              </p>
              <button 
                onClick={handleConnectBluetooth}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded"
                disabled={isConnectingBluetooth}
              >
                Connect to Speakers
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Usage Instructions */}
      <div className="mt-6 bg-gray-50 p-4 rounded border">
        <h3 className="font-semibold mb-2">How to Use:</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>First, connect to the Bluetooth speaker by clicking "Connect" in the Bluetooth section</li>
          <li>Once speakers are connected, turn on the music player</li>
          <li>Use the playback controls to skip songs or pause music</li>
          <li>Heart a song to tell Pandora you like it</li>
          <li>Change stations using the selector</li>
          <li>Turn off the player when done to disconnect from Bluetooth</li>
        </ol>
      </div>
    </div>
  );
}

export default MusicPage;