import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../utils/AppContext';

function MusicPage() {
  // Debug Render Count to track re-renders
  const renderCount = useRef(0);
  renderCount.current += 1;
  console.log(`RENDER #${renderCount.current} - MusicPage component rendering`);
  
  // Get Bluetooth state from context
  const { music, bluetooth, actions } = useAppContext();
  
  // CRITICAL FIX: Add explicit re-render trigger when bluetooth object changes
  const [forceRender, setForceRender] = useState(0);
  
  // Force re-render when bluetooth context actually changes
  useEffect(() => {
    console.log('BLUETOOTH OBJECT FROM CONTEXT CHANGED:', bluetooth, 'Triggering re-render');
    setForceRender(prev => prev + 1);
  }, [bluetooth]); // This should trigger when ANY property of bluetooth changes
  
  // Debug render with render counter and force render value
  console.log(`RENDER #${renderCount.current} (forceRender=${forceRender}) - Bluetooth state:`, {
    isConnected: bluetooth.isConnected,
    connectionInProgress: bluetooth.connectionInProgress,
    disconnecting: bluetooth.disconnecting,
    timestamp: new Date().toISOString()
  });
  
  // Component state
  const [selectedStation, setSelectedStation] = useState('');
  const [showConnectingMessage, setShowConnectingMessage] = useState(false);
  const [connectAttemptCount, setConnectAttemptCount] = useState(0);
  const statusCheckInterval = useRef(null);
  
  // Local copy of Bluetooth state for debugging purposes
  const [localBluetoothState, setLocalBluetoothState] = useState({
    isConnected: false,
    connectionInProgress: false,
    disconnecting: false,
    timestamp: new Date().toISOString()
  });
  
  // ALTERNATIVE FIX: Also track individual properties to ensure re-rendering
  // This is a backup in case the main fix with [bluetooth] dependency doesn't work
  const [renderTrigger, setRenderTrigger] = useState(0);
  
  // Bluetooth Progress Bar State
  const [bluetoothProgress, setBluetoothProgress] = useState(0);
  const [bluetoothProgressComplete, setBluetoothProgressComplete] = useState(false);
  const bluetoothProgressStartTime = useRef(null);
  const bluetoothAnimationFrameId = useRef(null);
  
  useEffect(() => {
    console.log('INDIVIDUAL BLUETOOTH PROPERTIES CHANGED - Triggering re-render');
    setRenderTrigger(Date.now());
  }, [
    bluetooth.isConnected, 
    bluetooth.connectionInProgress, 
    bluetooth.disconnecting
  ]);
  
  // Debug log for the alternative fix
  console.log(`Alternative fix render trigger: ${renderTrigger}`);
  
  // Update selected station when music status changes
  useEffect(() => {
    if (music.status && music.status.stationId) {
      setSelectedStation(music.status.stationId);
    }
  }, [music.status]);
  
  // Check Bluetooth status when component mounts
  useEffect(() => {
    // Initial status check
    actions.refreshBluetooth();
    
    // NOTE: The main periodic status checks are now handled in AppContext.js
    // with dynamic intervals (500ms during connection, 12s when idle)
    // We don't need an additional interval here
    
    console.log('INITIAL BLUETOOTH STATE:', {
      isConnected: bluetooth.isConnected,
      connectionInProgress: bluetooth.connectionInProgress,
      disconnecting: bluetooth.disconnecting,
      timestamp: new Date().toISOString()
    });
    
    return () => {
      // Clean up interval on component unmount if it exists
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
        statusCheckInterval.current = null;
      }
    };
  }, []);
  
  // CRITICAL DEBUG: Watch for state changes in bluetooth properties
  useEffect(() => {
    console.log('BLUETOOTH STATE CHANGED:', {
      isConnected: bluetooth.isConnected,
      connectionInProgress: bluetooth.connectionInProgress,
      disconnecting: bluetooth.disconnecting,
      timestamp: new Date().toISOString()
    });
    
    // CRITICAL FIX: Sync local state with context state when context changes
    // This ensures local state is cleared when connection completes
    setLocalBluetoothState({
      isConnected: bluetooth.isConnected,
      connectionInProgress: bluetooth.connectionInProgress,
      disconnecting: bluetooth.disconnecting,
      timestamp: new Date().toISOString()
    });
    
    console.log('Local state synced with context state');
  }, [bluetooth.isConnected, bluetooth.connectionInProgress, bluetooth.disconnecting]);
  
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
      // INSTANT COMPLETION: Check if connected - jump to 100% immediately
      if (bluetooth.isConnected) {
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
    // Don't allow multiple connection attempts
    if (bluetooth.connectionInProgress || bluetooth.disconnecting) {
      console.log('Connection already in progress, ignoring click');
      return;
    }
    
    // Increment connect attempt counter to track retries
    setConnectAttemptCount(count => count + 1);
    
    // If more than 2 attempts, force wakeup mode
    const forceWakeup = connectAttemptCount >= 2;
    
    console.log(`Starting Bluetooth connection process${forceWakeup ? ' with force wakeup' : ''}...`);
    console.log('Before connect - Bluetooth state:', {
      isConnected: bluetooth.isConnected,
      connectionInProgress: bluetooth.connectionInProgress,
      disconnecting: bluetooth.disconnecting,
      attemptCount: connectAttemptCount
    });
    
    try {
      // CRITICAL: Let's force a local state update to test re-rendering
      console.log('Setting local state showConnectingMessage to true');
      setShowConnectingMessage(true);
      
      // CRITICAL TEST: Make our own state change to bluetooth locally in this component
      // This is a temporary test - we're creating a new state object that mimics what AppContext should update to
      const tempState = {
        ...bluetooth,
        connectionInProgress: true,
        disconnecting: false
      };
      
      console.log('CRITICAL TEST - Created temporary state:', tempState);
      
      // Use direct Bluetooth connect instead of controlMusic
      console.log('Calling actions.connectBluetooth with forceWakeup =', forceWakeup);
      
      // Force a render to ensure we see the temporary state update
      setTimeout(() => {
        console.log('DEBUG: STATE BEFORE API CALL:', {
          isConnected: bluetooth.isConnected,
          connectionInProgress: bluetooth.connectionInProgress,
          disconnecting: bluetooth.disconnecting,
          showConnectingMessage: showConnectingMessage,
          timestamp: new Date().toISOString()
        });
      }, 100);
      
      const result = await actions.connectBluetooth(forceWakeup);
      
      console.log('Connect result:', result);
      console.log('After connect call - Bluetooth state:', {
        isConnected: bluetooth.isConnected,
        connectionInProgress: bluetooth.connectionInProgress,
        disconnecting: bluetooth.disconnecting,
        timestamp: new Date().toISOString()
      });
      
      // Force another render after the API call returns
      setTimeout(() => {
        console.log('DEBUG: STATE AFTER API CALL:', {
          isConnected: bluetooth.isConnected,
          connectionInProgress: bluetooth.connectionInProgress,
          disconnecting: bluetooth.disconnecting,
          showConnectingMessage: showConnectingMessage,
          timestamp: new Date().toISOString()
        });
      }, 100);
      
      if (result) {
        console.log('Bluetooth connection successful, speakers should be awake now');
        
        // CRITICAL FIX: Clear local connection in progress state on success
        setLocalBluetoothState({
          isConnected: true,
          connectionInProgress: false, // Clear the in-progress flag
          disconnecting: false,
          timestamp: new Date().toISOString()
        });
        
        console.log('Local state updated after successful connection');
        
        // Reset connect attempt counter on success
        setConnectAttemptCount(0);
        
        // Also clear the connecting message
        setShowConnectingMessage(false);
      } else {
        console.warn('Bluetooth connection failed or timed out');
        
        // CRITICAL FIX: Clear local connection in progress state on failure
        setLocalBluetoothState({
          isConnected: false,
          connectionInProgress: false, // Clear the in-progress flag
          disconnecting: false,
          timestamp: new Date().toISOString()
        });
        
        console.log('Local state updated after failed connection');
        
        // Don't reset attempt counter on failure to enable force wakeup on next try
        
        // Clear the connecting message
        setShowConnectingMessage(false);
      }
    } catch (error) {
      console.error('Error connecting to Bluetooth:', error);
      
      // CRITICAL FIX: Clear local state on error
      setLocalBluetoothState({
        isConnected: false,
        connectionInProgress: false,
        disconnecting: false,
        timestamp: new Date().toISOString()
      });
      
      setShowConnectingMessage(false);
    } finally {
      // Always make sure states are cleared if something went wrong
      // This is a failsafe that runs after 7 seconds
      setTimeout(() => {
        console.log('FAILSAFE: Checking for stuck states');
        
        // Make sure local state is reset
        setLocalBluetoothState(prevState => {
          // Only clear if still connecting (avoid clearing a successful connection)
          if (prevState.connectionInProgress) {
            console.log('Clearing stuck connectionInProgress flag');
            return {
              ...prevState,
              connectionInProgress: false,
              timestamp: new Date().toISOString()
            };
          }
          return prevState;
        });
        
        // Clear local connecting message
        setShowConnectingMessage(false);
      }, 7000);
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
    // Don't allow multiple disconnect attempts
    if (bluetooth.disconnecting || bluetooth.connectionInProgress) {
      console.log('Operation already in progress, ignoring disconnect click');
      return;
    }
    
    console.log('Disconnecting from Bluetooth speakers...');
    console.log('Before disconnect - Bluetooth state:', {
      isConnected: bluetooth.isConnected,
      connectionInProgress: bluetooth.connectionInProgress,
      disconnecting: bluetooth.disconnecting
    });
    
    try {
      // CRITICAL: This ensures we see "Disconnecting..." immediately
      // Force a render by setting a local state variable
      setShowConnectingMessage(true);
      
      // Use direct Bluetooth disconnect instead of controlMusic
      console.log('Calling actions.disconnectBluetooth...');
      const result = await actions.disconnectBluetooth();
      
      console.log('Disconnect result:', result);
      console.log('After disconnect call - Bluetooth state:', {
        isConnected: bluetooth.isConnected,
        connectionInProgress: bluetooth.connectionInProgress,
        disconnecting: bluetooth.disconnecting
      });
      
      if (result) {
        console.log('Bluetooth disconnection successful');
        
        // CRITICAL FIX: Update local state after disconnection success
        setLocalBluetoothState({
          isConnected: false,
          connectionInProgress: false,
          disconnecting: false,
          timestamp: new Date().toISOString()
        });
      } else {
        console.warn('Bluetooth disconnection failed');
        
        // CRITICAL FIX: Update local state after disconnection failure
        setLocalBluetoothState({
          // Keep original connection state if disconnect failed
          isConnected: bluetooth.isConnected,
          connectionInProgress: false,
          disconnecting: false, // But clear the disconnecting flag
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error disconnecting from Bluetooth:', error);
      
      // CRITICAL FIX: Clear local state on error
      setLocalBluetoothState(prevState => ({
        ...prevState,
        disconnecting: false,
        timestamp: new Date().toISOString()
      }));
    } finally {
      // Always clear the local connecting message state
      setShowConnectingMessage(false);
      
      // Failsafe to clear stuck states after 3 seconds
      setTimeout(() => {
        setLocalBluetoothState(prevState => {
          if (prevState.disconnecting) {
            console.log('Clearing stuck disconnecting flag');
            return {
              ...prevState,
              disconnecting: false,
              timestamp: new Date().toISOString()
            };
          }
          return prevState;
        });
      }, 3000);
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
    // SIMPLIFIED LOGIC: Follow the same pattern as the button logic
    
    // Disconnecting state
    if (bluetooth.disconnecting) {
      return {
        text: 'Disconnecting from Klipsch The Fives...',
        colorClass: 'text-amber-600',
        showProgress: true,
        showReconnectButton: false
      };
    }
    
    // Connecting state (regardless of other flags)
    if (bluetooth.connectionInProgress) {
      return {
        text: 'Connecting to Klipsch The Fives...',
        colorClass: 'text-amber-600',
        showProgress: true,
        showReconnectButton: false
      };
    }
    
    // Connected state
    if (bluetooth.isConnected) {
      // Show different status based on audio readiness
      if (bluetooth.isAudioReady) {
        return {
          text: 'Connected to Klipsch The Fives ✓',
          colorClass: 'text-green-600',
          showProgress: false,
          showReconnectButton: false
        };
      } else {
        return {
          text: 'Connected to Klipsch The Fives (Audio initializing...)',
          colorClass: 'text-amber-600',
          showProgress: true,
          showReconnectButton: false
        };
      }
    }
    
    // Not connected but player is on
    if (isPlayerOn()) {
      return {
        text: 'Not Connected to Speakers',
        colorClass: 'text-amber-600',
        showProgress: false,
        showReconnectButton: true
      };
    }
    
    // Default not connected state
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
            {/* CRITICAL DEBUG: Log EXACTLY what's being used during render */}
            {console.log('RENDER VALUES:', { 
              context: {
                isConnected: bluetooth.isConnected, 
                connectionInProgress: bluetooth.connectionInProgress,
                disconnecting: bluetooth.disconnecting
              },
              local: {
                isConnected: localBluetoothState.isConnected,
                connectionInProgress: localBluetoothState.connectionInProgress,
                disconnecting: localBluetoothState.disconnecting
              },
              showConnectingMessage: showConnectingMessage
            })}
            
            {/* NEW ROUND BUBBLE BLUETOOTH BUTTON */}
            {(bluetooth.disconnecting || localBluetoothState.disconnecting) ? (
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
            ) : (bluetooth.connectionInProgress || localBluetoothState.connectionInProgress) ? (
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
                onClick={() => {
                  // WORKAROUND: Update local state first for immediate UI feedback
                  setLocalBluetoothState({
                    isConnected: bluetooth.isConnected,
                    connectionInProgress: false,
                    disconnecting: true, // Set disconnecting flag
                    timestamp: new Date().toISOString()
                  });
                  
                  // Then call the actual disconnect function
                  handleDisconnectBluetooth();
                }}
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
                onClick={() => {
                  // WORKAROUND: Directly update our local component state first
                  setLocalBluetoothState({
                    isConnected: false,
                    connectionInProgress: true, // Critical fix
                    disconnecting: false,
                    timestamp: new Date().toISOString()
                  });
                  
                  // Also set local connecting message state
                  setShowConnectingMessage(true);
                  
                  // Then call the actual connect function
                  handleConnectBluetooth();
                }}
                className="p-3 rounded-full bg-gray-200 hover:bg-gray-300"
                disabled={false}
                title="Not connected - Click to connect"
              >
                <svg className="w-6 h-6 text-red-300 opacity-60" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                </svg>
              </button>
            )}
            
            {/* DEBUG BUTTONS */}
            <div className="mt-2 flex space-x-2">
              <button 
                onClick={() => console.log('Force render test', bluetooth)}
                className="px-2 py-1 bg-gray-500 text-white text-xs rounded"
              >
                Debug State
              </button>
              
              <button 
                onClick={() => {
                  // Create a local update to test if the component is re-rendering
                  const now = new Date().toISOString();
                  console.log(`Force update clicked at ${now}`);
                  setShowConnectingMessage(prev => !prev);
                }}
                className="px-2 py-1 bg-purple-500 text-white text-xs rounded"
              >
                Force Update
              </button>
              
              <button 
                onClick={() => {
                  // Create a direct update to our local bluetooth state copy
                  console.log('Setting local bluetooth state copy...');
                  setLocalBluetoothState({
                    isConnected: false,
                    connectionInProgress: true, // This is key - we set it to true
                    disconnecting: false,
                    timestamp: new Date().toISOString()
                  });
                  
                  // Also test with local state update
                  setShowConnectingMessage(true);
                }}
                className="px-2 py-1 bg-green-500 text-white text-xs rounded"
              >
                Set Local Flag
              </button>
            </div>
          </div>
        </div>
        
        <div className="mb-2">
          <p className={`${bluetoothStatusInfo.colorClass}`}>
            <span className="font-semibold">Status:</span> {bluetoothStatusInfo.text}
          </p>
          
          {/* Show Bluetooth error message if present */}
          {bluetooth.error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-600">
                <span className="inline-block mr-2">⚠️</span>
                {bluetooth.error}
              </p>
            </div>
          )}
          
          {/* Animated Progress Bar */}
          {bluetooth.connectionInProgress && !bluetooth.disconnecting && (
            <div className="mt-3">
              <p className="text-sm text-amber-600 animate-pulse mb-2">
                <span className="inline-block mr-2">⚠️</span>
                Klipsch The Fives speakers pair from a power-saving mode so this process may take awhile - up to 30 seconds tops
              </p>
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
            </div>
          )}
          
          {/* Disconnecting Message */}
          {bluetooth.disconnecting && (
            <div className="mt-3">
              <p className="text-sm text-amber-600 animate-pulse mb-2">
                <span className="inline-block mr-2">⚠️</span>
                Disconnecting from Klipsch The Fives... Un momento.
              </p>
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
          
          {/* Bluetooth Status - SIMPLIFIED LOGIC */}
          {isPlayerOn() && 
           !bluetooth.isConnected && 
           !bluetooth.connectionInProgress && 
           !bluetooth.disconnecting && (
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