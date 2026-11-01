#!/bin/bash
#
# Bluetooth speaker control for Monty (called by backend BluetoothService).
#
# `connect` exit codes - a contract BluetoothService acts on:
#   0 = speaker audio ready (its PulseAudio sink exists)
#   1 = speaker unreachable (asleep, off, or out of range) - a reset can't help
#   2 = stuck: BlueZ answered "busy", or the playback profile connected but no
#       audio sink ever appeared - the backend's stuck-link recovery takes over

ACTION=$1
DEBUG_FLAG=$2
SPEAKER_MAC="54:B7:E5:87:7B:73"
SPEAKER_NAME="Klipsch The Fives"
SPEAKER_SINK="bluez_sink.${SPEAKER_MAC//:/_}"
# The speaker is paired on the TP-Link UB500 dongle. A 2nd (onboard) radio
# handles BLE sensor scanning and may be BlueZ's "default" controller, so we
# pin ALL speaker bluetoothctl ops to the dongle by MAC to avoid the wrong radio.
CONTROLLER_MAC="E0:D3:62:EA:29:10"
# A2DP Sink = the speaker's playback side (Monty -> speaker). The Fives also
# offers A2DP Source, so a plain "connect" (all profiles) can fall through to the
# reverse direction (speaker -> Monty: "connected" but silent) when the forward
# one is stuck "busy" - seen Oct 31 2026 after a speaker power-cycle.
A2DP_SINK_UUID="0000110b-0000-1000-8000-00805f9b34fb"
CONNECT_ATTEMPTS=2
SINK_TIMEOUT=36   # Seconds to wait for the audio sink after the profile connects
SINK_SETTLE=2     # Sink must be seen this many seconds in a row before "ready"

# Function to log debug info if debug flag is set
debug_log() {
  if [ "$DEBUG_FLAG" = "debug" ]; then
    echo "[DEBUG] $1"
  fi
}

# Run bluetoothctl command(s) against the speaker's controller (the dongle),
# not whatever BlueZ currently treats as "default" (the onboard scanning radio).
btctl() {
  { echo "select $CONTROLLER_MAC"; sleep 0.2; echo "$*"; sleep 0.4; echo "quit"; } | bluetoothctl 2>/dev/null
}

# Connect ONLY the A2DP Sink profile on the dongle (bluetoothctl 5.72's connect
# can't take a profile, so use BlueZ's D-Bus ConnectProfile). hci numbers shuffle
# across reboots, so resolve the dongle's hciN from its MAC.
# Returns 0 = connected, 2 = BlueZ busy (stuck), 1 = anything else (asleep/off/unreachable)
connect_playback() {
  local hci out
  hci=$(hciconfig | awk -v mac="$CONTROLLER_MAC" '/^hci/{h=$1; sub(":","",h)} $0 ~ "BD Address: " mac {print h; exit}')
  if [ -z "$hci" ]; then
    echo "Bluetooth dongle $CONTROLLER_MAC not found"
    return 1
  fi
  out=$(dbus-send --system --print-reply --reply-timeout=20000 --dest=org.bluez \
    "/org/bluez/$hci/dev_${SPEAKER_MAC//:/_}" org.bluez.Device1.ConnectProfile string:$A2DP_SINK_UUID 2>&1)
  if echo "$out" | grep -qE "method return|AlreadyConnected"; then
    return 0
  fi
  echo "ConnectProfile failed: $(echo "$out" | grep -o 'Error.*' | head -1)"
  if echo "$out" | grep -qi "busy"; then
    return 2
  fi
  return 1
}

# One line for the logs on failure: is there any link to the speaker, and is it
# classic (ACL - can carry audio) or LE (low energy - can't)?
link_report() {
  local link
  link=$(hcitool con 2>/dev/null | grep "$SPEAKER_MAC" | awk '{print $2}' | head -1)
  echo "Link to speaker: ${link:-none}"
}

# Make sure the dongle is powered.
# (This used to restart PulseAudio, reload its Bluetooth module, and unload/reload
# the btusb driver via sudo. Removed Nov 2026: the backend's NoNewPrivileges always
# blocked sudo, and if it had ever run it would have cut all audio and taken down
# BOTH radios, Govee sensors included.)
initialize_bluetooth() {
  echo "Initializing Bluetooth controller..."
  btctl power on > /dev/null
  sleep 1
}

# Function to attempt speaker wake-up (similar to how phones wake them)
wakeup_speakers() {
  echo "Attempting to wake up speakers from deep sleep..."

  # Start scanning (broadcast wake-up signals)
  echo "Beginning active Bluetooth scan..."
  btctl scan on > /dev/null
  sleep 12  # Longer scan to ensure wake signals are broadcast

  # Send direct connection attempts (even if they fail, they help wake the device)
  echo "Sending wake-up signals to speakers..."
  for i in {1..3}; do
    connect_playback > /dev/null
    sleep 5
  done

  # Stop scanning
  btctl scan off > /dev/null

  # Final "poke" to ensure device is awake
  btctl info $SPEAKER_MAC > /dev/null

  echo "Wake-up sequence completed"
  sleep 2
}

# Does the speaker's audio sink exist? (An idle sink suspends itself after ~5s -
# that is still ready; PulseAudio resumes it on demand.)
check_audio_sink_exists() {
  pactl list short sinks 2>/dev/null | grep -q "$SPEAKER_SINK"
}

# Function to check connection status
check_connection() {
  if btctl info $SPEAKER_MAC | grep -q "Connected: yes"; then
    return 0  # Connected
  else
    return 1  # Not connected
  fi
}

# Function to check if device is available
check_device_available() {
  if btctl info $SPEAKER_MAC | grep -q "Device $SPEAKER_MAC not available"; then
    return 1  # Not available
  else
    return 0  # Available
  fi
}

# Wait for PulseAudio to create the speaker's sink after the playback profile
# connects. Exits 0 once it has been there SINK_SETTLE seconds in a row, or 2 if
# it never appears (stuck - the backend's recovery takes over).
wait_for_audio_sink() {
  local seen=0
  for i in $(seq 1 $SINK_TIMEOUT); do
    if check_audio_sink_exists; then
      seen=$((seen + 1))
      debug_log "Sink seen ($seen/$SINK_SETTLE) after ${i}s"
      if [ $seen -ge $SINK_SETTLE ]; then
        echo "✅ Success! Audio sink is ready for playback"
        exit 0
      fi
    else
      seen=0
    fi
    sleep 1
  done
  echo "❌ Failed to establish audio sink (playback profile connected, no audio after ${SINK_TIMEOUT}s)"
  link_report
  exit 2
}

case "$ACTION" in
  connect)
    echo "Connecting to $SPEAKER_NAME..."
    initialize_bluetooth

    # Check if device is available first
    if ! check_device_available; then
      echo "Device not available, attempting wake-up sequence..."
      wakeup_speakers
    fi

    # Already playing to the speaker? Nothing to do.
    if check_audio_sink_exists; then
      echo "✅ Success! Speaker audio already ready for playback"
      exit 0
    fi

    # "Connected" means the playback profile connected - never just "Connected: yes"
    # from bluetoothctl, which any link (even one that can't carry audio) satisfies.
    for attempt in $(seq 1 $CONNECT_ATTEMPTS); do
      echo "Connecting playback to speakers... (attempt $attempt/$CONNECT_ATTEMPTS)"
      connect_playback
      case $? in
        0)
          echo "Playback connected, waiting for audio sink..."
          wait_for_audio_sink  # exits 0 (ready) or 2 (stuck)
          ;;
        2)
          echo "❌ BlueZ is stuck (busy) - needs a reset"
          link_report
          exit 2
          ;;
      esac
      [ $attempt -lt $CONNECT_ATTEMPTS ] && sleep 3
    done

    echo "❌ Failed to connect to speakers (asleep, off, or out of range)"
    link_report
    echo "Suggestions:"
    echo "  1. Check if speakers are powered on and set to Bluetooth"
    echo "  2. Try running: $0 wakeup"
    exit 1
    ;;

  init)
    initialize_bluetooth
    echo "Bluetooth subsystems initialized."
    exit 0
    ;;

  wakeup)
    initialize_bluetooth
    wakeup_speakers
    echo "Wake-up sequence completed. Try connecting now."
    exit 0
    ;;

  disconnect)
    echo "Disconnecting from $SPEAKER_NAME..."
    btctl disconnect $SPEAKER_MAC
    exit 0
    ;;

  status)
    echo "Checking connection status..."
    if check_connection; then
      echo "Speakers are connected"

      if check_audio_sink_exists; then
        echo "Audio sink exists and is ready for playback"
        exit 0
      else
        echo "No audio sink detected"
        exit 3
      fi
    else
      echo "Speakers are not connected"
      exit 1
    fi
    ;;

  debug)
    echo "Showing Bluetooth and audio system debug information..."
    DEBUG_FLAG="debug"

    # Bluetooth system status
    echo "Bluetooth service status:"
    systemctl status bluetooth | grep Active

    # PulseAudio status
    echo "PulseAudio status:"
    if pgrep -f "pulseaudio.*--system" > /dev/null; then
      echo "PulseAudio is running in system mode"
    elif [ -S /var/run/pulse/native ]; then
      echo "PulseAudio is running in system mode (socket detected)"
    else
      echo "PulseAudio is NOT running"
    fi

    # Device status
    echo "Speaker device status:"
    check_device_available && echo "Device is available" || echo "Device is NOT available"

    # Connection status
    echo "Connection status:"
    check_connection && echo "Connected to speakers" || echo "NOT connected to speakers"
    link_report

    # Audio sink status
    echo "Audio sink status:"
    check_audio_sink_exists && echo "Audio sink exists" || echo "Audio sink does NOT exist"

    # Show state if sink exists
    if check_audio_sink_exists; then
      echo "Sink state:"
      pactl list sinks | grep -A 3 "$SPEAKER_SINK" | grep -E "State:|Name:|Available:"
    fi

    exit 0
    ;;

  *)
    echo "Usage: $0 {connect|disconnect|status|init|wakeup|debug} [debug]"
    echo
    echo "Commands:"
    echo "  connect     - Connect to $SPEAKER_NAME speakers"
    echo "  disconnect  - Disconnect from speakers"
    echo "  status      - Show current connection status"
    echo "  init        - Make sure the Bluetooth dongle is powered on"
    echo "  wakeup      - Just attempt to wake up speakers without connecting"
    echo "  debug       - Show detailed debug information about Bluetooth and audio status"
    echo
    echo "Options:"
    echo "  debug       - Add this as a second parameter to show debug info (e.g., '$0 connect debug')"
    exit 1
    ;;
esac
