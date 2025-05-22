# Robust Pianobar Command Communication Fix

## Issues
Despite previous fixes, we continued to experience persistent issues with pianobar command communication:

1. FIFO write commands were timing out: `FIFO write timed out after 5 seconds`
2. Alternative command methods were failing: `Alternative command method also failed: Command failed: echo "s1" > /home/monty/.config/pianobar/ctl`
3. Pianobar process was not properly handling the FIFO communication

## Root Cause Analysis

The deeper investigation revealed several underlying issues:

1. **Process Initialization**: The pianobar process was being started in fully detached mode with all stdio streams ignored, making it difficult to debug issues.

2. **FIFO Blocking**: FIFO writes are blocking operations, and if pianobar isn't reading the FIFO, any write attempts would hang.

3. **Missing Fallback Mechanisms**: The code didn't have robust fallback mechanisms for when the primary FIFO communication failed.

## Comprehensive Fixes

### 1. Improved Process Startup
Modified the process startup to capture stdout/stderr for better debugging:

```javascript
// Create log files for pianobar output
const stdout = fs.openSync('/tmp/pianobar_stdout.log', 'a');
const stderr = fs.openSync('/tmp/pianobar_stderr.log', 'a');

// Start pianobar with output logging for better debugging
this.pianobarProcess = spawn('pianobar', [], {
  detached: true,
  stdio: ['ignore', stdout, stderr],
  env
});

// Log the PID for debugging
logger.info(`Started pianobar with PID: ${this.pianobarProcess.pid}`);

// Add an event listener for process exit
this.pianobarProcess.on('exit', (code, signal) => {
  logger.info(`Pianobar process exited with code ${code} and signal ${signal}`);
  this.isPianobarRunning = false;
  this.isPlaying = false;
});
```

### 2. Shell Script Approach for Command Sending
Implemented a more robust command sending mechanism using a shell script:

```javascript
// Create a temporary script for sending commands
const tempScriptPath = `/tmp/pianobar_cmd_${Date.now()}.sh`;
const scriptContent = `#!/bin/bash
# Directly send command to pianobar FIFO using multiple methods
echo "[$(date)] Sending command: ${command}" >> /tmp/pianobar_commands.log

# Check if pianobar is running
pids=$(pgrep -f pianobar || echo "")
if [ -z "$pids" ]; then
  echo "[$(date)] Error: Pianobar not running" >> /tmp/pianobar_commands.log
  exit 1
fi

# Check if FIFO exists
if [ ! -p "${this.pianobarCtl}" ]; then
  echo "[$(date)] FIFO doesn't exist, creating it" >> /tmp/pianobar_commands.log
  mkfifo "${this.pianobarCtl}"
  chmod 666 "${this.pianobarCtl}"
fi

# Try multiple ways to write to FIFO
echo "[$(date)] Trying echo method" >> /tmp/pianobar_commands.log
(echo "${command}" > "${this.pianobarCtl}") &
pid1=$!

sleep 1
kill -0 $pid1 2>/dev/null && {
  echo "[$(date)] Echo process ($pid1) still running, killing it" >> /tmp/pianobar_commands.log
  kill $pid1 2>/dev/null
}

# ... more methods and signal-based approach
`;
```

### 3. Alternative Signal-Based Communication
Added direct signal-based communication for play/pause controls:

```javascript
// For play/pause, try signal method too
if [ "${command}" = "P" ] || [ "${command}" = "S" ]; then
  echo "[$(date)] Using SIGUSR1 signal method for play/pause" >> /tmp/pianobar_commands.log
  pid=$(echo "$pids" | head -1)
  kill -SIGUSR1 $pid
fi
```

### 4. Enhanced Debugging and Logging
Added comprehensive logging throughout the command process:

```javascript
// Create dedicated log file for commands
echo "[$(date)] Sending command: ${command}" >> /tmp/pianobar_commands.log

// Log the result of each step
echo "[$(date)] Command processing complete" >> /tmp/pianobar_commands.log
```

### 5. Non-Blocking FIFO Writes
Implemented non-blocking FIFO writes with timeouts to prevent hanging:

```bash
# Run echo in background with timeout
(echo "${command}" > "${this.pianobarCtl}") &
pid1=$!

sleep 1
kill -0 $pid1 2>/dev/null && {
  echo "[$(date)] Echo process ($pid1) still running, killing it" >> /tmp/pianobar_commands.log
  kill $pid1 2>/dev/null
}
```

## Benefits of the New Approach

1. **Multiple Command Paths**: By trying multiple approaches in sequence, we increase the chances of a command getting through.

2. **Non-Blocking Operations**: Using background processes with timeouts prevents the Node.js server from hanging.

3. **Signal-Based Fallback**: For critical commands like play/pause, we have a signal-based approach that bypasses the FIFO entirely.

4. **Enhanced Debugging**: Comprehensive logging makes it easier to diagnose and fix issues.

5. **Self-Healing**: The script checks if pianobar is running and if the FIFO exists, fixing issues automatically when possible.

## Testing and Verification

To verify these fixes:

1. Start pianobar with the "Turn On" button
2. Check `/tmp/pianobar_stdout.log` and `/tmp/pianobar_stderr.log` for any errors
3. Try changing stations and control playback
4. If there are still issues, check `/tmp/pianobar_commands.log` for details on the command processing

This robust approach should ensure reliable communication with pianobar even in challenging scenarios.