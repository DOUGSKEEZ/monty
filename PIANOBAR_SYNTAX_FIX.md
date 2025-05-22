# PianobarService Syntax Error Fix

## Issue
There was a syntax error in the `PianobarService.js` file which was preventing the server from starting:

```
await is only valid in async functions and the top level bodies of modules
```

The error was occurring in a `setTimeout` callback that was using `await` without being declared as `async`.

## Fix Applied
The issue was in the `stopPianobar` method, inside a timeout callback that was attempting to use `await this.saveStatus()` without being declared as an async function:

```javascript
// Before fix:
const operationTimeout = setTimeout(() => {
  // ... code ...
  await this.saveStatus({ 
    status: 'stopped', 
    stopTime: Date.now(),
    error: 'Operation timed out'
  });
}, OPERATION_TIMEOUT);
```

Fixed by adding the `async` keyword to the arrow function:

```javascript
// After fix:
const operationTimeout = setTimeout(async () => {
  // ... code ...
  await this.saveStatus({ 
    status: 'stopped', 
    stopTime: Date.now(),
    error: 'Operation timed out'
  });
}, OPERATION_TIMEOUT);
```

## Testing
The server now loads successfully with no syntax errors.

## Important Notes
1. All asynchronous callbacks that use `await` must be declared as `async`
2. This applies to:
   - Methods
   - Arrow functions
   - Function expressions
   - Callbacks
   
3. When using setTimeout with callbacks that need to perform async operations, always declare the callback as `async` if it uses `await` internally.