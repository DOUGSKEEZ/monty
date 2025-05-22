import React, { useState, useEffect } from 'react';
import { useAppContext } from '../utils/AppContext';

function PianobarPage() {
  // Get state from context
  const { pianobar, actions } = useAppContext();
  
  // Component state
  const [selectedStation, setSelectedStation] = useState('');
  const [showOperationMessage, setShowOperationMessage] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');
  
  // Update selected station when pianobar status changes
  useEffect(() => {
    if (pianobar.status && pianobar.status.stationId) {
      setSelectedStation(pianobar.status.stationId);
    }
  }, [pianobar.status]);
  
  // Check pianobar status when component mounts
  useEffect(() => {
    // Initial status check
    actions.refreshPianobar();
  }, []);
  
  // Helper to check if player is on
  const isPlayerOn = () => {
    return pianobar.isRunning;
  };
  
  // Helper to check if player is playing
  const isPlaying = () => {
    return isPlayerOn() && pianobar.isPlaying;
  };
  
  // Start the player
  const handleStartPlayer = async () => {
    showOperation('Starting Pandora player...');
    
    try {
      const result = await actions.controlPianobar('start');
      if (result) {
        console.log('Pianobar started successfully');
      } else {
        console.error('Failed to start pianobar');
      }
      
      // Refresh pianobar status after starting
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error starting player:', error);
    } finally {
      hideOperation();
    }
  };
  
  // Stop the player
  const handleStopPlayer = async () => {
    showOperation('Stopping Pandora player...');
    
    try {
      const result = await actions.controlPianobar('stop');
      if (result) {
        console.log('Pianobar stopped successfully');
      } else {
        console.error('Failed to stop pianobar');
      }
      
      // Refresh pianobar status after stopping
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error stopping player:', error);
    } finally {
      hideOperation();
    }
  };
  
  // Send control command
  const handleCommand = async (command) => {
    if (!isPlayerOn()) return;
    
    try {
      await actions.controlPianobar('command', { command });
      
      // Refresh pianobar status after command
      await actions.refreshPianobar();
    } catch (error) {
      console.error(`Error sending command ${command}:`, error);
    }
  };
  
  // Change station
  const handleChangeStation = async () => {
    if (!selectedStation || !isPlayerOn()) return;
    
    showOperation('Changing station...');
    
    try {
      const result = await actions.controlPianobar('selectStation', { stationId: selectedStation });
      if (result) {
        console.log('Station changed successfully');
      } else {
        console.error('Failed to change station');
      }
      
      // Refresh pianobar status after changing station
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error changing station:', error);
    } finally {
      hideOperation();
    }
  };
  
  // Play/pause
  const handlePlayPause = async () => {
    if (!isPlayerOn()) return;
    
    try {
      if (isPlaying()) {
        await actions.controlPianobar('pause');
      } else {
        await actions.controlPianobar('play');
      }
      
      // Refresh pianobar status after play/pause
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };
  
  // Skip to next song
  const handleNext = async () => {
    if (!isPlayerOn()) return;
    
    try {
      await actions.controlPianobar('next');
      
      // Refresh pianobar status after skipping
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error skipping song:', error);
    }
  };
  
  // Love current song
  const handleLove = async () => {
    if (!isPlayerOn()) return;
    
    try {
      await actions.controlPianobar('love');
      
      // Refresh pianobar status after loving
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error loving song:', error);
    }
  };
  
  // Get current song info
  const getSongInfo = () => {
    if (!pianobar.status) {
      return { song: 'Not Playing', artist: '', album: '', station: '' };
    }
    
    return {
      song: pianobar.status.song || 'Not Playing',
      artist: pianobar.status.artist || '',
      album: pianobar.status.album || '',
      station: pianobar.status.station || '',
    };
  };
  
  // Helper to show operation message
  const showOperation = (message) => {
    setOperationMessage(message);
    setShowOperationMessage(true);
  };
  
  // Helper to hide operation message
  const hideOperation = () => {
    setShowOperationMessage(false);
  };
  
  const { song, artist, album, station } = getSongInfo();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Pandora Music Player</h1>
      
      {/* Error Display */}
      {pianobar.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{pianobar.error}</p>
        </div>
      )}
      
      {/* Loading Indicator */}
      {pianobar.loading && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          Loading player status...
        </div>
      )}
      
      {/* Operation Message */}
      {showOperationMessage && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          {operationMessage}
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
              disabled={pianobar.loading || showOperationMessage}
            >
              Turn Off
            </button>
          ) : (
            <button 
              onClick={handleStartPlayer}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
              disabled={pianobar.loading || showOperationMessage}
            >
              {showOperationMessage ? 'Starting Player...' : 'Turn On'}
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
          
          {/* Playback Controls */}
          <div className="flex space-x-4 my-4">
            <button 
              onClick={handleLove}
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
              onClick={handlePlayPause}
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
              onClick={handleNext}
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
              onClick={() => actions.refreshPianobar()}
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
              {(!isPlayerOn() || !Array.isArray(pianobar.stations) || pianobar.stations.length === 0) && (
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
                disabled={!isPlayerOn() || pianobar.loading || !Array.isArray(pianobar.stations) || pianobar.stations.length === 0}
              >
                <option value="">Select a station...</option>
                {Array.isArray(pianobar.stations) && pianobar.stations.map((station, index) => (
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
        </div>
      </div>
      
      {/* Usage Instructions */}
      <div className="mt-6 bg-gray-50 p-4 rounded border">
        <h3 className="font-semibold mb-2">How to Use:</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Turn on the music player using the "Turn On" button</li>
          <li>Use the playback controls to skip songs or pause music</li>
          <li>Heart a song to tell Pandora you like it</li>
          <li>Change stations using the selector</li>
          <li>Turn off the player when done</li>
        </ol>
      </div>
    </div>
  );
}

export default PianobarPage;