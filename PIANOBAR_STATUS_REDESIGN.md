# Pianobar Status Model Redesign

## Problem Statement

The pianobar service was unintentionally auto-starting when status information was requested, creating a fundamental design flaw:

- Every time a client requested status information via `/api/pianobar/status`, the system would check if pianobar was running
- This check involved examining the actual system processes, which could trigger auto-start behavior
- The UI frequently polls for status, causing repeated unintended starts of the pianobar process

Status output indicating the problem:
```json
{
  "success": true,
  "data": {
    "status": "paused",
    "updateTime": 1747899461603,
    "stopTime": 1747899456457,
    "cleanupResult": "incomplete",
    "verificationPassed": false,
    "isPianobarRunning": true,
    "isPlaying": false
  }
}
```

In the above, status values like "paused" and "isPlaying" should be determined without needing to start pianobar.

## Solution Overview

We've completely redesigned the status model to separate **cached status** from **process checking**:

1. **Status API Never Checks Processes**: 
   - The `/api/pianobar/status` endpoint only returns cached status information
   - It never triggers any process checking or auto-starting

2. **Cached Status as Source of Truth**:
   - Status information is maintained in memory and in the status file
   - Only explicit user actions update the status (start, stop, play, pause)

3. **Process Checking Only on Demand**:
   - Process verification only happens when:
     - User explicitly clicks "Turn On" or "Turn Off"
     - User issues a playback command like "Play" or "Pause"
   - No automatic process checking during status requests

## Detailed Changes

### 1. `getStatus()` Method in PianobarService
Changed from:
```javascript
// Check if pianobar is running
const isRunning = await this.checkPianobarStatus(silent);
          
// Read from status file if it exists
let statusData = {
  status: isRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
  updateTime: Date.now()
};
```

To:
```javascript
// IMPORTANT: DO NOT call checkPianobarStatus() here as it will check the actual process
// Instead, just read the saved status file and return the cached status
          
// Create a default status based on our internal state variables
let statusData = {
  status: this.isPianobarRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
  updateTime: Date.now(),
  isPianobarRunning: this.isPianobarRunning,
  isPlaying: this.isPlaying
};
```

### 2. Status API Endpoint Changes
- Added explicit logging of returned status
- Added `fromCache: true` field to status response
- Enhanced error handling to never trigger process checking

### 3. Status Update Propagation
- Status is now only updated when:
  - User explicitly starts or stops pianobar
  - User issues playback commands
  - System detects failures during command execution
- Status updates are written to the status file atomically

## Benefits of the New Design

1. **No Unintended Auto-Starting**:
   - Status checks no longer trigger pianobar to start
   - UI polling is completely safe and won't affect system state

2. **Clearer State Management**:
   - Explicit separation between:
     - What the user has requested (cached state)
     - What's actually running (process state)

3. **More Responsive UI**:
   - Status requests don't trigger process checks, making them faster
   - Reduced system load from unnecessary process checks

4. **More Predictable Behavior**:
   - Pianobar only starts when the user explicitly requests it
   - System state only changes with explicit user actions

## Testing the Solution

To verify this redesign is working:

1. Restart the backend server
2. Open the music UI and observe it doesn't start pianobar
3. Click "Turn On" and verify pianobar starts correctly
4. Click "Turn Off" and verify pianobar stops completely
5. Verify status polling doesn't restart pianobar

This redesign fundamentally changes how status is handled to ensure pianobar only runs when explicitly requested by the user.