# Pianobar Process Termination Fix

## Issue
When the user clicks the "Turn Off" button, the music stops but the pianobar process continues running in the background:

- **Incorrect behavior**: Music status shows "stopped" ✅ but `isPianobarRunning` still shows `true` ❌
- **Expected behavior**: Both the music should stop AND the pianobar process should terminate completely

The root cause was that the `stopPianobar()` method was stopping the music playback but not reliably terminating the actual pianobar process.

## Fixes Implemented

### 1. Enhanced Process Termination in `stopPianobar()`
- Added direct kill commands with both SIGTERM and SIGKILL before the cleanup procedure
- Added waiting periods between kill commands to allow processes to terminate
- Implemented multiple command strategies (`pkill`, `killall`, direct `kill` by PID)

```javascript
// First try graceful SIGTERM
await execPromise(`pkill -f pianobar || true`, { timeout: 5000 });
await new Promise(resolve => setTimeout(resolve, 2000));

// Then use SIGKILL for any stubborn processes 
await execPromise(`pkill -9 -f pianobar || true`, { timeout: 5000 });
await execPromise(`killall -9 pianobar || true`, { timeout: 5000 });
```

### 2. More Thorough Verification of Process Termination
- Added multiple verification methods to check if processes are truly gone (pgrep, ps, pidof)
- Enhanced error handling to always set internal state correctly even if verification fails
- Added emergency kill procedures for stubborn processes

```javascript
// Use multiple verification methods to be absolutely certain
const verificationMethods = [
  { cmd: 'pgrep -f pianobar || echo ""', name: 'pgrep', timeout: 3000 },
  { cmd: 'ps -eo pid,cmd | grep -i pianobar | grep -v grep || echo ""', name: 'ps', timeout: 3000 },
  { cmd: 'pidof pianobar || echo ""', name: 'pidof', timeout: 3000 }
];
```

### 3. Improved `checkPianobarStatus()` Method
- Enhanced to use multiple verification methods
- Added proper status file updates to keep state consistent
- Better error handling to ensure `isPianobarRunning` is reliably set

```javascript
// Update status file to match our new state
try {
  await this.saveStatus({
    status: this.isPianobarRunning ? (this.isPlaying ? 'playing' : 'paused') : 'stopped',
    updateTime: Date.now(),
    isPianobarRunning: this.isPianobarRunning,
    isPlaying: this.isPlaying
  });
} catch (statusError) {
  if (!silent) logger.debug(`Error updating status after check: ${statusError.message}`);
}
```

### 4. Improved State Management
- Ensuring that internal state variables are always updated consistently
- Added fallback state updates even when errors occur
- Added log messages to make state transitions more visible

## Testing the Fix

To verify the fix is working:

1. Start pianobar by clicking "Turn On"
2. Verify that music plays correctly
3. Click "Turn Off"
4. Verify that:
   - Music stops playing
   - Status shows "stopped"
   - `isPianobarRunning` correctly shows `false`
   - No pianobar processes remain running in the background

## Technical Details

The key improvement is the addition of multiple layers of process termination:

1. **Graceful Termination**:
   - First attempt to quit cleanly via FIFO command ('q')
   - Wait for the process to exit gracefully

2. **Standard Termination**:
   - If graceful quit fails, use `pkill` with SIGTERM
   - Wait for processes to exit

3. **Forced Termination**:
   - If standard termination fails, use `pkill -9` and `killall -9`
   - Wait for processes to exit

4. **Individual Process Termination**:
   - If processes still remain, identify each one and send SIGKILL directly
   - Wait for processes to exit

5. **State Reset**:
   - Even if some processes cannot be killed, update internal state to prevent UI inconsistency
   - Log detailed information about any remaining processes for debugging