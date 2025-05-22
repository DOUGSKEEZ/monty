# Pianobar Service Status Report

## 1. What We Just Fixed

### Auto-Starting Issues Resolved

We identified and fixed several critical auto-starting behaviors in the Pianobar service:

- **Critical Issue**: The `play()` method in PianobarService.js was automatically starting pianobar if it wasn't running
- **Critical Issue**: Status and stations API endpoints were triggering auto-starts when called during page load
- **Critical Issue**: All control endpoints (play, pause, next, etc.) weren't checking if pianobar was running first

### Files Modified

1. **`/home/monty/monty/backend/src/services/PianobarService.js`**:
   - Modified `play()` method to check if pianobar is running and return an error instead of auto-starting
   - Updated `getStations()` method to check if pianobar is running and return mock stations if not
   - Enhanced `getMockStations()` to include helpful error messages and isPianobarRunning flag

2. **`/home/monty/monty/backend/src/routes/pianobar.js`**:
   - Fixed `/api/pianobar/status` endpoint to safely return status without auto-starting
   - Fixed `/api/pianobar/stations` endpoint to return mock stations if pianobar is not running
   - Updated all control endpoints (play, pause, next, love, command, select-station) to check if pianobar is running first

### Specific Changes Made

#### PianobarService.js
```javascript
// Before:
async play() {
  // Start pianobar if not running
  const isRunning = await this.checkPianobarStatus(true);
  if (!isRunning) {
    return this.startPianobar(false);
  }
  
  // Otherwise just send play command
  return this.sendCommand('P', false);
}

// After:
async play() {
  // Check if pianobar is running first but don't auto-start it
  const isRunning = await this.checkPianobarStatus(true);
  if (!isRunning) {
    // Don't auto-start, return an error instead
    logger.info('Play command requested but pianobar is not running');
    return {
      success: false,
      message: 'Pianobar is not running. Please start it first.',
      error: 'NOT_RUNNING'
    };
  }
  
  // Only send play command if already running
  return this.sendCommand('P', false);
}
```

#### pianobar.js Routes
```javascript
// Before:
router.get('/status', async (req, res) => {
  try {
    const result = await pianobarService.getStatus();
    res.json(result);
  } catch (error) {
    logger.error(`Error getting pianobar status: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// After:
router.get('/status', async (req, res) => {
  try {
    // Check if this is a silent request
    const silent = req.query.silent === 'true';
    
    // Get status but NEVER auto-start
    const result = await pianobarService.getStatus(silent);
    
    // Extra safety check - ensure response will NEVER auto-start pianobar
    if (result && result.data) {
      // Explicitly set running/playing flags
      result.data.isPianobarRunning = result.data.isPianobarRunning || false;
      result.data.isPlaying = result.data.isPlaying || false;
    }
    
    if (!silent) {
      logger.debug('Status request handled - not auto-starting pianobar');
    }
    
    res.json(result);
  } catch (error) {
    logger.error(`Error getting pianobar status: ${error.message}`);
    
    // Even on error, return a valid response with isPianobarRunning: false
    res.status(200).json({ 
      success: true, 
      data: {
        status: 'stopped',
        isPianobarRunning: false,
        isPlaying: false,
        error: error.message
      } 
    });
  }
});
```

## 2. Current Architecture Status

### ✅ Bluetooth Service
- **Status**: Working perfectly
- **Implementation**: Properly separated with its own service class
- **Features**: Robust connection handling, retry logic, initialization checks
- **Integration**: Well-integrated with PianobarService

### ✅ Music Service
- **Status**: Successfully separated from Pianobar functionality
- **Implementation**: Using dependency injection pattern
- **Features**: Basic music status retrieval, mock stations when needed
- **Integration**: Calls PianobarService when needed but maintains separation

### ✅ PianobarService
- **Status**: Fully implemented with dependency injection
- **Implementation**: Extends IPianobarService interface properly
- **Features**: Process management, FIFO control, status monitoring
- **Fixes**: Auto-start behavior removed, proper error handling added

### ✅ Monitoring & Resilience
- **Status**: All monitoring and resilience features in place
- **Implementation**:
  - Prometheus metrics for tracking service health
  - Circuit breakers for handling failures
  - Retry logic for transient issues
  - Watchdog for service recovery
  - Proper error handling throughout

## 3. Testing Plan

### Testing No Auto-Start on Page Load

1. **Restart the Backend**:
   ```bash
   cd /home/monty/monty/backend
   npm restart  # or kill and restart the service
   ```

2. **Verify Empty Status**:
   ```bash
   cat /home/monty/monty/data/cache/pianobar_status.json
   ```
   Should show empty or stopped status.

3. **Open Browser & Refresh Page**:
   - Navigate to the music/pianobar page
   - Refresh several times
   - Verify the UI shows "Pianobar is not running" or similar message

4. **Check Processes**:
   ```bash
   pgrep -f pianobar || echo "No pianobar processes found"
   ```
   Should return "No pianobar processes found"

### Testing Start/Stop Functionality

1. **Test Start**:
   - Click the "Start" button in the UI
   - Verify pianobar process starts:
     ```bash
     pgrep -f pianobar
     ```
   - Verify status file updates
   - Verify UI shows running state

2. **Test Stop**:
   - Click the "Stop" button in the UI
   - Verify pianobar process stops:
     ```bash
     pgrep -f pianobar || echo "No pianobar processes found"
     ```
   - Verify status file updates
   - Verify UI shows stopped state

3. **Test Page Refresh While Running**:
   - Start pianobar
   - Refresh the page
   - Verify pianobar stays running but doesn't spawn new processes

### Log Monitoring

Watch for these log patterns:

1. **Success Patterns**:
   - "Status request handled - not auto-starting pianobar"
   - "Stations requested but pianobar is not running - returning mock data"

2. **Warning Patterns**:
   - No instances of "Starting pianobar..." unless explicitly requested
   - No "Found multiple pianobar processes" errors

3. **Monitor Backend Logs**:
   ```bash
   tail -f /home/monty/monty/backend/logs/app.log
   ```

## 4. Potential Issues to Watch For

### Possible Remaining Auto-Start Mechanisms

1. **Other Services Calling Pianobar**:
   - The Scheduler service might try to start pianobar for scheduled events
   - Check if any cron jobs or scheduled tasks call pianobar

2. **Frontend Behavior**:
   - The AppContext.js might still have auto-start logic in other methods
   - Watch for unexpected API calls in browser developer tools

3. **Process Cleanup Inconsistencies**:
   - If a pianobar process doesn't terminate properly, the status might get out of sync
   - Watch for "zombie" processes that aren't properly tracked

### Troubleshooting Steps

If pianobar still auto-starts:

1. **Identify the Trigger**:
   - Check logs for what API endpoint was called right before startup
   - Look for any services calling PianobarService.startPianobar()

2. **Status File Inconsistency**:
   - If status file says "playing" but no process exists, the UI might try to "restore" the state
   - Reset status file to stopped state:
     ```bash
     echo '{"status":"stopped","updateTime":'$(date +%s)'}' > /home/monty/monty/data/cache/pianobar_status.json
     ```

3. **Check for Multiple Services**:
   - Ensure only one PianobarService instance exists
   - Look for legacy service instances that might be auto-starting

## 5. Next Steps

### If Auto-Start Fix Works

1. **Improve Status Parsing**:
   - Enhance the event handling script to parse more metadata
   - Add artist/song thumbnail integration
   - Implement proper playback time tracking

2. **Real-Time Updates**:
   - Implement WebSocket for real-time status updates
   - Add proper UI status indicators
   - Implement volume control

3. **Station Management**:
   - Improve station selection UI
   - Add station favoriting functionality
   - Implement station search/browse

### If Issues Remain

1. **More Thorough Service Audit**:
   - Check every file that imports PianobarService
   - Audit all controller methods that could trigger pianobar
   - Add logging to every pianobar-related call

2. **Service Isolation**:
   - Consider running pianobar in a separate process entirely
   - Implement a command queue with explicit permissions
   - Add process lock files to prevent multiple instances

3. **UI Safety Measures**:
   - Add explicit "Auto-start disabled" UI messaging
   - Implement a manual-only mode toggle
   - Add process monitoring UI