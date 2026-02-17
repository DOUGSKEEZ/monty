import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../utils/AppContext';
import { jukeboxApi } from '../utils/api';
import BluetoothSignalStrength from '../components/BluetoothSignalStrength';
import ModeSelector from '../components/ModeSelector';
import NowPlaying from '../components/shared/NowPlaying';
import TransportControls from '../components/shared/TransportControls';
import JukeboxSection from '../components/Jukebox/JukeboxSection';
import Toast from '../components/shared/Toast';

// Backend API base URL (same as api.js)
const API_BASE_URL = 'http://192.168.10.15:3001/api';

function PianobarPage() {
  // Get state from context
  const { pianobar, bluetooth, jukebox, activeSource, actions } = useAppContext();
  
  // Component state
  const [selectedStation, setSelectedStation] = useState('');
  const [showOperationMessage, setShowOperationMessage] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');
  const [buttonLocked, setButtonLocked] = useState(false);
  const [buttonAction, setButtonAction] = useState(null); // 'starting' or 'stopping'

  // Love animation state
  const [isAnimatingLove, setIsAnimatingLove] = useState(false);

  // Jukebox-specific state (for unified transport controls)
  const [restartCooldown, setRestartCooldown] = useState(false);

  // Mode selector state
  const [showModeSelector, setShowModeSelector] = useState(false);

  // Cache version for forcing refreshes when needed
  const CACHE_VERSION = '2025-06-01-v1';
  
  // Simple track info state with versioned localStorage persistence
  const [trackInfo, setTrackInfo] = useState(() => {
    try {
      const stored = localStorage.getItem('monty_trackInfo');
      const storedVersion = localStorage.getItem('monty_cacheVersion');
      
      // Force refresh if version doesn't match
      if (storedVersion !== CACHE_VERSION) {
        console.log('🔄 Cache version mismatch - clearing stale localStorage data');
        localStorage.removeItem('monty_trackInfo');
        localStorage.setItem('monty_cacheVersion', CACHE_VERSION);
        return {
          title: '',
          artist: '',
          album: '',
          stationName: '',
          songDuration: 0,
          songPlayed: 0,
          rating: 0,
          coverArt: '',
          detailUrl: ''
        };
      }
      
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load trackInfo from localStorage:', error);
    }
    return {
      title: '',
      artist: '',
      album: '',
      stationName: '',
      songDuration: 0,
      songPlayed: 0,
      rating: 0,
      coverArt: '',
      detailUrl: ''
    };
  });
  
  // Shared state for cross-device sync (lean!)
  const [sharedState, setSharedState] = useState({
    isRunning: false,
    isPlaying: false,
    currentStation: '',
    bluetoothConnected: false
  });
  
  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  // Bluetooth Progress Bar State
  const [bluetoothProgress, setBluetoothProgress] = useState(0);
  const [bluetoothProgressComplete, setBluetoothProgressComplete] = useState(false);
  const bluetoothProgressStartTime = useRef(null);
  const bluetoothAnimationFrameId = useRef(null);

  // Helper functions (moved to top to avoid hoisting issues)
  const isPlayerOn = () => {
    return pianobar.isRunning || sharedState.isRunning;
  };

  const isPlaying = () => {
    // Prioritize actual pianobar status over shared state
    if (isPlayerOn() && pianobar.isPlaying !== undefined) {
      return pianobar.isPlaying;
    }
    return sharedState.isPlaying;
  };
  
  // Sync functions for cross-device state
  const loadSharedState = async () => {
    try {
      console.log('🔍 [SYNC-STATE] Calling /api/pianobar/sync-state...');
      const response = await fetch(`${API_BASE_URL}/pianobar/sync-state`);
      console.log('🔍 [SYNC-STATE] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 [SYNC-STATE] Received data:', data);
        
        if (data.success) {
          console.log('🔍 [SYNC-STATE] Track data:', data.state.track);
          console.log('🔍 [SYNC-STATE] Setting trackInfo with songPlayed:', data.state.track.songPlayed);
          
          setSharedState(data.state.shared);
          setTrackInfo(data.state.track);
          
          console.log('✅ [SYNC-STATE] State updated successfully');
        } else {
          console.warn('❌ [SYNC-STATE] API returned success: false');
        }
      } else {
        console.warn('❌ [SYNC-STATE] HTTP error:', response.status);
      }
    } catch (error) {
      console.warn('❌ [SYNC-STATE] Failed to load shared state:', error);
    }
  };
  
  const syncSharedState = async () => {
    try {
      const currentState = {
        isRunning: pianobar.isRunning,
        isPlaying: pianobar.isPlaying,
        currentStation: selectedStation,
        bluetoothConnected: bluetooth.isConnected
      };
      
      await fetch(`${API_BASE_URL}/pianobar/sync-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared: currentState })
      });
    } catch (error) {
      console.warn('Failed to sync shared state:', error);
    }
  };
  
  // Debounced sync to prevent spam
  const debouncedSyncSharedState = useMemo(() => {
    let timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => syncSharedState(), 2000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // syncSharedState is stable - intentionally omitted to prevent re-creation

  // Update selected station when pianobar status changes
  useEffect(() => {
    if (pianobar.status && pianobar.status.stationId) {
      setSelectedStation(pianobar.status.stationId);
    }
  }, [pianobar.status]);

  // Real-time progress tracking - increment songPlayed every second while playing
  useEffect(() => {
    let progressInterval = null;

    if (isPlayerOn() && isPlaying() && trackInfo.songDuration > 0) {
      progressInterval = setInterval(() => {
        setTrackInfo(prev => ({
          ...prev,
          songPlayed: Math.min(prev.songPlayed + 1, prev.songDuration)
        }));
      }, 1000);
    }

    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerOn(), isPlaying(), trackInfo.songDuration]); // Function calls evaluated at render time
  
  // Persist trackInfo to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('monty_trackInfo', JSON.stringify(trackInfo));
    } catch (error) {
      console.warn('Failed to save trackInfo to localStorage:', error);
    }
  }, [trackInfo]);
  
  // REMOVED: Periodic progress sync - Backend is now source of truth
  // The WebSocket service automatically updates backend state when songs change
  // Clients should only RECEIVE data, not send localStorage data back to backend
  
  // Load shared state on mount and set up sync
  useEffect(() => {
    console.log('🚀 PianobarPage mounted - forcing fresh data load');
    
    // Force fresh data load on page visit
    const forceRefreshOnMount = async () => {
      try {
        // 1. Load latest from backend first (overrides any stale localStorage)
        await loadSharedState();
        
        // 2. Refresh pianobar status
        await actions.refreshPianobar();
        
        // 3. Sync our current state to backend
        await syncSharedState();
        
        console.log('✅ Fresh data loaded successfully on page mount');
      } catch (error) {
        console.warn('Error during mount refresh:', error);
      }
    };
    
    // Execute immediately
    forceRefreshOnMount();
    
    // Set up periodic sync every 10 seconds
    const syncInterval = setInterval(() => {
      syncSharedState();
    }, 10000);

    return () => clearInterval(syncInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: intentionally run once to initialize page state
  
  // Setup WebSocket connection for real-time updates
  useEffect(() => {
    let websocket = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;
    
    const connectWebSocket = () => {
      try {
        // Use fixed backend IP - guest subdomains don't have DNS for port 3001
        websocket = new WebSocket('ws://192.168.10.15:3001/api/pianobar/ws');
        
        websocket.onopen = () => {
          setWsConnected(true);
          reconnectAttempts = 0;
        };
        
        websocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          const source = data.source || data.data?.source; // Some messages have source in data

          // ============================================
          // SOURCE-KILLED: AudioBroker killed a source
          // ============================================
          if (data.type === 'source-killed') {
            // Backend sends killedSource in data.data or data.source
            const killedSource = data.data?.killedSource || data.source;
            console.log('🔴 [WS] source-killed:', killedSource);

            if (killedSource === 'pianobar') {
              // Immediately update pianobar state to stopped
              setSharedState(prev => ({
                ...prev,
                isRunning: false,
                isPlaying: false
              }));
              actions.updatePianobarStatus({
                isRunning: false,
                isPlaying: false,
                status: { ...pianobar.status, status: 'stopped' }
              });
            } else if (killedSource === 'jukebox') {
              // Clear jukebox state
              actions.clearJukeboxTrack();
            }

            // Only reset activeSource if the killed source WAS the active source.
            // This prevents clobbering an optimistic update from the NEW source.
            // e.g., jukebox sets activeSource='jukebox', then source-killed:pianobar arrives
            // — we should NOT reset to 'none' because jukebox already claimed it.
            if (activeSource === killedSource) {
              actions.setActiveSource('none');
            }
            return;
          }

          // ============================================
          // JUKEBOX MESSAGES (source === 'jukebox')
          // ============================================
          if (source === 'jukebox') {

            // Jukebox song update
            if (data.type === 'song') {
              // Only update track info if there's meaningful data
              // On natural EOF, backend sends empty track - preserve last track for replay
              const hasTrackInfo = data.data.youtubeId || data.data.filepath || data.data.title;
              if (hasTrackInfo) {
                actions.updateJukeboxTrack({
                  title: data.data.title || '',
                  artist: data.data.artist || '',
                  duration: parseInt(data.data.duration) || 0,
                  position: parseInt(data.data.position) || 0,
                  youtubeId: data.data.youtubeId || null,
                  filepath: data.data.filepath || null
                });
                // New track loaded - clear finished state
                if (data.data.isPlaying) {
                  actions.updateJukeboxStatus({ isPlaying: true, isFinished: false });
                }
              } else if (data.data.isPlaying === false) {
                // Empty track + not playing = EOF (song finished naturally)
                actions.updateJukeboxStatus({ isPlaying: false, isFinished: true });
              }

              // Update playing state if provided (and not already handled above)
              if (data.data.isPlaying !== undefined && hasTrackInfo) {
                actions.updateJukeboxStatus({ isPlaying: data.data.isPlaying });
              }
            }

            // Jukebox status update
            else if (data.type === 'status') {
              actions.updateJukeboxStatus({
                isPlaying: data.data.isPlaying || data.data.status === 'playing'
              });
            }

            // Jukebox playback progress (opt-in subscription)
            else if (data.type === 'playback-progress') {
              // Update position without logging (high frequency)
              actions.updateJukeboxTrack({
                position: data.data.position || 0
              });
            }

            // Save completed
            else if (data.type === 'save-complete') {
              console.log('✅ [WS] Save complete:', data.data);
              actions.showToast('success', `Saved: ${data.data.filename}`);
              // Auto-refresh library so new track appears
              jukeboxApi.getLibrary().then(res => {
                if (res.tracks) actions.setJukeboxLibrary(res.tracks);
              }).catch(err => console.error('Failed to refresh library:', err));
            }

            // Save failed
            else if (data.type === 'save-failed') {
              console.log('❌ [WS] Save failed:', data.data);
              actions.showToast('error', `Save failed: ${data.data.error || 'Unknown error'}`);
            }

            // Queue updated
            else if (data.type === 'queue-updated') {
              actions.updateJukeboxQueue(data.data || {});
            }

            return; // Don't fall through to pianobar handlers
          }

          // ============================================
          // PIANOBAR MESSAGES (source === 'pianobar' or no source)
          // ============================================

          // Pianobar status updates
          if (data.type === 'status') {
            const newSharedState = {
              isRunning: data.data.isPianobarRunning || (data.data.status !== 'stopped'),
              isPlaying: data.data.status === 'playing',
              currentStation: pianobar.status?.stationId || '',
              bluetoothConnected: bluetooth.isConnected
            };

            setSharedState(newSharedState);

            // Update pianobar context for other components
            actions.updatePianobarStatus({
              isRunning: newSharedState.isRunning,
              isPlaying: newSharedState.isPlaying,
              status: {
                ...pianobar.status,
                status: data.data.status
              }
            });

            // Set activeSource to pianobar when it's playing
            // This ensures unified transport controls wire to pianobar handlers
            if (newSharedState.isPlaying) {
              actions.setActiveSource('pianobar');
            }

            // Sync to backend
            debouncedSyncSharedState(newSharedState);
          }
          // Pianobar song updates
          else if (data.type === 'song') {
            // Song update means pianobar is actively playing
            actions.setActiveSource('pianobar');

            setTrackInfo(prev => {
              const newTitle = data.data.title || '';
              const newArtist = data.data.artist || '';

              // Check if this is a new song (different title or artist)
              const isNewSong = (prev.title !== newTitle || prev.artist !== newArtist);

              const newTrackInfo = {
                title: newTitle,
                artist: newArtist,
                album: data.data.album || '',
                stationName: data.data.stationName || '',
                songDuration: parseInt(data.data.songDuration) || 0,
                // Only reset progress for new songs, preserve local progress for same song
                songPlayed: isNewSong ? (parseInt(data.data.songPlayed) || 0) : prev.songPlayed,
                rating: parseInt(data.data.rating) || 0,
                coverArt: data.data.coverArt || '',
                detailUrl: data.data.detailUrl || ''
              };

              return newTrackInfo;
            });
          }
          // Pianobar love events
          else if (data.type === 'love') {
            setTrackInfo(prev => ({ ...prev, rating: 1 }));
          }
          // Pianobar station list updates
          else if (data.type === 'stations' && data.data.stations) {
            const stationList = parseStationList(data.data.stations);
            if (stationList && stationList.length > 0) {
              actions.updatePianobarStations(stationList.map(station => station.name));
            }
          }
        };
        
        websocket.onclose = () => {
          setWsConnected(false);
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            reconnectTimer = setTimeout(() => {
              connectWebSocket();
            }, reconnectDelay);
          }
        };
        
        websocket.onerror = () => {
          setWsConnected(false);
        };
        
        wsRef.current = websocket;
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setWsConnected(false);
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          reconnectTimer = setTimeout(() => {
            connectWebSocket();
          }, reconnectDelay);
        }
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (websocket) {
        websocket.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: WebSocket connection lifecycle managed internally

  // ============================================
  // JUKEBOX PROGRESS SUBSCRIPTION LIFECYCLE
  // ============================================
  // Subscribe to progress updates when jukebox is playing
  // Unsubscribe when jukebox stops or component unmounts
  useEffect(() => {
    const ws = wsRef.current;

    // Only subscribe if jukebox is playing and WebSocket is connected
    if (jukebox.isPlaying && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe-progress' }));
    }

    // Cleanup: unsubscribe when jukebox stops playing or component unmounts
    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe-progress' }));
      }
    };
  }, [jukebox.isPlaying]); // Re-run when jukebox playing state changes

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
    
    // Optimistic UI update
    setIsAnimatingLove(true);
    setTrackInfo(prev => ({ ...prev, rating: 1 }));
    
    setTimeout(() => setIsAnimatingLove(false), 800);
    
    try {
      await actions.controlPianobar('love');
    } catch (error) {
      console.error('Error loving song:', error);
      // Revert on failure
      setTrackInfo(prev => ({ ...prev, rating: 0 }));
    }
  };

  // ============================================
  // JUKEBOX TRANSPORT HANDLERS (for unified controls)
  // ============================================

  const handleJukeboxPlayPause = async () => {
    const wasPlaying = jukebox.isPlaying;
    actions.updateJukeboxStatus({ isPlaying: !wasPlaying });

    try {
      if (wasPlaying) {
        await jukeboxApi.pause();
      } else {
        await jukeboxApi.play();
      }
    } catch (error) {
      console.error('Error toggling jukebox playback:', error);
      actions.updateJukeboxStatus({ isPlaying: wasPlaying });
    }
  };

  const handleJukeboxNext = async () => {
    try {
      await jukeboxApi.next();
    } catch (error) {
      console.error('Error skipping to next track:', error);
    }
  };

  const handleJukeboxStop = async () => {
    try {
      await jukeboxApi.stop();
      actions.clearJukeboxTrack();
      actions.setActiveSource('none');
    } catch (error) {
      console.error('Error stopping jukebox:', error);
    }
  };

  const handleJukeboxRestart = async () => {
    if (restartCooldown) return;

    const { track } = jukebox;
    if (!track) return;

    // 5 second cooldown for yt-dlp URL resolution
    setRestartCooldown(true);
    setTimeout(() => setRestartCooldown(false), 5000);

    actions.updateJukeboxStatus({ isFinished: false, isPlaying: true });

    try {
      if (track.youtubeId) {
        await jukeboxApi.playYouTube(track.youtubeId, {
          title: track.title,
          artist: track.artist,
          duration: track.duration
        });
      } else if (track.filepath) {
        await jukeboxApi.playLocal(track.filepath);
      }
    } catch (error) {
      console.error('Error restarting track:', error);
      actions.updateJukeboxStatus({ isFinished: true, isPlaying: false });
    }
  };

  const handleJukeboxSeekBackward = async () => {
    try {
      await jukeboxApi.seek(-10);
    } catch (error) {
      console.error('Error seeking backward:', error);
    }
  };

  const handleJukeboxSeekForward = async () => {
    try {
      await jukeboxApi.seek(10);
    } catch (error) {
      console.error('Error seeking forward:', error);
    }
  };

  // ============================================
  // UNIFIED TRANSPORT HANDLER DISPATCH
  // ============================================
  // These route to the correct handler based on activeSource

  const handleUnifiedPlayPause = () => {
    if (activeSource === 'pianobar') {
      handlePlayPause();
    } else if (activeSource === 'jukebox') {
      handleJukeboxPlayPause();
    }
  };

  const handleUnifiedNext = () => {
    if (activeSource === 'pianobar') {
      handleNext();
    } else if (activeSource === 'jukebox') {
      handleJukeboxNext();
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

  // Enhanced refresh function - ONLY fetch from backend (source of truth)
  const handleRefreshAll = async () => {
    try {
      console.log('🔄 Loading latest track info and progress from backend...');
      
      // 1. Load latest shared state first (gets current track and progress from backend)
      await loadSharedState();
      
      // 2. Refresh pianobar status second (basic status only, won't override track progress)
      await actions.refreshPianobar();
      
      // REMOVED: No longer sync client data to backend - backend is source of truth
      
      console.log('✅ Refresh complete - loaded latest data from backend');
    } catch (error) {
      console.error('Error during refresh:', error);
    }
  };

  const { song, artist, album, station } = getSongInfo();

  return (
    <div className="container mx-auto p-4 relative">
      
      
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
        <div className="bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-700 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded mb-4">
          {operationMessage}
        </div>
      )}

      {/* Music Player Controls */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center">
              <h2 className="text-xl font-semibold dark:text-white">
                Status: <span className="font-bold">{isPlayerOn() ? (isPlaying() ? 'Playing' : 'Paused') : 'Off'}</span>
              </h2>
              {/* Bluetooth Signal Strength Icon */}
              <BluetoothSignalStrength mode="icon" />
            </div>
            {/* WebSocket connection indicator + RSSI text */}
            <div className="flex items-center mt-1">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}
                title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
              />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {wsConnected ? 'Live updates' : 'Polling updates'}
              </span>
              {/* Bluetooth Signal Strength Text */}
              <BluetoothSignalStrength mode="text" />
            </div>
          </div>
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
          <div className="bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 rounded p-3 mb-4">
            {bluetooth.connectionInProgress && !bluetooth.disconnecting && (
              <>
                <p className="text-amber-700 dark:text-amber-200 animate-pulse mb-2">
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
              <p className="text-amber-700 dark:text-amber-200 animate-pulse">
                ⚠️ Disconnecting from Klipsch The Fives... Un momento.
              </p>
            )}
          </div>
        )}
        
        {/* ============================================ */}
        {/* UNIFIED NOW PLAYING - Switches based on activeSource */}
        {/* ============================================ */}
        {(() => {
          const isAnyActive = activeSource !== 'none';
          const isPianobarActive = activeSource === 'pianobar';
          const isJukeboxActive = activeSource === 'jukebox';
          const hasJukeboxTrack = jukebox.track?.title || jukebox.track?.youtubeId;
          const jukeboxIsFinished = jukebox.isFinished && !jukebox.isPlaying;

          // Determine which source to display (for props switching)
          // Priority: active source > pianobar if on > idle
          const displaySource = isAnyActive ? activeSource : (isPlayerOn() ? 'pianobar' : 'none');

          return (
            <div>
              <NowPlaying
                source={displaySource === 'none' ? 'pianobar' : displaySource}
                title={
                  isJukeboxActive ? (jukebox.track?.title || 'No song playing') :
                  isPianobarActive ? (trackInfo.title || song || 'No song playing') :
                  'No song playing'
                }
                artist={
                  isJukeboxActive ? (jukebox.track?.artist || '') :
                  isPianobarActive ? (trackInfo.artist || artist || '') :
                  ''
                }
                position={
                  isJukeboxActive ? (jukebox.track?.position || 0) :
                  (trackInfo.songPlayed || 0)
                }
                duration={
                  isJukeboxActive ? (jukebox.track?.duration || 0) :
                  (trackInfo.songDuration || 0)
                }
                isActive={isAnyActive || isPlayerOn()}
                // Pianobar-specific props
                album={isPianobarActive ? (trackInfo.album || album) : undefined}
                stationName={isPianobarActive ? (trackInfo.stationName || station) : undefined}
                coverArt={isPianobarActive ? trackInfo.coverArt : undefined}
                rating={isPianobarActive ? trackInfo.rating : undefined}
                detailUrl={isPianobarActive ? trackInfo.detailUrl : undefined}
                onOpenModeSelector={isPianobarActive ? () => setShowModeSelector(true) : undefined}
                onRefresh={isPianobarActive ? handleRefreshAll : undefined}
                // Jukebox-specific props
                sourceType={isJukeboxActive ? (jukebox.track?.youtubeId ? 'youtube' : 'library') : undefined}
                youtubeId={isJukeboxActive ? jukebox.track?.youtubeId : undefined}
                filepath={isJukeboxActive ? jukebox.track?.filepath : undefined}
                isPlaying={isJukeboxActive ? jukebox.isPlaying : false}
                onSeekBackward={isJukeboxActive ? handleJukeboxSeekBackward : undefined}
                onSeekForward={isJukeboxActive ? handleJukeboxSeekForward : undefined}
              />

              {/* UNIFIED TRANSPORT CONTROLS - Switches based on activeSource */}
              <TransportControls
                source={displaySource === 'none' ? 'pianobar' : displaySource}
                isActive={isAnyActive || isPlayerOn()}
                isPlaying={
                  isJukeboxActive ? jukebox.isPlaying :
                  isPianobarActive ? isPlaying() :
                  false
                }
                onPlayPause={handleUnifiedPlayPause}
                onNext={handleUnifiedNext}
                // Pianobar-specific props
                isLoved={isPianobarActive ? trackInfo.rating > 0 : false}
                isAnimatingLove={isPianobarActive ? isAnimatingLove : false}
                onLove={isPianobarActive ? handleLove : undefined}
                // Jukebox-specific props
                onStop={isJukeboxActive ? handleJukeboxStop : undefined}
                onRestart={(isJukeboxActive && hasJukeboxTrack) ? handleJukeboxRestart : undefined}
                restartDisabled={restartCooldown}
                playDisabled={isJukeboxActive && jukeboxIsFinished}
              />

              {/* Station Selector - Pianobar only (conditionally rendered) */}
              {(isPianobarActive || (!isAnyActive && isPlayerOn())) && (
                <div className={`mt-6 ${isPlayerOn() ? '' : 'opacity-50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium dark:text-white">Select Station</label>
                    {(!isPlayerOn() || !Array.isArray(pianobar.stations) || pianobar.stations.length === 0) && (
                      <span className="text-xs text-amber-600">
                        {isPlayerOn() ? 'Waiting for stations...' : 'Turn on player to see your stations'}
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <select
                      className={`block w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600 ${!isPlayerOn() ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                      value={selectedStation}
                      onChange={(e) => setSelectedStation(e.target.value)}
                      disabled={!isPlayerOn() || pianobar.loading || !Array.isArray(pianobar.stations) || pianobar.stations.length === 0}
                    >
                      <option value="" className="dark:bg-gray-700">Select a station...</option>
                      {Array.isArray(pianobar.stations) && pianobar.stations.map((stationName, index) => (
                        <option key={index} value={index} className="dark:bg-gray-700">{stationName}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleChangeStation}
                      className={`px-4 py-2 rounded ${
                        isPlayerOn() && selectedStation
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      }`}
                      disabled={!isPlayerOn() || !selectedStation}
                    >
                      Change
                    </button>
                  </div>
                  {/* Show current station count */}
                  {isPlayerOn() && Array.isArray(pianobar.stations) && pianobar.stations.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {pianobar.stations.length} station{pianobar.stations.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Jukebox Section - YouTube streaming + local music library */}
      <JukeboxSection />

      {/* Mode Selector Modal */}
      <ModeSelector
        isOpen={showModeSelector}
        onClose={() => setShowModeSelector(false)}
        stationName={trackInfo.stationName || station}
      />

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}

export default PianobarPage;