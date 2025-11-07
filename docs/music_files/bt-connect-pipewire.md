# Bluetooth Connection Script for PipeWire

A minimal, efficient Bluetooth connection script for Klipsch The Fives speakers using PipeWire audio system.

## Overview

This script provides clean Bluetooth speaker management with PipeWire, replacing the complex PulseAudio-based approach. PipeWire automatically handles audio routing, eliminating the need for manual module loading and subsystem manipulation.

## Migration from PulseAudio to PipeWire

**Date**: November 2024

**Reason**: Choppy audio issues with PulseAudio Bluetooth that persisted despite extensive troubleshooting.

**Benefits**:
- Faster connection times (warm start: 2-5 seconds)
- No audio freezing when checking connection status
- Automatic codec selection (aptX HD support)
- Better handling of speaker power-save modes
- No manual module loading required

## Key Features

- **Adaptive Connection**: Automatically detects warm vs cold starts
- **Phantom Connection Handling**: Cleans up stale connections from speaker auto-shutdown
- **Non-Disruptive**: Doesn't interfere with active audio streams
- **Minimal Approach**: Lets PipeWire handle audio complexity automatically
- **33-Second Patience**: Extended timeout for difficult cold starts

## Script Behavior

### Warm Start (speakers already on)
- Connection completes in 2-5 seconds
- Immediate audio sink availability
- Script detects and exits quickly

### Cold Start (speakers in deep sleep)
- Initial false-positive at ~3 seconds (ignored)
- Connection drops at 5-15 seconds (expected)
- Real connection establishes at 15-30 seconds
- Script waits up to 33 seconds total

### Phantom Connections
When speakers auto-shutdown after 2-3 minutes of inactivity:
- Bluetooth connection remains but audio sink disappears
- `status` command automatically cleans up phantom
- `connect` command clears phantom before reconnecting

## Installation

1. Ensure PipeWire is installed and running:
```bash
sudo apt install pipewire pipewire-pulse wireplumber
systemctl --user enable --now pipewire pipewire-pulse wireplumber
```

2. Enable user lingering for PipeWire to start at boot:
```bash
sudo loginctl enable-linger $USER
```

3. Install the script:
```bash
sudo cp bt-connect-minimal.sh /usr/local/bin/bt-connect.sh
sudo chmod +x /usr/local/bin/bt-connect.sh
```

## Commands

### connect
Establishes connection to speakers. Handles both warm and cold starts automatically.
```bash
bt-connect.sh connect
```

### disconnect
Cleanly disconnects from speakers.
```bash
bt-connect.sh disconnect
```

### status
Shows current connection state. Automatically cleans up phantom connections.
```bash
bt-connect.sh status
```

Output states:
- `✅ Connected` - Fully operational
- `❌ Idle (power-save)` - Phantom connection (auto-cleaned)
- `❌ Not connected` - No connection

### init
Pre-flight checks for Bluetooth readiness. Powers on Bluetooth controller and verifies services.
```bash
bt-connect.sh init
```

### wakeup
Legacy compatibility command. Not needed with PipeWire.
```bash
bt-connect.sh wakeup  # Returns: "Wakeup not required with PipeWire"
```

### debug
Shows diagnostic information for troubleshooting.
```bash
bt-connect.sh debug
```

## Integration with Monty Backend

The BluetoothService.js calls this script for all Bluetooth operations:
- Called by web API endpoints
- Auto-disconnect timer (5 minutes after music stops)
- Status parsing updated for new output format

## Technical Details

### Speaker Behavior (Klipsch The Fives)
- Auto-shutdown after 2-3 minutes of no audio
- False-positive connection signal at ~3 seconds during cold start
- Full wake-up takes 15-30 seconds from deep sleep
- Similar behavior to Android phone connections (needs 2 attempts)

### PipeWire Advantages
- No system-wide daemon configuration needed
- Automatic Bluetooth discovery
- Dynamic audio routing
- Better codec support (aptX HD, LDAC)
- Lower latency
- No module loading required

### Configuration
- Speaker MAC: `54:B7:E5:87:7B:73`
- Speaker Name: `Klipsch The Fives`
- Connection timeout: 33 seconds
- Stability checks: 3 consecutive positive checks required

## Troubleshooting

### Music stops when checking status
- Fixed in PipeWire version - no longer manipulates audio subsystem

### Connection takes too long
- Cold starts can take up to 30 seconds
- This is normal speaker behavior, not a script issue

### Phantom connections after speaker auto-shutdown
- Run `status` command to auto-clean
- Or run `connect` which cleans phantoms automatically

### PipeWire services not running
```bash
systemctl --user status pipewire pipewire-pulse wireplumber
systemctl --user restart pipewire pipewire-pulse wireplumber
```

## Files

- Script location: `/usr/local/bin/bt-connect.sh`
- Old PulseAudio version: `/usr/local/bin/bt-connect_pulseaudio.sh.old`
- Development version: `~/bt-connect-minimal.sh`
- This documentation: `~/monty/docs/music_files/bt-connect-pipewire.md`

## Future Improvements

The `init` command provides a place to add pre-flight checks if audio quality issues arise:
- Codec verification
- Buffer size optimization
- Latency tuning
- RTL8821c chip-specific fixes

## Credits

PipeWire migration completed November 2024 to resolve persistent PulseAudio Bluetooth audio quality issues.