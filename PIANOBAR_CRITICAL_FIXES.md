# Critical PianobarService Fixes

## Issues Addressed

### ISSUE 1: Pianobar Auto-Starting
- Problem: Pianobar was auto-starting when `/api/pianobar/status` was called
- Root cause: During initialization and periodic health checks, the service was performing live checks for pianobar processes

### ISSUE 2: FIFO Commands Broken 
- Problem: All FIFO writes were timing out with errors:
  ```
  [warn]: FIFO write timed out after 5 seconds
  [warn]: Alternative command method also failed: Command failed: echo "P" > /home/monty/.config/pianobar/ctl
  ```
- Root cause: The FIFO control file wasn't being created with proper permissions and wasn't being regenerated correctly when it failed

## Fixes Applied

### 1. FIFO Permissions Fix
- Added explicit permission setting (`chmod 666`) to make FIFO readable/writable by all users
- Added permission checks on existing FIFO files to ensure they're accessible
- Enhanced validity checks to verify FIFO files are actual named pipes, not regular files

### 2. FIFO Recreation
- Added logic to recreate the FIFO when a write operation fails
- Improved error handling around FIFO operations
- Added automatic FIFO validation during initialization

### 3. Eliminated Auto-Start Behavior
- Modified `initialize()` method to not auto-check if pianobar is running
- Modified `healthCheck()` method to use cached status instead of performing live checks
- Modified `recoveryProcedure()` to only perform cleanup if pianobar was already running

### 4. Orphaned FIFO Handling
- Added detection and cleanup of invalid FIFO files
- Added robust type checking to verify FIFO files are valid pipes
- Improved error handling when encountering problematic FIFO files

## Testing and Verification

To verify these fixes:
1. Restart the server
2. Verify pianobar doesn't auto-start when the page loads
3. Test the "Turn On" button to ensure pianobar starts properly
4. Test the "Turn Off" button to verify clean termination
5. Test playback controls to ensure FIFO commands work
6. Verify station switching functionality

## Implementation Details

### Key Fixes in Code

1. **FIFO Permissions in ensureConfigDir()**
   ```javascript
   // Set permissions to make FIFO readable/writable by all users
   await execPromise(`chmod 666 ${this.pianobarCtl}`);
   ```

2. **Improved FIFO Validation**
   ```javascript
   // Check if it's actually a FIFO (pipe) or just a regular file
   const stats = fs.statSync(this.pianobarCtl);
   if (!stats.isFIFO()) {
     logger.warn(`Found non-FIFO file at ${this.pianobarCtl}, removing and recreating`);
     await execPromise(`rm ${this.pianobarCtl}`);
     needNewFifo = true;
   }
   ```

3. **FIFO Recreation on Write Failure**
   ```javascript
   // Recreate the FIFO if it appears to be broken
   if (!writeResult.success) {
     // Delete and recreate the FIFO with proper permissions
     if (fs.existsSync(this.pianobarCtl)) {
       await execPromise(`rm ${this.pianobarCtl}`);
     }
     await execPromise(`mkfifo ${this.pianobarCtl}`);
     await execPromise(`chmod 666 ${this.pianobarCtl}`);
   }
   ```

4. **Elimination of Auto-Start in initialization**
   ```javascript
   // DO NOT auto-check if pianobar is running during initialization
   // This was causing auto-start behavior
   // Instead, assume it's not running until explicitly started
   logger.info('PianobarService initialized (assuming pianobar not running)');
   this.isPianobarRunning = false;
   this.isPlaying = false;
   ```

5. **Eliminated Auto-Check in healthCheck()**
   ```javascript
   // Don't auto-check if pianobar is running - this could trigger unwanted start
   // Just return the last known status from member variables
   // Only check when explicitly requested by user actions
   ```

## Next Steps

- Monitor the logs to ensure no further auto-start behavior
- Consider adding more robust recovery if FIFO communication fails repeatedly
- Add more detailed logging for pianobar process management
- Consider implementing a "safe mode" toggle that disables automatic recovery