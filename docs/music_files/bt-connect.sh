#!/bin/bash

ACTION=$1
DEBUG_FLAG=$2
SPEAKER_MAC="54:B7:E5:87:7B:73"
SPEAKER_NAME="Klipsch The Fives"
MAX_ATTEMPTS=15
ATTEMPT_WAIT=3
EXPECTED_READY_TIME=24  # Expected seconds until audio sink is ready
GRACE_PERIOD=5          # Grace period after sink appears before declaring success

# Function to log debug info if debug flag is set
debug_log() {
  if [ "$DEBUG_FLAG" = "debug" ]; then
    echo "[DEBUG] $1"
  fi
}

# Function to initialize Bluetooth subsystems
initialize_bluetooth() {
  echo "Initializing Bluetooth subsystems..."
  
  # Ensure PulseAudio is running
  sudo killall pulseaudio || true
  sleep 1
  sudo pulseaudio --system --daemonize
  sleep 2
  
  # Reset Bluetooth modules if needed
  if ! pactl list cards | grep -q "bluez"; then
    echo "Reloading Bluetooth modules..."
    sudo modprobe -r btusb
    sleep 2
    sudo modprobe btusb
    sleep 2
  fi
  
  # Initialize bluetoothctl
  echo "Initializing Bluetooth controller..."
  echo -e "power on\nquit" | bluetoothctl > /dev/null
  sleep 2
}

# Function to attempt speaker wake-up (similar to how phones wake them)
wakeup_speakers() {
  echo "Attempting to wake up speakers from deep sleep..."
  
  # Start scanning (broadcast wake-up signals)
  echo "Beginning active Bluetooth scan..."
  echo -e "scan on\nquit" | bluetoothctl > /dev/null
  sleep 12  # Longer scan to ensure wake signals are broadcast
  
  # Send direct connection attempts (even if they fail, they help wake the device)
  echo "Sending wake-up signals to speakers..."
  for i in {1..3}; do
    echo -e "connect $SPEAKER_MAC\nquit" | bluetoothctl > /dev/null
    sleep 5
  done
  
  # Stop scanning
  echo -e "scan off\nquit" | bluetoothctl > /dev/null
  
  # Final "poke" to ensure device is awake
  echo -e "info $SPEAKER_MAC\nquit" | bluetoothctl > /dev/null
  
  echo "Wake-up sequence completed"
  sleep 2
}

# Function to check if a basic audio sink exists
check_audio_sink_exists() {
  if pactl list sinks 2>/dev/null | grep -q "bluez_sink"; then
    return 0  # Audio sink exists
  else
    return 1  # Audio sink doesn't exist
  fi
}

# Function to check if audio sink is FULLY ready to play audio, but without disrupting
check_audio_sink_ready() {
  # Check if sink exists first
  if ! check_audio_sink_exists; then
    debug_log "No sink exists"
    return 1  # Sink doesn't even exist
  fi
  
  # Check sink state - we want RUNNING or IDLE but not SUSPENDED
  # We use grep without trailing context here to reduce the chance of disrupting the connection
  sink_state=$(pactl list sinks 2>/dev/null | grep -m1 -A1 "bluez_sink" | grep "State:" | awk '{print $2}')
  debug_log "Current sink state: $sink_state"
  
  if [ "$sink_state" = "SUSPENDED" ]; then
    debug_log "Sink is in SUSPENDED state"
    return 1  # Sink is suspended
  fi
  
  # If we made it here, basic checks pass
  return 0
}

# Function to check connection status
check_connection() {
  if bluetoothctl -- info $SPEAKER_MAC | grep -q "Connected: yes"; then
    return 0  # Connected
  else
    return 1  # Not connected
  fi
}

# Function to check if device is available
check_device_available() {
  if bluetoothctl -- info $SPEAKER_MAC | grep -q "Device $SPEAKER_MAC not available"; then
    return 1  # Not available
  else
    return 0  # Available
  fi
}

# Function to safely load the Bluetooth module without unloading first
safe_load_module() {
  debug_log "Safely loading Bluetooth module..."
  pactl load-module module-bluetooth-discover >/dev/null 2>&1 || true
}

# Function to get current timestamp in seconds
get_timestamp() {
  date +%s
}

# Function to wait for audio sink to be ready with smarter detection
wait_for_audio_sink() {
  local sink_first_detected=0
  local sink_detection_time=0
  
  # Try multiple times to get audio sink with short waits between attempts
  for i in $(seq 1 $MAX_ATTEMPTS); do
    echo -ne "Checking for audio sink... (attempt $i/$MAX_ATTEMPTS)\r"
    
    # Only try loading the module for first several attempts
    if [ $i -le 8 ]; then
      safe_load_module
    fi
    
    # First detect if sink exists
    if check_audio_sink_exists; then
      # If this is the first time we detect it, record the time
      if [ $sink_first_detected -eq 0 ]; then
        sink_first_detected=1
        sink_detection_time=$(get_timestamp)
        debug_log "Sink first detected at $(date)"
      fi
      
      # Get current time to check if grace period has elapsed
      current_time=$(get_timestamp)
      elapsed_since_detection=$((current_time - sink_detection_time))
      debug_log "Elapsed time since sink detection: $elapsed_since_detection seconds"
      
      # Check if grace period has passed since initial detection
      if [ $elapsed_since_detection -ge $GRACE_PERIOD ]; then
        # After grace period, just check if sink exists and is not suspended
        if check_audio_sink_ready; then
          echo -e "\n✅ Success! Audio sink is ready for playback"
          
          # If sink has been around for grace period and isn't suspended, exit
          debug_log "Sink exists for ${elapsed_since_detection}s and passes checks"
          exit 0
        else
          debug_log "Sink exists but not passing ready checks yet"
        fi
      else
        # During grace period, just report that we're waiting for it to initialize
        remaining_grace=$((GRACE_PERIOD - elapsed_since_detection))
        debug_log "In grace period, ${remaining_grace}s remaining"
        echo -e "\nAudio sink detected, waiting ${remaining_grace}s for it to initialize..."
      fi
    else
      # Reset detection if sink disappears
      if [ $sink_first_detected -eq 1 ]; then
        debug_log "Sink disappeared after detection, resetting detection timer"
        sink_first_detected=0
      fi
    fi
    
    # Print progress indicator every other attempt if sink not yet detected
    if [ $sink_first_detected -eq 0 ] && [ $((i % 2)) -eq 1 ]; then
      # Calculate remaining time based on expected readiness
      remaining=$((EXPECTED_READY_TIME - (i * ATTEMPT_WAIT)))
      echo -e "\nWaiting for audio sink to be ready (~$remaining seconds remaining)..."
    fi
    
    sleep $ATTEMPT_WAIT
  done
  
  # Final checks
  if check_audio_sink_exists; then
    if check_audio_sink_ready; then
      echo "✅ Success! Audio sink exists and appears ready"
      exit 0
    else
      echo "⚠️ Audio sink exists but may not be fully ready"
      echo "Try playing some audio anyway - it may work despite not showing as ready"
      exit 1
    fi
  else
    echo "❌ Failed to establish audio sink after multiple attempts"
    exit 2
  fi
}

case "$ACTION" in
  connect)
    echo "Connecting to $SPEAKER_NAME..."

    # Initialize Bluetooth subsystems
    initialize_bluetooth
    
    # Check if device is available first
    if ! check_device_available; then
      echo "Device not available, attempting wake-up sequence..."
      wakeup_speakers
    fi
    
    # Make sure Bluetooth is on
    bluetoothctl -- power on
    
    # First try - If already connected, don't try to connect again
    if check_connection; then
      echo "Speakers already connected, checking audio sink..."
    else
      echo "Attempting to connect to speakers..."
      bluetoothctl -- connect $SPEAKER_MAC
    fi
    
    # Wait for connection to stabilize
    sleep 5
    
    # Check connection and audio sink
    if check_connection; then
      echo "Connected to speakers, now establishing audio sink..."
      wait_for_audio_sink
      # The script should exit inside the wait_for_audio_sink function
    else
      echo "Failed to connect to speakers, trying with wake-up sequence..."
      wakeup_speakers
      sleep 2
      bluetoothctl -- connect $SPEAKER_MAC
      
      sleep 8
      if check_connection; then
        echo "Connected after wake-up sequence, now waiting for audio sink..."
        wait_for_audio_sink
        # The script should exit inside the wait_for_audio_sink function
      else
        echo "Failed to connect after multiple attempts"
        exit 1
      fi
    fi
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
    bluetoothctl -- disconnect $SPEAKER_MAC
    exit 0
    ;;
    
  status)
    echo "Checking connection status..."
    if check_connection; then
      echo "Speakers are connected"
      
      if check_audio_sink_exists; then
        if check_audio_sink_ready; then
          echo "Audio sink exists and is ready for playback"
          exit 0
        else
          echo "Audio sink exists but may not be fully ready"
          exit 2
        fi
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
    pulseaudio --check && echo "PulseAudio is running" || echo "PulseAudio is NOT running"
    
    # Device status
    echo "Speaker device status:"
    check_device_available && echo "Device is available" || echo "Device is NOT available"
    
    # Connection status
    echo "Connection status:"
    check_connection && echo "Connected to speakers" || echo "NOT connected to speakers"
    
    # Audio sink status
    echo "Audio sink status:"
    check_audio_sink_exists && echo "Audio sink exists" || echo "Audio sink does NOT exist"
    
    # Show state if sink exists
    if check_audio_sink_exists; then
      echo "Sink state:"
      pactl list sinks | grep -A 3 "bluez_sink" | grep -E "State:|Name:|Available:"
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
    echo "  init        - Initialize Bluetooth subsystems (useful after reboot)"
    echo "  wakeup      - Just attempt to wake up speakers without connecting"
    echo "  debug       - Show detailed debug information about Bluetooth and audio status"
    echo
    echo "Options:"
    echo "  debug       - Add this as a second parameter to show debug info (e.g., '$0 connect debug')"
    exit 1
    ;;
esac
