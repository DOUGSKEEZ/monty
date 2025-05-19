import React, { useState, useEffect } from 'react';
import { useAppContext } from '../utils/AppContext';

function MusicPage() {
  const { music, actions } = useAppContext();
  const [selectedStation, setSelectedStation] = useState('');
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);
  const [showConnectingMessage, setShowConnectingMessage] = useState(false);
  
  // Update selected station when music status changes
  useEffect(() => {
    if (music.status && music.status.stationId) {
      setSelectedStation(music.status.stationId);
    }
  }, [music.status]);
  
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
  
  // Start the player
  const handleStartPlayer = async () => {
    setShowConnectingMessage(true);
    
    try {
      // First connect to Bluetooth
      setIsConnectingBluetooth(true);
      await actions.controlMusic('connectBluetooth');
      setIsConnectingBluetooth(false);
      
      // Then start player (use silent mode to reduce console noise)
      await actions.controlMusic('start', { connectBluetooth: false, silent: true });
      
      // Refresh music status (silent mode for background refresh)
      await actions.refreshMusic(false);
    } catch (error) {
      console.error('Error starting player:', error);
    } finally {
      setShowConnectingMessage(false);
    }
  };
  
  // Stop the player
  const handleStopPlayer = async () => {
    try {
      // Use silent mode to reduce console noise
      await actions.controlMusic('stop', { disconnectBluetooth: true, silent: true });
      // Use silent mode for refresh after stopping
      await actions.refreshMusic(false);
    } catch (error) {
      console.error('Error stopping player:', error);
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
      await actions.controlMusic('command', { command: `s ${selectedStation}`, silent: true });
      
      // Give the station change time to take effect
      setTimeout(() => {
        // Use silent mode for automatic refresh after station change
        actions.refreshMusic(false);
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

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Monty's Pianobar</h1>
      
      {/* Error Display */}
      {music.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Could not connect to music player. Please check your connection.
        </div>
      )}
      
      {/* Loading Indicator */}
      {music.loading && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          Loading music player status...
        </div>
      )}
      
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
              {showConnectingMessage ? (
                isConnectingBluetooth ? 'Connecting to Speakers...' : 'Starting Player...'
              ) : (
                'Turn On'
              )}
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
              {music.stations && music.stations.mock && (
                <span className="text-xs text-amber-600">
                  {music.stations.message || (isPlayerOn() ? 'Loading stations...' : 'Turn on player to see your stations')}
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              <select 
                className={`block w-full p-2 border rounded ${!isPlayerOn() ? 'bg-gray-100' : ''}`}
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                disabled={!isPlayerOn() || music.loading || !music.stations || !music.stations.stations || music.stations.stations.length === 0}
              >
                <option value="">Select a station...</option>
                {music.stations && music.stations.stations && music.stations.stations.map((station, index) => (
                  <option key={index} value={index}>{station}</option>
                ))}
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
          <div className="mt-6 text-sm text-gray-600">
            <p>
              <span className="font-semibold">Bluetooth Status:</span> {
                music.status?.isBluetoothConnected 
                  ? 'Connected to Klipsch The Fives' 
                  : 'Not Connected'
              }
            </p>
          </div>
        </div>
      </div>
      
      {/* Usage Instructions */}
      <div className="mt-6 bg-gray-50 p-4 rounded border">
        <h3 className="font-semibold mb-2">How to Use:</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Turn on the player to connect to your Bluetooth speaker and start Pandora</li>
          <li>Use the playback controls to skip songs or pause music</li>
          <li>Heart a song to tell Pandora you like it</li>
          <li>Change stations using the selector below</li>
          <li>Turn off the player when done to disconnect from Bluetooth</li>
        </ol>
      </div>
    </div>
  );
}

export default MusicPage;