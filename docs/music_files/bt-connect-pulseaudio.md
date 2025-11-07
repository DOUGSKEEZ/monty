# Klipsch The Fives Bluetooth Connection Script (DEPRECATED - PulseAudio Version)

**⚠️ DEPRECATED**: This documentation is for the old PulseAudio-based script.
**See [bt-connect-pipewire.md](./bt-connect-pipewire.md) for the current PipeWire version.**

---

*Original documentation preserved for reference:*

A robust, production-ready script for establishing and maintaining reliable Bluetooth connections with Klipsch The Fives speakers on Linux systems.

## Overview

This script solves the challenging problem of establishing reliable Bluetooth audio connections with Klipsch The Fives speakers, especially when dealing with their power-saving/sleep mode. It implements sophisticated timing-based detection, wake-up sequences, and connection recovery techniques developed through extensive testing.

## Key Features

- **Deep Sleep Recovery**: Successfully wakes and connects to speakers in power-saving mode
- **Audio Sink Detection**: Proper handling of PulseAudio Bluetooth sink establishment
- **Grace Period Approach**: Sophisticated timing-based detection to handle sink initialization
- **Optimized Connection Logic**: Avoids unnecessary wake-up sequences when speakers are responsive
- **Robust Command Interface**: Simple commands for connection, disconnection, and status
- **Diagnostic Features**: Detailed debugging and status reporting
- **Production Ready**: Extensive error handling and recovery mechanisms

## Challenges Addressed

Connecting to high-end Bluetooth speakers like Klipsch The Fives presents several unique challenges this script addresses:

1. **Sleep Mode Recovery**: When in sleep mode, speakers require multiple wake-up attempts before accepting connections
2. **Audio Sink Timing**: Even after connecting, the audio sink can take up to 25 seconds to become fully available
3. **False Ready States**: Simple checks can report audio sinks as ready when they're actually not usable
4. **Connection State Confusion**: Distinguishing between "connected but not ready" vs "truly failed to connect"
5. **Connection Disruption**: Aggressive checking can disrupt an establishing connection
6. **PulseAudio Quirks**: Bluetooth modules in PulseAudio require careful handling to avoid breaking connections

## Requirements

- Linux system (tested on Ubuntu Server 22.04 LTS)
- PulseAudio installed (system mode)
- `bluetoothctl` and related Bluetooth utilities
- `sudo` access for hardware operations

## Installation

1. Save the script to a location like `/usr/local/bin/bt-connect.sh`
2. Make it executable: `chmod +x /usr/local/bin/bt-connect.sh`
3. Configure your speaker's MAC address in the script (default: 54:B7:E5:87:7B:73)

## Usage

The script provides several commands for different operations:

```bash
# Initialize Bluetooth subsystems (recommended after system boot)
./bt-connect.sh init

# Connect to speakers (handles both cold/warm start scenarios)
./bt-connect.sh connect

# Check the current connection status
./bt-connect.sh status

# Disconnect from speakers
./bt-connect.sh disconnect

# Just attempt to wake speakers without full connection
./bt-connect.sh wakeup

# Show detailed debug information
./bt-connect.sh debug

# Add debug flag to any command for detailed logs
./bt-connect.sh connect debug
```

## How It Works

The script uses a sophisticated approach to connection management:

1. **Initialization Phase**:
   - Ensures PulseAudio is running
   - Resets Bluetooth subsystems if needed
   - Prepares the Bluetooth controller

2. **Connection Phase**:
   - Checks if already connected (skips unnecessary steps)
   - Attempts direct connection with up to 2 attempts
   - Only uses wake-up sequence when device is truly unavailable
   - Provides clear error messages for failed connections

3. **Audio Sink Establishment**:
   - Detects when audio sink first appears
   - Uses a grace period approach (waits 3 seconds after detection)
   - Applies careful probing to avoid disrupting the connection
   - Uses simplified checks after grace period

4. **Timing-Based Success Detection**:
   - Timestamps when sink first appears
   - Monitors elapsed time since detection
   - Only declares success after grace period
   - Handles both quick connections and slow wake-ups

## Performance Characteristics

### Typical Connection Times

- **Already connected**: ~1-2 seconds (just audio sink verification)
- **Speakers awake**: ~15-20 seconds (connection + audio sink establishment)
- **Speakers in sleep mode**: ~45-60 seconds (wake-up + connection + audio sink)

### Success Indicators

The script provides clear success/failure feedback:
- ✅ Success with ready audio sink
- ⚠️ Connected but audio sink may need time
- ❌ Complete connection failure with troubleshooting suggestions

## Integration Guide

### Integrating with Web Services or Applications

This script can be integrated with web services, smart home systems, or any application that needs to control Bluetooth speakers:

```python
# Python example
import subprocess
import time

def connect_speakers():
    # Initialize Bluetooth subsystems first
    subprocess.run(["/usr/local/bin/bt-connect.sh", "init"])
    
    # Then attempt connection
    result = subprocess.run(["/usr/local/bin/bt-connect.sh", "connect"], capture_output=True, text=True)
    
    # Check if connection was successful
    if result.returncode == 0:
        print("Connection successful")
        return True
    else:
        print("Connection failed:", result.stdout)
        return False

def get_connection_status():
    """Check current connection status without attempting to connect"""
    result = subprocess.run(["/usr/local/bin/bt-connect.sh", "status"], capture_output=True, text=True)
    return {
        'connected': result.returncode == 0,
        'audio_ready': result.returncode == 0,
        'message': result.stdout.strip()
    }

def play_audio():
    # First ensure speakers are connected
    if connect_speakers():
        # Then play audio through the system
        subprocess.run(["paplay", "/path/to/audio.wav"])

def disconnect_speakers():
    subprocess.run(["/usr/local/bin/bt-connect.sh", "disconnect"])
```

### Integration with Systemd

You can create a systemd service for automatic connection on boot:

```ini
[Unit]
Description=Bluetooth Speaker Connection
After=bluetooth.service pulseaudio.service
Wants=bluetooth.service pulseaudio.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/bt-connect.sh connect
RemainAfterExit=true
ExecStop=/usr/local/bin/bt-connect.sh disconnect

[Install]
WantedBy=multi-user.target
```

### Integration with Cron Jobs

For scheduled connections, set up a cron job:

```bash
# Connect speakers at 8 AM every weekday
0 8 * * 1-5 /usr/local/bin/bt-connect.sh connect

# Disconnect speakers at 6 PM every weekday
0 18 * * 1-5 /usr/local/bin/bt-connect.sh disconnect
```

### Home Assistant Integration

For Home Assistant users, you can create a shell command:

```yaml
# configuration.yaml
shell_command:
  connect_speakers: "/usr/local/bin/bt-connect.sh connect"
  disconnect_speakers: "/usr/local/bin/bt-connect.sh disconnect"
  speaker_status: "/usr/local/bin/bt-connect.sh status"
```

## Lessons Learned

During development, we discovered several key insights:

1. **Connection Timing Matters**: Speaker wake-up and audio sink establishment have distinct timelines
2. **Progressive Approach Works Best**: Multiple attempts with varying techniques yield highest success
3. **Grace Period Is Essential**: Allowing time after initial sink detection significantly improves reliability
4. **Minimal Checking After Detection**: Aggressive checks after initial detection can disrupt connections
5. **Context-Aware Checking**: Different checks are needed depending on the connection stage
6. **Avoid Unnecessary Wake-ups**: Don't trigger wake-up sequences when speakers are already responsive
7. **Clear Error Reporting**: Users need actionable feedback when connections fail

## Troubleshooting

### Common Issues

1. **"Device not available" error**:
   - Ensure speakers are powered on
   - Try the `wakeup` command first, then connect
   - Check MAC address is correct in the script

2. **Connection succeeds but no audio**:
   - Run `status` command to verify audio sink state
   - Ensure no other device is connected to speakers
   - Try disconnecting and reconnecting
   - Wait 30 seconds and try playing audio again

3. **Connection fails repeatedly**:
   - Restart PulseAudio: `pulseaudio -k && sudo pulseaudio --system --daemonize`
   - Reset Bluetooth controller: `sudo hciconfig hci0 reset`
   - Power cycle the speakers
   - Check for interference from other Bluetooth devices

4. **"br-connection-busy" errors**:
   - This indicates a connection is already in progress
   - Wait 10 seconds and try again
   - If persistent, disconnect first: `./bt-connect.sh disconnect`

### Exit Codes

The script uses meaningful exit codes for automation:

- `0`: Success
- `1`: Connection failed or speakers not connected
- `2`: Connected but audio sink not fully ready
- `3`: Connected but no audio sink detected

### Getting Logs

For troubleshooting, use the debug flag:

```bash
./bt-connect.sh connect debug
```

This provides detailed timing information and connection state changes.

## Configuration

### Customizing for Other Speakers

To adapt this script for other Bluetooth speakers:

1. **Change the MAC address**: Update `SPEAKER_MAC` variable
2. **Adjust timing**: Some speakers may need different `EXPECTED_READY_TIME` or `GRACE_PERIOD`
3. **Modify wake-up sequence**: Different speakers may need different wake-up approaches

### Performance Tuning

You can adjust these variables for your specific setup:

- `MAX_ATTEMPTS`: Maximum attempts to establish audio sink (default: 15)
- `ATTEMPT_WAIT`: Seconds between audio sink checks (default: 3)
- `EXPECTED_READY_TIME`: Expected seconds for full connection (default: 24)
- `GRACE_PERIOD`: Wait time after sink detection (default: 3)
- `CONNECTION_WAIT`: Wait time after connection attempt (default: 8)

## Limitations

- Only tested with Klipsch The Fives, though should work with similar speakers
- Requires PulseAudio (not tested with PipeWire)
- Designed for headless/server environments rather than desktop
- Requires sudo access for certain Bluetooth operations
- May need tuning for speakers with different power management behaviors

## Version History

### Recent Optimizations

- **Connection Logic Improvement**: Eliminated unnecessary wake-up sequences when speakers are responsive
- **Cleaner Error Handling**: Better distinction between connection failures and timing issues
- **Reduced Connection Attempts**: Streamlined to maximum 2 attempts for faster feedback

## License

This script is provided under the MIT License. Feel free to modify and distribute according to your needs.

## Credits

This script was developed through iterative testing and refinement to solve the real-world challenges of Bluetooth speaker connectivity in automated environments. Special thanks to the PulseAudio and BlueZ communities for their documentation.