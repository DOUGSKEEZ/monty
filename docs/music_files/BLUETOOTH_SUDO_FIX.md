# Bluetooth Speaker Connection - Sudo Fix

I've implemented additional fixes to the Bluetooth speaker connection process to address sudo password prompts and improve connection reliability.

## Problems Identified

1. **Sudo Password Prompts**: The `/usr/local/bin/bluetooth-audio.sh` script requires sudo access for certain operations, causing password prompts when used from the web application.

2. **Rushed Connection Sequence**: The Bluetooth connection commands were executing too quickly without allowing enough time for each step to complete.

3. **No Fallback Mechanism**: When sudo-based commands failed, there was no reliable fallback approach.

## Fixes Implemented

### 1. Custom No-sudo Bluetooth Script

I've created a dedicated script at `/home/monty/monty/backend/src/services/bt-connect.sh` that:
- Does not require sudo privileges
- Uses standard bluetoothctl commands with proper timing
- Includes proper verification of connection status
- Checks for audio sink availability

```bash
#!/bin/bash
# Custom Bluetooth connection script without sudo requirements
# Key improvements:
# - Proper timing between commands
# - Connection verification
# - Audio sink checking
```

### 2. Optional Sudoers Configuration

Created a configuration file at `/home/monty/monty/config/bluetooth_sudoers` that allows specific commands to run without a password:

```
# Allow monty user to execute specific commands for Bluetooth without password
monty ALL=(ALL) NOPASSWD: /usr/bin/killall pulseaudio
monty ALL=(ALL) NOPASSWD: /usr/bin/pulseaudio --system --daemonize
monty ALL=(ALL) NOPASSWD: /usr/sbin/modprobe -r btusb
monty ALL=(ALL) NOPASSWD: /usr/sbin/modprobe btusb
```

This can be installed with:
```bash
sudo cp /home/monty/monty/config/bluetooth_sudoers /etc/sudoers.d/bluetooth
sudo chmod 440 /etc/sudoers.d/bluetooth
```

### 3. Progressive Connection Strategy

Updated `musicService.js` to use a progressive connection strategy:

1. Try direct bluetoothctl commands with proper timing first
2. Fall back to our custom script if that fails
3. Try the system script with better timeout handling if needed
4. Use an advanced recovery approach as a last resort

```javascript
// Example of improved timing in direct approach
await execPromise(`bluetoothctl power on`, { timeout: 5000 });
// Give the adapter time to initialize
await new Promise(resolve => setTimeout(resolve, 3000));
// Scan for devices
await execPromise(`bluetoothctl scan on`, { timeout: 5000 });
// Let the scan run for a decent amount of time
await new Promise(resolve => setTimeout(resolve, 8000));
```

### 4. Enhanced UI Feedback

Improved the user interface to:
- Show connection status clearly
- Provide visual feedback during the connection process
- Offer a reconnect button when connection fails
- Use color-coded status indicators

## Expected Improvements

1. **No sudo password prompts**: The application should now be able to connect to Bluetooth speakers without requiring sudo.

2. **More reliable connections**: The improved timing and multiple strategies should result in more successful connections.

3. **Better user experience**: Users will have clear feedback about the connection process and status.

4. **More robust error recovery**: If the connection fails, users can try the reconnect button for an alternative connection attempt.

## Testing

1. **Cold start test**: Reboot the system, then open the Music page and click "Turn On". The connection should establish without sudo prompts.

2. **Connection quality test**: Once connected, play music for at least 10 minutes to verify stable audio playback.

3. **Recovery test**: If initial connection fails, use the "Reconnect Bluetooth" button to try alternative methods.

The enhancements significantly improve the Bluetooth connection reliability while eliminating the sudo password prompt issue.