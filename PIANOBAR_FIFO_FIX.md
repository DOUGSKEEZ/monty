# Pianobar FIFO Communication Fix

## Issue
The FIFO communication with pianobar was failing with multiple errors:

1. JavaScript error in the event command script: `Error creating event command script: i is not defined`
2. All FIFO writes were timing out: `FIFO write timed out after 5 seconds`
3. Alternative command methods were also failing: `Alternative command method also failed: Command failed: echo "s1" > /home/monty/.config/pianobar/ctl`

These issues were causing:
- Inability to control pianobar (play, pause, change stations)
- Command timeouts
- Inconsistent UI state

## Root Cause Analysis

The investigation revealed multiple issues:

1. **Event Script Conflict**: The service was trying to generate a new event command script, but there was already an existing script at `/home/monty/.config/pianobar/eventcmd.sh`. The attempted overwrite was failing due to syntax errors in the template.

2. **FIFO Communication Issues**: The FIFO communication was unreliable because:
   - Permissions might not be set correctly
   - FIFO files might be in a bad state
   - The blocking nature of FIFO writes was causing timeouts

## Fixes Applied

### 1. Using Existing Event Script
Instead of attempting to create a new event command script, we modified the approach to use the existing script:

```javascript
// Instead of overwriting the existing script, we'll work with what we have
const existingScriptPath = '/home/monty/.config/pianobar/eventcmd.sh';
if (!configContent.includes('event_command')) {
  configContent += `\nevent_command = ${existingScriptPath}\n`;
} else {
  configContent = configContent.replace(/event_command\s*=\s*.*/g, `event_command = ${existingScriptPath}`);
}

// Make sure the existing script is executable
await execPromise(`chmod +x ${existingScriptPath}`);
```

### 2. Parallel FIFO Communication Methods
Implemented multiple FIFO communication methods in parallel for better reliability:

```javascript
// Try multiple methods in parallel for better reliability
const commandSuccess = await Promise.any([
  // Method 1: Node.js writeFile (with timeout)
  new Promise(async (resolve, reject) => {
    // Implementation...
  }),
  
  // Method 2: Echo command through shell
  new Promise(async (resolve, reject) => {
    // Implementation...
  }),
  
  // Method 3: Alternative approach using cat
  new Promise(async (resolve, reject) => {
    // Implementation...
  })
]);
```

### 3. Enhanced Error Recovery
Added more robust error recovery mechanisms:

```javascript
// If all methods failed
if (!commandSuccess) {
  // Try more desperate measures - recreate FIFO and try direct command
  try {
    // Remove and recreate the FIFO as a last resort
    if (fs.existsSync(this.pianobarCtl)) {
      await execPromise(`rm ${this.pianobarCtl}`);
    }
    await execPromise(`mkfifo ${this.pianobarCtl}`);
    await execPromise(`chmod 666 ${this.pianobarCtl}`);
    
    // Try one more time with direct shell command
    await execPromise(`echo "${command}" > ${this.pianobarCtl}`);
  } catch (lastResortError) {
    // Error handling...
  }
}
```

### 4. Improved State Management
Enhanced the status updates to maintain consistent state:

```javascript
const statusUpdateData = { 
  updateTime: Date.now(), 
  lastCommand: command,
  isPianobarRunning: true  // Ensure we're recording that pianobar is still running
};
          
if (command === 'q') {
  this.isPlaying = false;
  this.isPianobarRunning = false; // Update internal state too
  statusUpdateData.status = 'stopped';
  statusUpdateData.isPianobarRunning = false;
  statusUpdateData.isPlaying = false;
}
```

## Benefits of the New Approach

1. **More Reliable Communication**: By trying multiple communication methods in parallel, the system has multiple chances to succeed.

2. **Better Error Recovery**: If all methods fail, the system will attempt more drastic measures rather than giving up.

3. **Consistent State Management**: The state variables `isPianobarRunning` and `isPlaying` are consistently updated throughout the code.

4. **Improved Logging**: Enhanced logging makes it easier to diagnose issues.

## Testing the Fix

To verify this fix is working:

1. Start pianobar with the "Turn On" button
2. Test changing stations - should work without timeout errors
3. Test playback controls (play, pause, next) - should work reliably
4. Stop pianobar with "Turn Off" - should fully terminate the process

These changes should provide a much more reliable FIFO communication experience with pianobar.