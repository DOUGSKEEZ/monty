# Pianobar Service Critical Fixes

## Issues Fixed

We addressed several critical issues in the PianobarService to improve stability and reliability:

### 1. Process Management Improvements

The primary issue was that the service was having difficulty properly managing pianobar processes, resulting in zombie processes, hanging operations, and "crazy terminal battle" states when users tried to control pianobar.

#### Fixed by:

- Completely redesigned the `cleanupOrphanedProcesses` method with:
  - Step-by-step approach to process termination (graceful, standard, force)
  - Enhanced logging with operation IDs for tracing
  - Multiple verification methods to ensure all processes are gone
  - Process-by-process termination rather than group commands
  - Global timeout to prevent hanging cleanups
  - Comprehensive logging of all discovered processes and kill attempts

### 2. Mutex Handling Improvements

The existing mutex locks weren't preventing concurrent operations, which could lead to process conflicts.

#### Fixed by:

- Implemented robust mutex handling in `stopPianobar` with:
  - Double-check mutex pattern for race condition prevention
  - Clear operation timeouts to prevent deadlocks
  - Proper cleanup of mutex locks even on errors
  - Better logging of mutex state transitions
  - Clear error messages for operation collision scenarios

### 3. FIFO Command Handling Improvements

FIFO commands to pianobar were hanging and not completing properly.

#### Fixed by:

- Enhanced `sendCommand` method with:
  - Timeout protection for FIFO writes
  - Alternative command methods when primary fails
  - Command-specific operation tracking
  - Better error recovery
  - Fallback to direct process handling for critical commands like quit

### 4. Status File Corruption Prevention

The status file was getting corrupted during writes.

#### Fixed by:

- Completely redesigned `saveStatus` method with:
  - True atomic writes using temp files with unique names
  - fsync to ensure data is flushed to disk
  - JSON corruption recovery
  - Multiple fallback mechanisms
  - Detailed error tracking
  - Emergency minimal writes when all else fails

## Key Improvements

### 1. Comprehensive Logging

- Added operation IDs to all operations for tracing through logs
- Added detailed step-by-step logging for complex operations
- Logged process details including PIDs, parent PIDs, and command lines
- Added timing information for performance tracking
- Added result verification logging

### 2. Timeout Protection

- Added timeouts to all operations that might hang:
  - Process cleanup has a 30-second global timeout
  - Stop operation has a 60-second global timeout
  - FIFO writes have a 5-second timeout
  - Status file operations have a 5-second timeout

### 3. Error Recovery

- Implemented multiple fallback mechanisms:
  - When FIFO writes fail, try alternative methods
  - When atomic writes fail, try direct writes
  - When process termination fails, try different methods
  - When all else fails, force state reset

### 4. State Consistency

- Ensured consistent state across all operations:
  - Status file reflects actual process state
  - Internal state variables are always updated
  - Status changes are logged for debugging
  - Emergency state reset when operations fail

## Testing and Monitoring

### Testing Recommendations

1. Start and stop pianobar multiple times in succession
2. Try different control operations in rapid succession
3. Check logs for any "crazy terminal battle" evidence
4. Verify no zombie processes remain after operations
5. Check status file for corruption

### Monitoring Indicators

- Watch for logs containing `[cleanup-` to track process cleanup operations
- Watch for logs containing `[cmd-` to track command operations
- Check for logs containing "STILL exist after all cleanup attempts" which indicates stubborn processes
- Monitor for mutex handling logs like "Operation already in progress"

## Next Steps

1. Consider implementing a proper pianobar process manager
2. Add more robust recovery procedures to ServiceWatchdog
3. Implement Circuit Breakers for external process interactions
4. Add automatic cleanup of temporary files in case of failures
5. Consider implementing proper WebSocket-based status updates

---

This work should significantly improve the reliability and stability of the PianobarService, particularly in handling the "Turn Off" functionality which was previously causing process management issues.

The most important changes were to the process cleanup logic, which now takes a methodical, step-by-step approach to ensure all pianobar processes are properly terminated.