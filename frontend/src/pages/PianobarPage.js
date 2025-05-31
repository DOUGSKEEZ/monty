import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../utils/AppContext';

function PianobarPage() {
  // Get state from context
  const { pianobar, currentSong, bluetooth, actions } = useAppContext();
  
  // Component state
  const [selectedStation, setSelectedStation] = useState('');
  const [showOperationMessage, setShowOperationMessage] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');
  const [buttonLocked, setButtonLocked] = useState(false);
  const [buttonAction, setButtonAction] = useState(null); // 'starting' or 'stopping'
  
  // Love animation state
  const [isAnimatingLove, setIsAnimatingLove] = useState(false);
  
  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  
  // Version tracking for STATE_UPDATE messages
  const lastVersionRef = useRef(-1);

  // Bluetooth Progress Bar State
  const [bluetoothProgress, setBluetoothProgress] = useState(0);
  const [bluetoothProgressComplete, setBluetoothProgressComplete] = useState(false);
  const bluetoothProgressStartTime = useRef(null);
  const bluetoothAnimationFrameId = useRef(null);

  // Helper functions (moved to top to avoid hoisting issues)
  const isPlayerOn = () => {
    return pianobar.isRunning;
  };

  const isPlaying = () => {
    return isPlayerOn() && pianobar.isPlaying;
  };

  // Format time in MM:SS format
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Update selected station when pianobar status changes
  useEffect(() => {
    if (pianobar.status && pianobar.status.stationId) {
      setSelectedStation(pianobar.status.stationId);
    }
  }, [pianobar.status]);

  // Real-time progress tracking - increment songPlayed every second while playing
  useEffect(() => {
    let progressInterval = null;
    
    if (isPlayerOn() && isPlaying() && currentSong.songDuration > 0) {
      progressInterval = setInterval(() => {
        actions.updateCurrentSong({
          songPlayed: Math.min(currentSong.songPlayed + 1, currentSong.songDuration)
        });
      }, 1000);
    }
    
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, [isPlayerOn(), isPlaying(), currentSong.songDuration, actions]);
  
  // Log what song is being displayed in the UI
  useEffect(() => {
    if (currentSong.title && currentSong.artist) {
      console.log('🎵 [SONG-DISPLAY] UI now showing:', currentSong.title, 'by', currentSong.artist);
    }
  }, [currentSong.title, currentSong.artist]);
  
  // Check pianobar status when component mounts
  useEffect(() => {
    // Force fresh state for mobile/tablets
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      // Clear any potentially cached state
      actions.updatePianobarStatus({
        isRunning: null,
        isPlaying: null,
        status: null
      });
    }
    
    // Initial status check
    actions.refreshPianobar();
    
    // If WebSocket isn't connected after 2 seconds, refresh again
    setTimeout(() => {
      if (!wsConnected) {
        actions.refreshPianobar();
      }
    }, 2000);
    
    // Request current state from WebSocket when it connects
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'GET_STATE' }));
    }
  }, []);
  
  // Setup WebSocket connection for real-time updates
  useEffect(() => {
    let websocket = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 seconds
    
    const connectWebSocket = () => {
      try {
        // Create WebSocket connection
        websocket = new WebSocket(`ws://${window.location.hostname}:3001/api/pianobar/ws`);
        
        websocket.onopen = () => {
          setWsConnected(true);
          reconnectAttempts = 0; // Reset counter on successful connection
          
          // Immediately request current state
          websocket.send(JSON.stringify({ type: 'GET_STATE' }));
          
          // Also refresh via API as backup
          actions.refreshPianobar();
        };
        
        websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'status') {
        // Update player status
        actions.updatePianobarStatus({
          isRunning: data.data.isPianobarRunning || (data.data.status !== 'stopped'),
          isPlaying: data.data.status === 'playing',
          status: {
            ...pianobar.status,
            status: data.data.status
          }
        });
      } else if (data.type === 'event') {
        if (data.data.eventType === 'songstart') {
          console.log('🎵 [SONG-CHANGE] New song from WebSocket:', data.data.title, 'by', data.data.artist);
          
          // Update current song info in AppContext (persists across navigation)
          actions.updateCurrentSong({
            title: data.data.title || '',
            artist: data.data.artist || '',
            album: data.data.album || '',
            stationName: data.data.stationName || '',
            songDuration: parseInt(data.data.songDuration) || 0,
            songPlayed: parseInt(data.data.songPlayed) || 0,
            rating: parseInt(data.data.rating) || 0,
            coverArt: data.data.coverArt || '',
            detailUrl: data.data.detailUrl || '',
            lastSongStartTimestamp: Date.now() // Add timestamp for event ordering
          });
          
          // Also update in global state for consistency
          actions.updatePianobarStatus({
            status: {
              ...pianobar.status,
              song: data.data.title,
              artist: data.data.artist,
              album: data.data.album,
              station: data.data.stationName
            }
          });
        } else if (data.data.eventType === 'usergetstations' && data.data.stations) {
          // Update station list dynamically
          const stationList = parseStationList(data.data.stations);
          if (stationList && stationList.length > 0) {
            actions.updatePianobarStations(stationList.map(station => station.name));
          }
        } else if (data.data.eventType === 'songlove') {
          // Update rating in AppContext
          actions.updateCurrentSong({ rating: 1 });
        } else if (data.data.eventType === 'songfinish') {
          // Do NOT update UI state with songfinish events
          // This prevents old song data from overriding current song information
        } else if (data.data.eventType === 'stationchange') {
          // Station change handling
        }
      } else if (data.type === 'STATE_UPDATE') {
        // Check version to prevent out-of-order updates
        const newVersion = data.data.version || 0;
        const currentVersion = lastVersionRef.current;
        
        if (newVersion > currentVersion) {
          // Accept this update
          lastVersionRef.current = newVersion;
          
          // Update pianobar state from server central state
          actions.updatePianobarStatus({
            isRunning: data.data.player.isRunning,
            isPlaying: data.data.player.isPlaying,
            status: {
              ...pianobar.status,
              status: data.data.player.status
            }
          });
          
          // Update currentSong state from server central state
          const songFromState = data.data.currentSong;
          if (songFromState && (songFromState.title || songFromState.artist)) {
            console.log('🎵 [SONG-CHANGE] Song from STATE_UPDATE:', songFromState.title, 'by', songFromState.artist);
          }
          
          // 🚫👻 RACE CONDITION PROTECTION: Add timestamp to STATE_UPDATE song data
          // This ensures updateCurrentSong can reject old data if a newer songstart event already arrived
          actions.updateCurrentSong({
            title: data.data.currentSong.title || '',
            artist: data.data.currentSong.artist || '',
            album: data.data.currentSong.album || '',
            stationName: data.data.currentSong.stationName || '',
            songDuration: parseInt(data.data.currentSong.songDuration) || 0,
            songPlayed: parseInt(data.data.currentSong.songPlayed) || 0,
            rating: parseInt(data.data.currentSong.rating) || 0,
            coverArt: data.data.currentSong.coverArt || '',
            detailUrl: data.data.currentSong.detailUrl || '',
            // Add timestamp from server data or current time (will be older than recent songstart events)
            lastUpdated: data.data.timestamp || Date.now() - 1000 // Slightly older to prioritize songstart events
          });
        }
      }
    };
    
        websocket.onclose = () => {
          setWsConnected(false);
          
          // Attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            
            reconnectTimer = setTimeout(() => {
              connectWebSocket();
            }, reconnectDelay);
          }
        };
        
        websocket.onerror = (error) => {
          setWsConnected(false);
        };
        
        wsRef.current = websocket;
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setWsConnected(false);
        
        // Retry connection if we haven't exceeded max attempts
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          reconnectTimer = setTimeout(() => {
            connectWebSocket();
          }, reconnectDelay);
        }
      }
    };
    
    // Initial connection attempt
    connectWebSocket();
    
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (websocket) {
        websocket.close();
      }
    };
  }, []);
  
  // Bluetooth Progress Bar Animation
  useEffect(() => {
    // "System Startup" realistic progress function with checkpoint pauses
    const getSystemStartupProgress = (elapsed) => {
      const maxTime = 22000; // 22 seconds total
      const maxProgress = 90; // Stop at 90% until audio ready
      
      if (elapsed >= maxTime) return maxProgress;
      
      // System Startup Phases:
      // Phase 1: Quick early tasks (0% → 20% in 2 seconds)
      // Phase 2: Pause at 20% for 500ms
      // Phase 3: Normal speed (20% → 45% in 6 seconds)  
      // Phase 4: Pause at 45% for 500ms
      // Phase 5: Normal speed (45% → 65% in 6 seconds)
      // Phase 6: Pause at 65% for 500ms  
      // Phase 7: Final phase (65% → 90% in 7 seconds)
      
      const phase1End = 2000;    // 2s - Quick setup
      const pause1End = 2500;    // 500ms pause at 20%
      const phase3End = 8500;    // 6s normal speed
      const pause2End = 9000;    // 500ms pause at 45%
      const phase5End = 15000;   // 6s normal speed  
      const pause3End = 15500;   // 500ms pause at 65%
      const phase7End = 22000;   // 7s final phase
      
      if (elapsed <= phase1End) {
        // Phase 1: Quick early tasks (0% → 20%)
        return (elapsed / phase1End) * 20;
      }
      else if (elapsed <= pause1End) {
        // Phase 2: Pause at 20%
        return 20;
      }
      else if (elapsed <= phase3End) {
        // Phase 3: Normal speed (20% → 45%)
        const phaseElapsed = elapsed - pause1End;
        const phaseDuration = phase3End - pause1End;
        return 20 + ((phaseElapsed / phaseDuration) * 25);
      }
      else if (elapsed <= pause2End) {
        // Phase 4: Pause at 45%
        return 45;
      }
      else if (elapsed <= phase5End) {
        // Phase 5: Normal speed (45% → 65%)
        const phaseElapsed = elapsed - pause2End;
        const phaseDuration = phase5End - pause2End;
        return 45 + ((phaseElapsed / phaseDuration) * 20);
      }
      else if (elapsed <= pause3End) {
        // Phase 6: Pause at 65%
        return 65;
      }
      else {
        // Phase 7: Final phase (65% → 90%)
        const phaseElapsed = elapsed - pause3End;
        const phaseDuration = phase7End - pause3End;
        return 65 + ((phaseElapsed / phaseDuration) * 25);
      }
    };
    
    const animateProgress = () => {
      // PRIORITY 1: Check if connection completed first
      if (bluetooth.isConnected) {
        console.log('🎯 Bluetooth connected - instant completion!');
        setBluetoothProgress(100);
        setBluetoothProgressComplete(true);
        if (bluetoothAnimationFrameId.current) {
          cancelAnimationFrame(bluetoothAnimationFrameId.current);
          bluetoothAnimationFrameId.current = null;
        }
        return;
      }
      
      if (!bluetooth.connectionInProgress) {
        // Not connecting - clear animation
        if (bluetoothAnimationFrameId.current) {
          cancelAnimationFrame(bluetoothAnimationFrameId.current);
          bluetoothAnimationFrameId.current = null;
        }
        bluetoothProgressStartTime.current = null;
        setBluetoothProgress(0);
        setBluetoothProgressComplete(false);
        return;
      }
      
      // Start timing if not already started
      if (!bluetoothProgressStartTime.current) {
        bluetoothProgressStartTime.current = Date.now();
      }
      
      const elapsed = Date.now() - bluetoothProgressStartTime.current;
      const newProgress = getSystemStartupProgress(elapsed);
      
      setBluetoothProgress(newProgress);
      
      // Continue animation if still connecting and not at 100%
      if (bluetooth.connectionInProgress && newProgress < 100) {
        bluetoothAnimationFrameId.current = requestAnimationFrame(animateProgress);
      }
    };
    
    // PRIORITY 1: Check if connection completed first
    if (bluetooth.isConnected) {
      console.log('🎯 Bluetooth connected - instant completion!');
      setBluetoothProgress(100);
      setBluetoothProgressComplete(true);
      localStorage.removeItem('bluetooth-progress-start');
      if (bluetoothAnimationFrameId.current) {
        cancelAnimationFrame(bluetoothAnimationFrameId.current);
        bluetoothAnimationFrameId.current = null;
      }
      return; // Exit early - don't continue animation
    }
    
    // PRIORITY 2: Start or continue animation if connecting
    if (bluetooth.connectionInProgress) {
      // Store start time to survive navigation
      const storageKey = 'bluetooth-progress-start';
      if (!bluetoothProgressStartTime.current) {
        const storedStartTime = localStorage.getItem(storageKey);
        if (storedStartTime) {
          bluetoothProgressStartTime.current = parseInt(storedStartTime, 10);
        } else {
          bluetoothProgressStartTime.current = Date.now();
          localStorage.setItem(storageKey, bluetoothProgressStartTime.current.toString());
        }
      }
      
      animateProgress();
    } else {
      // PRIORITY 3: Connection stopped - clean up
      localStorage.removeItem('bluetooth-progress-start');
      if (bluetoothAnimationFrameId.current) {
        cancelAnimationFrame(bluetoothAnimationFrameId.current);
        bluetoothAnimationFrameId.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (bluetoothAnimationFrameId.current) {
        cancelAnimationFrame(bluetoothAnimationFrameId.current);
      }
    };
  }, [bluetooth.connectionInProgress, bluetooth.isConnected]);
  
  // Cleanup Effect: Reset progress bar state on disconnect/reconnect cycles
  useEffect(() => {
    // Reset progress when connection stops (connectionInProgress goes false)
    if (!bluetooth.connectionInProgress && bluetoothProgress > 0 && bluetoothProgress < 100) {
      console.log('🔄 Connection stopped - resetting progress bar to 0%');
      setBluetoothProgress(0);
      setBluetoothProgressComplete(false);
      bluetoothProgressStartTime.current = null;
    }
    
    // Reset progress when Bluetooth disconnects (isConnected goes false)
    if (!bluetooth.isConnected && bluetoothProgressComplete) {
      console.log('🔌 Bluetooth disconnected - resetting progress bar state');
      setTimeout(() => {
        setBluetoothProgress(0);
        setBluetoothProgressComplete(false);
        bluetoothProgressStartTime.current = null;
      }, 1000); // Small delay for visual feedback
    }
    
    // Start fresh when starting a new connection attempt
    if (bluetooth.connectionInProgress && bluetoothProgress === 0 && !bluetoothProgressStartTime.current) {
      console.log('🚀 New connection attempt - ensuring fresh start at 0%');
      setBluetoothProgress(0);
      setBluetoothProgressComplete(false);
    }
  }, [bluetooth.connectionInProgress, bluetooth.isConnected, bluetoothProgress, bluetoothProgressComplete]);
  
  // Helper function to parse station list
  const parseStationList = (stationsData) => {
    if (Array.isArray(stationsData)) {
      return stationsData.map((station, index) => ({
        id: station.id || index.toString(),
        name: station.name || `Station ${index}`
      }));
    }
    
    if (typeof stationsData === 'string') {
      // Parse the station list from pianobar format
      // Expected format: "0) Station Name\n1) Another Station\n..."
      const lines = stationsData.split('\n').filter(line => line.trim());
      return lines.map(line => {
        const match = line.match(/^(\d+)\)\s+(.+)$/);
        if (match) {
          return { id: match[1], name: match[2] };
        }
        return null;
      }).filter(Boolean);
    }
    
    return [];
  };
  
  // Start the player
  const handleStartPlayer = async () => {
    // Prevent rapid clicking
    if (buttonLocked || showOperationMessage) {
      console.log('⚠️ Button locked or operation in progress, ignoring click');
      return;
    }

    console.log('🟢 handleStartPlayer called - STARTING pianobar');
    console.log('Player state before start:', {
      'pianobar.isRunning': pianobar.isRunning,
      'isPlayerOn()': isPlayerOn()
    });
    
    setButtonLocked(true);
    setButtonAction('starting');
    showOperation('Starting Pandora player...');
    
    try {
      const result = await actions.controlPianobar('start');
      if (result) {
        console.log('Pianobar started successfully');
      } else {
        console.error('Failed to start pianobar');
      }
      
      // Wait a moment before refreshing to avoid race conditions
      await new Promise(resolve => setTimeout(resolve, 1000));
      await actions.refreshPianobar();
    } catch (error) {
      console.error('Error starting player:', error);
    } finally {
      hideOperation();
      setTimeout(() => {
        setButtonLocked(false);
        setButtonAction(null);
      }, 2000); // Keep locked for 2 more seconds
    }
  };
  
  // Stop the player
  const handleStopPlayer = async () => {
    console.log('🔴🔴🔴 handleStopPlayer FUNCTION CALLED!');
    
    // Prevent rapid clicking
    if (buttonLocked || showOperationMessage) {
      console.log('⚠️ Button locked or operation in progress, ignoring click');
      return;
    }

    console.log('🔴 handleStopPlayer called - STOPPING pianobar');
    console.log('Player state before stop:', {
      'pianobar.isRunning': pianobar.isRunning,
      'isPlayerOn()': isPlayerOn()
    });
    
    setButtonLocked(true);
    setButtonAction('stopping');
    showOperation('Stopping Pandora player...');
    
    try {
      const result = await actions.controlPianobar('stop');
      if (result) {
        console.log('Pianobar stopped successfully');
        
        // ADD THIS: Force immediate state update
        actions.updatePianobarStatus({
          isRunning: false,
          isPlaying: false,
          status: {
            ...pianobar.status,
            status: 'stopped'
          }
        });
        console.log('Forced local state update to stopped');
      } else {
        console.error('Failed to stop pianobar');
      }
      
      // REMOVE the refresh that might be overwriting our state
      // Comment out or remove these lines:
      // await new Promise(resolve => setTimeout(resolve, 1000));
      // await actions.refreshPianobar();
      
      // Instead, just wait a bit for UI to settle
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('Player state after local update:', {
        'pianobar.isRunning': pianobar.isRunning,
        'isPlayerOn()': isPlayerOn()
      });
    } catch (error) {
      console.error('Error stopping player:', error);
    } finally {
      hideOperation();
      setTimeout(() => {
        setButtonLocked(false);
        setButtonAction(null);
        console.log('Button unlocked, final state:', {
          'pianobar.isRunning': pianobar.isRunning,
          'isPlayerOn()': isPlayerOn()
        });
      }, 2000); // Keep locked for 2 more seconds
    }
  };

  // Change station
  const handleChangeStation = async () => {
    if (!selectedStation || !isPlayerOn()) return;
    
    showOperation('Changing station...');
    
    try {
      // Always use the REST API for commands
      const result = await actions.controlPianobar('selectStation', { stationId: selectedStation });
      console.log('Sent select-station command via REST API');
      
      if (result) {
        console.log('Station changed successfully');
      } else {
        console.error('Failed to change station');
      }
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
        // Always use the REST API for commands
        await actions.controlPianobar('pause');
        console.log('Sent pause command via REST API');
      } else {
        await actions.controlPianobar('play');
        console.log('Sent play command via REST API');
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };
  
  // Skip to next song
  const handleNext = async () => {
    if (!isPlayerOn()) return;
    
    try {
      // Always use the REST API for commands
      await actions.controlPianobar('next');
      console.log('Sent next command via REST API');
    } catch (error) {
      console.error('Error skipping song:', error);
    }
  };
  
  // Love current song
  const handleLove = async () => {
    if (!isPlayerOn()) return;
    
    // 🎯 OPTIMISTIC UI - Immediate visual feedback!
    setIsAnimatingLove(true);
    actions.updateCurrentSong({ rating: 1 });
    
    // Remove animation class after animation completes
    setTimeout(() => setIsAnimatingLove(false), 800);
    
    try {
      // Send REST command in background
      await actions.controlPianobar('love');
      console.log('❤️ Love command sent via REST API');
    } catch (error) {
      console.error('Error loving song:', error);
      // Revert optimistic update on failure
      actions.updateCurrentSong({ rating: 0 });
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

  // Bluetooth connection handlers
  const handleConnectBluetooth = async () => {
    // Don't allow multiple connection attempts
    if (bluetooth.connectionInProgress || bluetooth.disconnecting) {
      console.log('Connection already in progress, ignoring click');
      return;
    }
    
    console.log('Starting Bluetooth connection process...');
    
    try {
      const result = await actions.connectBluetooth();
      console.log('Connect result:', result);
      
      if (result) {
        console.log('Bluetooth connection successful');
      } else {
        console.warn('Bluetooth connection failed or timed out');
      }
    } catch (error) {
      console.error('Error connecting to Bluetooth:', error);
    }
  };

  const handleDisconnectBluetooth = async () => {
    // Don't allow multiple disconnect attempts
    if (bluetooth.disconnecting || bluetooth.connectionInProgress) {
      console.log('Operation already in progress, ignoring disconnect click');
      return;
    }
    
    console.log('Disconnecting from Bluetooth speakers...');
    
    try {
      const result = await actions.disconnectBluetooth();
      console.log('Disconnect result:', result);
      
      if (result) {
        console.log('Bluetooth disconnection successful');
      } else {
        console.warn('Bluetooth disconnection failed');
      }
    } catch (error) {
      console.error('Error disconnecting from Bluetooth:', error);
    }
  };

  const { song, artist, album, station } = getSongInfo();

  return (
    <div className="container mx-auto p-4 relative">
      {/* WebSocket connection indicator */}
      <div className="absolute top-4 right-4 flex items-center">
        <div 
          className={`w-3 h-3 rounded-full mr-2 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} 
          title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'} 
        />
        <span className="text-xs text-gray-500">
          {wsConnected ? 'Live updates' : 'Polling updates'}
        </span>
      </div>
      
      <h1 className="text-3xl font-bold mb-6">Monty's Pianobar</h1>
      
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
            Status: <span className="font-bold">{isPlayerOn() ? (isPlaying() ? 'Playing' : 'Paused') : 'Off'}</span>
          </h2>
          <div className="flex items-center space-x-3">
            {/* Bluetooth Button */}
            {bluetooth.disconnecting ? (
              /* Disconnecting state - flashing yellow */
              <button 
                className="p-3 rounded-full bg-yellow-400 animate-bluetooth-flash"
                disabled={true}
                title="Disconnecting from Bluetooth"
              >
                <svg className="w-6 h-6 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                </svg>
              </button>
            ) : bluetooth.connectionInProgress ? (
              /* Connecting state - flashing yellow */
              <button 
                className="p-3 rounded-full bg-yellow-400 animate-bluetooth-flash"
                disabled={true}
                title="Connecting to Bluetooth"
              >
                <svg className="w-6 h-6 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                </svg>
              </button>
            ) : bluetooth.isConnected ? (
              /* Connected state - pulsing blue */
              <button 
                onClick={handleDisconnectBluetooth}
                className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 animate-bluetooth-pulse"
                disabled={false}
                title="Connected - Click to disconnect"
              >
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                </svg>
              </button>
            ) : (
              /* Not connected state - pale red */
              <button 
                onClick={handleConnectBluetooth}
                className="p-3 rounded-full bg-gray-200 hover:bg-gray-300"
                disabled={false}
                title="Not connected - Click to connect"
              >
                <svg className="w-6 h-6 text-red-300 opacity-60" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                </svg>
              </button>
            )}
            
            {/* Turn On/Off Button */}
            {(() => {
            const playerOn = isPlayerOn();
            
            // Determine button text based on current action or state
            const getButtonText = () => {
              if (buttonAction === 'starting') return 'Starting...';
              if (buttonAction === 'stopping') return 'Stopping...';
              if (buttonLocked) return buttonAction ? `${buttonAction}...` : 'Processing...';
              return playerOn ? 'Turn Off' : 'Turn On';
            };
            
            // Determine button color
            const getButtonColor = () => {
              if (buttonLocked || pianobar.loading || showOperationMessage) {
                return 'bg-gray-400 cursor-not-allowed';
              }
              return playerOn ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600';
            };
            
            return (
              <button 
                onClick={() => {
                  const handler = playerOn ? handleStopPlayer : handleStartPlayer;
                  handler();
                }}
                className={`px-4 py-2 rounded text-white ${getButtonColor()}`}
                disabled={buttonLocked || pianobar.loading || showOperationMessage}
              >
                {getButtonText()}
              </button>
            );
          })()}
          </div>
        </div>
        
        {/* Bluetooth Contextual Status Message Area */}
        {(bluetooth.connectionInProgress || bluetooth.disconnecting) && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
            {bluetooth.connectionInProgress && !bluetooth.disconnecting && (
              <>
                <p className="text-amber-700 animate-pulse mb-2">
                  ⚠️ The Fives speakers pair from a sleep mode - this process may take up to 30 seconds
                </p>
                
                {/* Progress Bar (Connecting Only) */}
                <div className="flex items-center mb-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${bluetoothProgress}%` }}
                    ></div>
                  </div>
                  {bluetoothProgressComplete && (
                    <div className="ml-2 text-green-500 text-xl">✓</div>
                  )}
                </div>
              </>
            )}
            
            {bluetooth.disconnecting && (
              <p className="text-amber-700 animate-pulse">
                ⚠️ Disconnecting from Klipsch The Fives... Un momento.
              </p>
            )}
          </div>
        )}
        
        {/* Now Playing Section (Hidden when player is off) */}
        <div className={isPlayerOn() ? '' : 'opacity-50'}>
          <div className="mb-6">
            <p className="text-lg font-semibold mb-4">Now Playing</p>
            
            {/* Album Art + Song Details Layout */}
            <div className="flex items-start space-x-4">
              {/* Album Art */}
              <div className="flex-shrink-0">
                {currentSong.coverArt ? (
                  <img 
                    src={currentSong.coverArt} 
                    alt={`${currentSong.album || 'Album'} cover`}
                    className="w-32 h-32 rounded-lg shadow-lg object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-32 h-32 rounded-lg shadow-lg bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-4xl">🎵</span>
                  </div>
                )}
              </div>
              
              {/* Song Details */}
              <div className="flex-grow min-w-0">
                {/* Title */}
                <h3 className="text-xl font-bold truncate" data-testid="song-title">
                  {currentSong.title || song || 'No song playing'}
                </h3>
                
                {/* Artist */}
                {(currentSong.artist || artist) && (
                  <p className="text-lg text-gray-700 truncate" data-testid="song-artist">
                    {currentSong.artist || artist}
                  </p>
                )}
                
                {/* Album */}
                {(currentSong.album || album) && (
                  <p className="text-sm text-gray-600 truncate" data-testid="song-album">
                    {currentSong.album || album}
                  </p>
                )}
                
                {/* Station */}
                {(currentSong.stationName || station) && (
                  <p className="text-sm text-blue-600 font-medium truncate flex items-center space-x-1" data-testid="song-station">
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="10" width="2" height="4" fill="currentColor"/>
                      <rect x="5" y="8" width="2" height="8" fill="currentColor"/>
                      <rect x="8" y="6" width="2" height="12" fill="currentColor"/>
                      <rect x="11" y="4" width="2" height="16" fill="currentColor"/>
                      <rect x="14" y="6" width="2" height="12" fill="currentColor"/>
                      <rect x="17" y="8" width="2" height="8" fill="currentColor"/>
                      <rect x="20" y="10" width="2" height="4" fill="currentColor"/>
                    </svg>
                    <span className="truncate">{currentSong.stationName || station}</span>
                  </p>
                )}
                
                {/* Loved Indicator */}
                {currentSong.rating > 0 && (
                  <div className="flex items-center mt-2">
                    <span className="text-sm text-red-500 flex items-center">
                      <span className="mr-1">Loved</span> 
                      <span className="text-red-500 animate-pulse">❤️</span>
                    </span>
                  </div>
                )}
                
                {/* Song Progress Bar */}
                {currentSong.songDuration > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-500 mb-1">
                      <span>{formatTime(currentSong.songPlayed || 0)}</span>
                      <span>{formatTime(currentSong.songDuration)}</span>
                    </div>
                    <div className="w-full bg-gray-300 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                        style={{ 
                          width: `${Math.min(100, (currentSong.songPlayed / currentSong.songDuration) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Pandora Link */}
                {currentSong.detailUrl && (
                  <a 
                    href={currentSong.detailUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 mt-3 inline-block transition-colors"
                  >
                    View on Pandora →
                  </a>
                )}
              </div>
            </div>
          </div>
          
          {/* Playback Controls */}
          <div className="flex justify-center space-x-6 my-6">
            <button 
              onClick={handleLove}
              className={`p-4 rounded-full transition-all duration-300 ${
                !isPlayerOn() 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : currentSong.rating > 0 
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
              } ${isAnimatingLove ? 'animate-love' : ''}`}
              disabled={!isPlayerOn()}
              title={currentSong.rating > 0 ? "Loved Song" : "Love This Song"}
            >
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            </button>
            <button 
              onClick={handlePlayPause}
              className={`p-4 rounded-full ${
                isPlayerOn() 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isPlayerOn()}
              title={isPlaying() ? 'Pause' : 'Play'}
            >
              {isPlaying() ? (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button 
              onClick={handleNext}
              className={`p-4 rounded-full ${
                isPlayerOn() 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isPlayerOn()}
              title="Next Song"
            >
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.342 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L14.805 7.06C13.555 6.346 12 7.25 12 8.688v2.34L5.055 7.06z" />
              </svg>
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
                onClick={() => actions.refreshPianobar()}
                className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full"
                title="Refresh Status"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                  <path d="M21 3v5h-5"></path>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                  <path d="M3 21v-5h5"></path>
                </svg>
              </button>
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
            {/* Show current station count */}
            {isPlayerOn() && Array.isArray(pianobar.stations) && pianobar.stations.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {pianobar.stations.length} station{pianobar.stations.length !== 1 ? 's' : ''} available
              </p>
            )}
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