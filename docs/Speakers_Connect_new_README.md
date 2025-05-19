# Bluetooth Speaker Integration: Klipsch The Fives

This document outlines the behavior, challenges, and solutions for connecting to Klipsch The Fives speakers via Bluetooth as part of the Monty home automation system.

## Speaker Details

- **Model**: Klipsch The Fives
- **MAC Address**: 54:B7:E5:87:7B:73
- **Connection Type**: Bluetooth A2DP
- **Behavior**: High-end speakers with power-saving features

## Key Insights About Bluetooth Connection Behavior

Through extensive testing, we discovered several important characteristics:

1. **System State Dependency**: After system reboots, the Bluetooth subsystem needs initialization before connections will succeed
2. **Delayed Audio Sink Initialization**: While Bluetooth connection happens quickly, the audio sink takes 20-40 seconds to become available
3. **Multiple Connection Attempts Required**: From standby mode, speakers need sequential connection attempts with appropriate delays
4. **Disruption Risk**: Attempting to connect to already-connected speakers disrupts the existing connection
5. **Progressive Timeouts**: Each attempt needs increasingly longer wait times
6. **Stable Once Connected**: After fully connected with audio sink, connection remains stable

## Implementation

We've created a robust script at `/usr/local/bin/bluetooth-audio.sh` that handles:

- Bluetooth stack initialization after reboots
- Progressive connection attempts with increasing timeouts
- Audio sink detection and waiting
- Status checking
- Safe disconnection

### Connection Process

The implemented solution:

1. Initializes the Bluetooth subsystem and PulseAudio
2. Makes an initial connection attempt
3. Waits for the connection to stabilize (5 seconds)
4. Checks if audio sink is available
5. If not available, makes up to 6 additional attempts to load the audio module
6. Uses progressively longer wait times between attempts (8s → 10s → 12s → etc.)
7. Provides clear status feedback

### Usage

To initialize Bluetooth subsystems (useful after reboots):
```bash
/usr/local/bin/bluetooth-audio.sh init
```

### Implementation Recommendations for Monty

1. System Startup Handling: After system reboots, always run the 'init' command first
2. Early Connection: Start Bluetooth connection process 45-60 seconds before music should play
3. Status Verification: Always check for audio sink availability before attempting to play music
4. Disconnect When Done: Always disconnect speakers when music is no longer playing
5. Error Handling: Implement robust error handling for real-world reliability
6. Wake Up Feature: For morning alarms, ensure connection begins well before scheduled time


### Script Details
The current script is located at `/usr/local/bin/bluetooth-audio.sh` and implements all these learnings.
Key functions:
- `initialize_bluetooth()`: Prepares the Bluetooth stack and PulseAudio
- `check_audio_sink()`: Verifies if the audio sink is available
- `check_connection()`: Checks current connection status
- Progressive wait times for audio sink initialization

### Troubleshooting
If connection issues occur:
1. Run the init command first: `/usr/local/bin/bluetooth-audio.sh init`
2. Check if speakers are already connected to another device
3. Ensure speakers have power
4. Try power cycling the speakers
5. Check Bluetooth service status: `systemctl status bluetooth`
6. Verify PulseAudio is running: `sudo pulseaudio --system --check`


### Common Issues

- **"br-connection-profile-unavailable" error**: This typically occurs after system reboots when the Bluetooth stack isn't fully initialized. Run the `init` command, then try connecting again.
- **Connection succeeds but no audio**: The audio sink may not be ready yet. Check status and try reconnecting.
- **Speakers connect on phone but not server**: Ensure no other device is already connected to the speakers.

### Integration with Pianobar
For the Wake Up feature:
1. Run `init` command if after system reboot
2. Connect to speakers using the script
3. Verify audio sink is available
4. Start pianobar with: `pianobar`
5. When music should stop, properly disconnect


This implementation was developed through iterative testing and addresses the real-world behavior of high-end Bluetooth speakers with power-saving features, including handling system reboots.

This updated document includes:
1. New information about system state dependency
2. The new `init` command and its purpose
3. Enhanced troubleshooting section with the specific error we encountered
4. Recommendations for handling system reboots

The documentation now provides a comprehensive guide for Claude Code or anyone else working with the Bluetooth speaker integration in the Monty system.