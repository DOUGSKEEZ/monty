# Klipsch The Fives Bluetooth Connection Script

A robust, production-ready script for establishing and maintaining reliable Bluetooth connections with Klipsch The Fives speakers on Linux systems.

## Overview

This script solves the challenging problem of establishing reliable Bluetooth audio connections with Klipsch The Fives speakers, especially when dealing with their power-saving/sleep mode. It implements sophisticated timing-based detection, wake-up sequences, and connection recovery techniques developed through extensive testing.

## Key Features

- **Deep Sleep Recovery**: Successfully wakes and connects to speakers in power-saving mode
- **Audio Sink Detection**: Proper handling of PulseAudio Bluetooth sink establishment
- **Grace Period Approach**: Sophisticated timing-based detection to handle sink initialization
- **Robust Command Interface**: Simple commands for connection, disconnection, and status
- **Diagnostic Features**: Detailed debugging and status reporting
- **Production Ready**: Extensive error handling and recovery mechanisms

## Challenges Addressed

Connecting to high-end Bluetooth speakers like Klipsch The Fives presents several unique challenges this script addresses:

1. **Sleep Mode Recovery**: When in sleep mode, speakers require multiple wake-up attempts before accepting connections
2. **Audio Sink Timing**: Even after connecting, the audio sink can take up to 25 seconds to become fully available
3. **False Ready States**: Simple checks can report audio sinks as ready when they're actually not usable
4. **Connection Disruption**: Aggressive checking can disrupt an establishing connection
5. **PulseAudio Quirks**: Bluetooth modules in PulseAudio require careful handling to avoid breaking connections

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
   - Attempts direct connection
   - If failed, tries wake-up sequence for sleeping speakers
   - Uses multiple connection attempts with progressive timeouts

3. **Audio Sink Establishment**:
   - Detects when audio sink first appears
   - Uses a grace period approach (waits 5 seconds after detection)
   - Applies careful probing to avoid disrupting the connection
   - Uses simplified checks after grace period

4. **Timing-Based Success Detection**:
   - Timestamps when sink first appears
   - Monitors elapsed time since detection
   - Only declares success after grace period
   - Handles both quick connections and slow wake-ups

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

```
# Connect speakers at 8 AM every weekday
0 8 * * 1-5 /usr/local/bin/bt-connect.sh connect

# Disconnect speakers at 6 PM every weekday
0 18 * * 1-5 /usr/local/bin/bt-connect.sh disconnect
```

## Lessons Learned

During development, we discovered several key insights:

1. **Connection Timing Matters**: Speaker wake-up and audio sink establishment have distinct timelines
2. **Progressive Approach Works Best**: Multiple attempts with varying techniques yield highest success
3. **Grace Period Is Essential**: Allowing time after initial sink detection significantly improves reliability
4. **Minimal Checking After Detection**: Aggressive checks after initial detection can disrupt connections
5. **Context-Aware Checking**: Different checks are needed depending on the connection stage

## Troubleshooting

### Common Issues

1. **"Device not available" error**:
   - Ensure speakers are powered on
   - Try the `wakeup` command first, then connect
   - Check MAC address is correct

2. **Connection succeeds but no audio**:
   - Run `status` command to verify audio sink state
   - Ensure no other device is connected to speakers
   - Try disconnecting and reconnecting

3. **Connection fails repeatedly**:
   - Restart PulseAudio: `pulseaudio -k && sudo pulseaudio --system --daemonize`
   - Reset Bluetooth controller: `sudo hciconfig hci0 reset`
   - Power cycle the speakers

### Getting Logs

For troubleshooting, use the debug flag:

```bash
./bt-connect.sh connect debug
```

## Limitations

- Only tested with Klipsch The Fives, though should work with similar speakers
- Requires PulseAudio (not tested with PipeWire)
- Designed for headless/server environments rather than desktop
- Requires sudo access for certain Bluetooth operations

## License

This script is provided under the MIT License. Feel free to modify and distribute according to your needs.

## Credits

This script was developed through iterative testing and refinement to solve the real-world challenges of Bluetooth speaker connectivity in automated environments. Special thanks to the PulseAudio and BlueZ communities for their documentation.
