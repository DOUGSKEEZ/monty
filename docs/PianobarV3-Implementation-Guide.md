# Pianobar V3 Implementation Guide

## Overview

This document outlines the complete strategy for rebuilding the Pianobar implementation from scratch using a "Big Bang" approach. The goal is to create a cleaner, more maintainable codebase that follows the backend architecture patterns established in BACKEND_FIX.md while preserving all existing functionality.

## Current Implementation Analysis

### Backend Services (4 Services)
1. **PianobarService** - Main service handling process lifecycle, status, commands
2. **PianobarCommandInterface** - Clean FIFO command interface with timeouts  
3. **PianobarWebsocketService** - Real-time updates via WebSocket
4. **PianobarWebsocketIntegration** - Initialization and DI integration

### Frontend Implementation
- Complex React page (1,126 lines) with WebSocket integration
- Bluetooth controls with progress animations
- Real-time song updates and station management
- Multiple state sources and race condition handling

### Key Challenges Identified

#### 1. Turn On/Off State Management
**Current Issues:**
- Multiple status sources (API polling, WebSocket, process checks)
- Complex button locking mechanisms
- Race conditions between different update sources

**Impact:** Button state can become inconsistent, requiring manual refresh

#### 2. Service Complexity
**Current Issues:**
- 4 separate services with overlapping responsibilities
- Complex dependency injection chains
- Difficult to debug service interactions

**Impact:** Hard to maintain and extend functionality

#### 3. State Synchronization
**Current Issues:**
- Version tracking to prevent race conditions
- Multiple update paths (WebSocket events, API calls, optimistic updates)
- Complex conflict resolution logic

**Impact:** UI can show stale or conflicting information

## V3 Architecture Design

### Core Principles

1. **Single Source of Truth** - Central state management with clear update paths
2. **Service Consolidation** - Reduce from 4 services to 2 core services
3. **WebSocket-First** - Real-time updates as primary, API as fallback
4. **Dependency Injection** - Follow BACKEND_FIX.md patterns
5. **Clean Separation** - Clear boundaries between concerns

### New Service Architecture

```
Pianobar V3 Services:
├── PianobarCoreService (consolidated)
│   ├── Process management (start/stop pianobar)
│   ├── Command interface (FIFO communication)
│   ├── Status tracking (central state)
│   ├── Health monitoring
│   └── Circuit breaker integration
└── PianobarWebSocketService (enhanced)
    ├── Real-time event broadcasting
    ├── Client connection management
    ├── Event script management
    └── State synchronization
```

### Central State Structure

```javascript
// Unified State Model
{
  meta: {
    version: number,        // For optimistic updates
    timestamp: number,      // Last update time
    source: string         // Update source (ws|api|optimistic)
  },
  player: {
    isRunning: boolean,
    isPlaying: boolean,
    status: 'stopped' | 'playing' | 'paused' | 'starting' | 'stopping'
  },
  currentSong: {
    title: string,
    artist: string,
    album: string,
    stationName: string,
    songDuration: number,
    songPlayed: number,
    rating: number,
    coverArt: string,
    detailUrl: string,
    startTime: number      // When song started
  },
  stations: [
    { id: string, name: string }
  ],
  connection: {
    websocket: boolean,
    api: boolean,
    lastPing: number
  }
}
```

## Implementation Plan

### Phase 1: Backend Service Consolidation

#### 1.1 Create PianobarCoreService

**File:** `/backend/src/services/PianobarCoreService.js`

```javascript
/**
 * PianobarCoreService - Consolidated pianobar management
 * 
 * Combines functionality from:
 * - PianobarService (process management)
 * - PianobarCommandInterface (FIFO commands)
 * 
 * Features:
 * - Single service for all pianobar operations
 * - Built-in command interface with timeouts
 * - Central state management
 * - Circuit breaker integration
 * - Health monitoring
 */

class PianobarCoreService extends IPianobarService {
  constructor(configManager, retryHelper, circuitBreaker, serviceRegistry, serviceWatchdog) {
    super();
    
    // Dependencies (following DI pattern)
    this.configManager = configManager;
    this.retryHelper = retryHelper;
    this.circuitBreaker = circuitBreaker;
    this.serviceRegistry = serviceRegistry;
    this.serviceWatchdog = serviceWatchdog;
    
    // Configuration
    this.pianobarConfigDir = path.join(process.env.HOME || '/home/monty', '.config/pianobar');
    this.pianobarCtl = path.join(this.pianobarConfigDir, 'ctl');
    this.statusFile = path.join(process.env.HOME || '/home/monty', 'monty/data/cache/pianobar_status.json');
    
    // Command timeouts
    this.timeouts = {
      fast: 1000,    // play/pause/love
      medium: 2500,  // next song
      slow: 5000     // station changes
    };
    
    // Central state
    this.centralState = {
      meta: { version: 0, timestamp: Date.now(), source: 'init' },
      player: { isRunning: false, isPlaying: false, status: 'stopped' },
      currentSong: {},
      stations: [],
      connection: { websocket: false, api: true, lastPing: 0 }
    };
    
    // State lock for thread safety
    this.stateLock = false;
    
    // Process reference
    this.pianobarProcess = null;
    
    // Initialize
    this.registerWithServices();
  }
  
  // Core Methods
  async initialize() { /* Service initialization */ }
  async startPianobar() { /* Process management */ }
  async stopPianobar() { /* Process management */ }
  async sendCommand(command) { /* FIFO communication */ }
  async getStatus() { /* Status retrieval */ }
  
  // State Management
  async updateCentralState(updates, source) { /* Thread-safe state updates */ }
  getState() { /* Get current state copy */ }
  async persistState() { /* Save to status file */ }
  
  // Health & Monitoring
  async healthCheck() { /* Service health */ }
  async recoveryProcedure() { /* Error recovery */ }
}
```

#### 1.2 Enhance PianobarWebSocketService

**File:** `/backend/src/services/PianobarWebSocketService.js`

```javascript
/**
 * Enhanced WebSocket service with:
 * - Direct integration with PianobarCoreService
 * - Simplified event handling
 * - Better error recovery
 * - Client state synchronization
 */

class PianobarWebSocketService {
  constructor(server, pianobarCoreService, config = {}) {
    this.server = server;
    this.pianobarCoreService = pianobarCoreService;
    
    // WebSocket server setup
    this.wss = new WebSocket.Server({ 
      server,
      path: '/api/pianobar/ws'
    });
    
    this.clients = new Set();
    this.setupWebSocketHandlers();
    this.setupEventWatchers();
  }
  
  // Enhanced Methods
  processEvent(eventData) {
    // Simplified event processing
    // Direct state updates via PianobarCoreService
    // Immediate client broadcasting
  }
  
  broadcastStateUpdate() {
    // Get latest state from core service
    // Broadcast to all connected clients
    // Handle connection errors gracefully
  }
  
  syncClientState(client) {
    // Send current state to newly connected client
  }
}
```

#### 1.3 Update Service Registration

**File:** `/backend/src/utils/ServiceFactory.js`

```javascript
// Updated factory methods for V3 services
function createPianobarCoreService() {
  const configManager = container.resolve('configManager');
  const retryHelper = container.resolve('retryHelper');
  const circuitBreaker = container.resolve('circuitBreaker');
  const serviceRegistry = container.resolve('serviceRegistry');
  const serviceWatchdog = container.resolve('serviceWatchdog');
  
  return new PianobarCoreService(
    configManager,
    retryHelper, 
    circuitBreaker,
    serviceRegistry,
    serviceWatchdog
  );
}

function createPianobarWebSocketService(server) {
  const pianobarCoreService = container.resolve('pianobarCoreService');
  return new PianobarWebSocketService(server, pianobarCoreService);
}
```

### Phase 2: Frontend Rebuilding

#### 2.1 Custom Hooks

**File:** `/frontend/src/hooks/usePianobarWebSocket.js`

```javascript
/**
 * WebSocket hook for real-time pianobar updates
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function usePianobarWebSocket() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Connection management
  const connect = useCallback(() => {
    // WebSocket connection logic
    // Automatic reconnection
    // State synchronization
  }, []);
  
  // Command sending
  const sendCommand = useCallback((command, params = {}) => {
    // Send commands via WebSocket
    // Optimistic updates
    // Error handling
  }, []);
  
  // State getters
  const isPlayerRunning = state?.player?.isRunning || false;
  const isPlaying = state?.player?.isPlaying || false;
  const currentSong = state?.currentSong || {};
  const stations = state?.stations || [];
  
  return {
    // State
    state,
    connected,
    error,
    
    // Computed values
    isPlayerRunning,
    isPlaying,
    currentSong,
    stations,
    
    // Actions
    sendCommand,
    reconnect: connect
  };
}
```

**File:** `/frontend/src/hooks/usePianobarAPI.js`

```javascript
/**
 * API hook for fallback operations
 */
import { useState, useCallback } from 'react';

export function usePianobarAPI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const callAPI = useCallback(async (endpoint, options = {}) => {
    // API call logic with error handling
    // Loading state management
    // Response validation
  }, []);
  
  // Specific API methods
  const startPlayer = useCallback(() => callAPI('/api/pianobar/start', { method: 'POST' }), [callAPI]);
  const stopPlayer = useCallback(() => callAPI('/api/pianobar/stop', { method: 'POST' }), [callAPI]);
  const getStatus = useCallback(() => callAPI('/api/pianobar/status'), [callAPI]);
  const getStations = useCallback(() => callAPI('/api/pianobar/stations'), [callAPI]);
  
  return {
    loading,
    error,
    startPlayer,
    stopPlayer,
    getStatus,
    getStations,
    callAPI
  };
}
```

#### 2.2 Component Structure

**File:** `/frontend/src/pages/PianobarPageV3.js`

```javascript
/**
 * Rebuilt Pianobar page with clean architecture
 */
import React from 'react';
import { usePianobarWebSocket } from '../hooks/usePianobarWebSocket';
import { usePianobarAPI } from '../hooks/usePianobarAPI';

// Sub-components
import ConnectionIndicator from '../components/pianobar/ConnectionIndicator';
import PlayerControls from '../components/pianobar/PlayerControls';
import SongDisplay from '../components/pianobar/SongDisplay';
import StationSelector from '../components/pianobar/StationSelector';
import BluetoothControls from '../components/pianobar/BluetoothControls';

function PianobarPageV3() {
  // Primary data source (WebSocket)
  const {
    state,
    connected,
    error,
    isPlayerRunning,
    isPlaying,
    currentSong,
    stations,
    sendCommand
  } = usePianobarWebSocket();
  
  // Fallback data source (API)
  const apiMethods = usePianobarAPI();
  
  // Unified command handler
  const handleCommand = async (command, params = {}) => {
    if (connected) {
      // Use WebSocket for real-time commands
      return sendCommand(command, params);
    } else {
      // Fallback to API
      return apiMethods.callAPI(`/api/pianobar/${command}`, {
        method: 'POST',
        body: JSON.stringify(params)
      });
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Monty's Pianobar V3</h1>
        <ConnectionIndicator 
          websocket={connected} 
          api={!apiMethods.error} 
        />
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Connection Error</p>
          <p>{error}</p>
        </div>
      )}
      
      <div className="grid gap-6">
        <PlayerControls
          isRunning={isPlayerRunning}
          isPlaying={isPlaying}
          onCommand={handleCommand}
          loading={apiMethods.loading}
        />
        
        <SongDisplay
          song={currentSong}
          isPlaying={isPlaying}
        />
        
        <StationSelector
          stations={stations}
          currentStation={currentSong.stationName}
          onSelectStation={(stationId) => handleCommand('selectStation', { stationId })}
          disabled={!isPlayerRunning}
        />
        
        <BluetoothControls />
      </div>
    </div>
  );
}

export default PianobarPageV3;
```

#### 2.3 Sub-Components

**File:** `/frontend/src/components/pianobar/PlayerControls.js`

```javascript
/**
 * Clean player control component
 */
import React, { useState } from 'react';

function PlayerControls({ isRunning, isPlaying, onCommand, loading }) {
  const [buttonLocked, setButtonLocked] = useState(false);
  const [operation, setOperation] = useState(null);
  
  const handlePowerToggle = async () => {
    if (buttonLocked || loading) return;
    
    setButtonLocked(true);
    setOperation(isRunning ? 'stopping' : 'starting');
    
    try {
      const command = isRunning ? 'stop' : 'start';
      await onCommand(command);
    } catch (error) {
      console.error('Power toggle error:', error);
    } finally {
      setOperation(null);
      setTimeout(() => setButtonLocked(false), 2000);
    }
  };
  
  const handlePlayPause = () => {
    if (!isRunning) return;
    onCommand(isPlaying ? 'pause' : 'play');
  };
  
  const handleNext = () => {
    if (!isRunning) return;
    onCommand('next');
  };
  
  const handleLove = () => {
    if (!isRunning) return;
    onCommand('love');
  };
  
  return (
    <div className="bg-white p-6 rounded shadow">
      {/* Power button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">
          Status: {isRunning ? (isPlaying ? 'Playing' : 'Paused') : 'Off'}
        </h2>
        
        <button
          onClick={handlePowerToggle}
          disabled={buttonLocked || loading}
          className={`px-6 py-3 rounded font-medium ${
            buttonLocked || loading
              ? 'bg-gray-400 cursor-not-allowed'
              : isRunning
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {operation || (isRunning ? 'Turn Off' : 'Turn On')}
        </button>
      </div>
      
      {/* Playback controls */}
      <div className="flex justify-center space-x-4">
        <button
          onClick={handleLove}
          disabled={!isRunning}
          className={`p-3 rounded-full ${
            isRunning
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          ❤️
        </button>
        
        <button
          onClick={handlePlayPause}
          disabled={!isRunning}
          className={`p-3 rounded-full ${
            isRunning
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <button
          onClick={handleNext}
          disabled={!isRunning}
          className={`p-3 rounded-full ${
            isRunning
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          ⏭️
        </button>
      </div>
    </div>
  );
}

export default PlayerControls;
```

### Phase 3: Migration Strategy

#### 3.1 Implementation Steps

1. **Backend Migration**
   ```bash
   # Step 1: Create new services (keep old ones)
   touch backend/src/services/PianobarCoreService.js
   touch backend/src/services/PianobarWebSocketServiceV3.js
   
   # Step 2: Update service factory
   # Add V3 service creation methods
   
   # Step 3: Test new services in isolation
   # Create test endpoints for V3 services
   
   # Step 4: Switch server to use V3 services
   # Update server.js initialization
   
   # Step 5: Remove old services
   # Clean up deprecated files
   ```

2. **Frontend Migration**
   ```bash
   # Step 1: Create hooks and components
   mkdir -p frontend/src/hooks
   mkdir -p frontend/src/components/pianobar
   
   # Step 2: Build new page alongside old one
   touch frontend/src/pages/PianobarPageV3.js
   
   # Step 3: Add route for testing
   # /pianobar-v3 route in App.js
   
   # Step 4: Test and validate
   # Compare functionality with original
   
   # Step 5: Switch routes and remove old page
   # Replace /pianobar route
   ```

#### 3.2 Testing Strategy

1. **Unit Tests**
   - PianobarCoreService methods
   - WebSocket hook functionality
   - Component interactions

2. **Integration Tests**
   - Service communication
   - WebSocket message handling
   - API fallback behavior

3. **E2E Tests**
   - Complete user workflows
   - Error recovery scenarios
   - Cross-browser compatibility

#### 3.3 Rollback Plan

1. Keep old implementation files with `.legacy` extension
2. Feature flag for V3 vs legacy routing
3. Database/state compatibility between versions
4. Quick switch mechanism in case of issues

### Phase 4: Quality Assurance

#### 4.1 Performance Benchmarks

- WebSocket connection time: < 500ms
- Command response time: < 200ms
- State update propagation: < 100ms
- Memory usage: < 50MB total
- UI re-render frequency: Minimize unnecessary updates

#### 4.2 Error Handling

1. **Service Failures**
   - Circuit breaker activation
   - Graceful degradation
   - User notification

2. **Network Issues**
   - WebSocket reconnection
   - API fallback activation
   - Offline state handling

3. **Process Issues**
   - Pianobar crash recovery
   - FIFO recreation
   - State restoration

#### 4.3 Monitoring & Observability

1. **Metrics Collection**
   - Service health status
   - WebSocket connection count
   - Command success/failure rates
   - Response time distributions

2. **Logging Strategy**
   - Structured logging with correlation IDs
   - Error aggregation and alerting
   - Performance monitoring

3. **Dashboard Integration**
   - Real-time service status
   - Historical performance data
   - Error rate tracking

## Benefits of V3 Implementation

### 1. **Simplified Architecture**
- 2 services instead of 4
- Clear separation of concerns
- Easier debugging and maintenance

### 2. **Improved Reliability**
- Single source of truth for state
- Better error handling and recovery
- Circuit breaker protection

### 3. **Enhanced Performance**
- Reduced service overhead
- Optimized WebSocket handling
- Efficient state updates

### 4. **Better Developer Experience**
- Cleaner code organization
- Comprehensive testing
- Clear documentation

### 5. **Future-Proof Design**
- Modular component structure
- Easy to extend and modify
- Standards-compliant architecture

## Timeline & Resources

### Estimated Timeline: 1-2 Days

**Day 1: Backend Migration**
- Morning: Create PianobarCoreService
- Afternoon: Enhance WebSocketService
- Evening: Integration testing

**Day 2: Frontend Rebuild**
- Morning: Create hooks and components
- Afternoon: Build new page
- Evening: Testing and validation

### Success Criteria

1. ✅ All existing functionality preserved
2. ✅ Improved button state reliability  
3. ✅ Cleaner service architecture
4. ✅ Better error handling
5. ✅ Comprehensive test coverage
6. ✅ Performance improvements
7. ✅ Documentation completion

## Conclusion

The V3 implementation represents a significant improvement in code quality, maintainability, and reliability while preserving all existing functionality. The "Big Bang" approach allows for a clean slate implementation that follows established patterns and best practices.

The consolidated architecture reduces complexity while improving performance and reliability. The enhanced error handling and monitoring capabilities ensure better system resilience and easier troubleshooting.

This implementation guide provides a comprehensive roadmap for the migration, including detailed technical specifications, implementation steps, testing strategies, and success criteria.