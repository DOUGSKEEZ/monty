#!/bin/bash

# Minimal Bluetooth connection script for PipeWire
# PipeWire handles audio sinks automatically - we just need to manage the Bluetooth connection

ACTION=$1
SPEAKER_MAC="XX:XX:XX:XX:XX:XX"  # Replace with your Bluetooth speaker's MAC address
SPEAKER_NAME="Your Bluetooth Speaker"  # Replace with your speaker's name

# Function to check connection status
check_connection() {
  if bluetoothctl -- info "$SPEAKER_MAC" 2>/dev/null | grep -q "Connected: yes"; then
    return 0  # Connected
  else
    return 1  # Not connected
  fi
}

# Function to check if audio sink exists
check_audio_sink() {
  # Be more specific - check for the exact MAC address in the sink name
  if pactl list sinks short 2>/dev/null | grep -q "bluez.*XX_XX_XX_XX_XX_XX"; then
    return 0  # Audio sink exists
  else
    return 1  # No audio sink
  fi
}

# Function to get audio profile info
get_audio_profile() {
  local card_name=$(pactl list cards short 2>/dev/null | grep bluez | awk '{print $2}')
  if [ -n "$card_name" ]; then
    pactl list cards 2>/dev/null | grep -A 50 "$card_name" | grep "Active Profile:" | sed 's/.*Active Profile: //'
  else
    echo "No Bluetooth card found"
  fi
}

case "$ACTION" in
  connect)
    echo "Connecting to $SPEAKER_NAME..."

    # Ensure Bluetooth is powered on
    bluetoothctl -- power on >/dev/null 2>&1

    # Check for existing connection
    if check_connection; then
      if check_audio_sink; then
        echo "Already fully connected with audio sink ready"
        profile=$(get_audio_profile)
        echo "Audio profile: $profile"
        exit 0
      else
        echo "Clearing idle connection from power-save mode..."
        # Disconnect to clear the phantom connection
        bluetoothctl -- disconnect "$SPEAKER_MAC" >/dev/null 2>&1
        sleep 2
        # Now proceed with normal connection attempt
      fi
    fi

    # Attempt connection
    echo "Attempting connection..."
    output=$(bluetoothctl -- connect "$SPEAKER_MAC" 2>&1)

    # Check if connect command was accepted
    if echo "$output" | grep -q "Connection successful\|Already connected"; then
      echo "Connection initiated..."

      # ALWAYS wait through the false-positive period
      # Speakers send deceptive "connected" signal at ~3s whether warm or cold start
      echo "Waiting for initial handshake (this takes a moment)..."
      for i in {1..5}; do
        echo -ne "  Initialization... ($i/5)\r"
        sleep 1
      done
      echo ""

      # Now we're past the false-positive window (5+ seconds)
      # Warm starts will stay connected, cold starts will show disconnected
      echo "Verifying connection stability..."

      stable_count=0
      disconnected_count=0
      cold_start_detected=false

      # Check for up to 33 seconds total (extra time for difficult cold starts)
      for i in {1..28}; do
        echo -ne "  Checking connection... ($((i+5))/33)\r"

        # Check both connection and sink
        if check_connection && check_audio_sink; then
          stable_count=$((stable_count + 1))
          disconnected_count=0  # Reset disconnect counter

          # If stable for 3 consecutive checks, we have a good connection
          if [ $stable_count -ge 3 ]; then
            echo -e "\n✅ Connection verified and stable!"

            # Determine if this was warm or cold based on timing
            if [ $i -le 5 ] && [ "$cold_start_detected" = false ]; then
              echo "Type: Warm start (speakers were already on)"
            else
              echo "Type: Cold start complete (speakers have finished waking up)"
            fi

            profile=$(get_audio_profile)
            echo "Audio profile: $profile"

            # Set as default sink
            sink_name=$(pactl list sinks short | grep "bluez.*XX_XX_XX_XX_XX_XX" | awk '{print $2}')
            if [ -n "$sink_name" ]; then
              pactl set-default-sink "$sink_name" 2>/dev/null
              echo "Set as default audio output"
            fi

            echo "✅ Successfully connected and ready for audio playback"
            exit 0
          fi
        else
          stable_count=0  # Reset stability counter

          # Track disconnections - this indicates cold start
          if ! check_connection; then
            disconnected_count=$((disconnected_count + 1))
            if [ $disconnected_count -ge 2 ] && [ "$cold_start_detected" = false ]; then
              cold_start_detected=true
              echo -e "\nDetected cold start - speakers are waking from sleep..."
              echo "This typically takes 15-25 more seconds. Please wait..."
            fi
          fi
        fi

        sleep 1
      done

      # Timeout after 33 seconds total
      echo -e "\n⚠️ Connection process timed out after 33 seconds"

      # Final check
      if check_connection && check_audio_sink; then
        echo "✅ But connection and sink are now available!"
        exit 0
      elif check_connection; then
        echo "Bluetooth is connected but audio sink not ready"
        echo "Try running '$0 status' in a few seconds"
        exit 1
      else
        echo "Connection failed or unstable"
        echo "Try running the command again or power cycle the speakers"
        exit 1
      fi

    else
      echo "❌ Failed to connect"
      echo "Error: $output"
      echo ""
      echo "Troubleshooting:"
      echo "1. Ensure speakers are powered on"
      echo "2. Check if speakers are in pairing mode"
      echo "3. Try: bluetoothctl -- remove $SPEAKER_MAC && bluetoothctl -- scan on"
      echo "   Then re-pair the device"
      exit 1
    fi
    ;;

  disconnect)
    echo "Disconnecting from $SPEAKER_NAME..."
    bluetoothctl -- disconnect "$SPEAKER_MAC"

    if ! check_connection; then
      echo "✅ Disconnected successfully"
      exit 0
    else
      echo "⚠️ May still be connected"
      exit 1
    fi
    ;;

  status)
    echo "Bluetooth Audio Status"
    echo "====================="

    # Connection status
    if check_connection; then
      # Check if this is a phantom connection
      if check_audio_sink; then
        echo "Connection: ✅ Connected"
        echo "Audio Sink: ✅ Available"

        # Get sink details
        sink_name=$(pactl list sinks short | grep "bluez.*XX_XX_XX_XX_XX_XX" | awk '{print $2}')
        if [ -n "$sink_name" ]; then
          echo "Sink Name:  $sink_name"

          # Check if it's the default
          default_sink=$(pactl get-default-sink 2>/dev/null)
          if [ "$default_sink" = "$sink_name" ]; then
            echo "Default:    ✅ Yes"
          else
            echo "Default:    ❌ No (use 'pactl set-default-sink $sink_name' to set)"
          fi
        fi

        # Audio profile
        profile=$(get_audio_profile)
        echo "Profile:    $profile"

        # Codec info from bluetoothctl
        echo ""
        echo "Bluetooth Details:"
        bluetoothctl -- info "$SPEAKER_MAC" | grep -E "Name:|Connected:|Paired:|Trusted:"

        echo ""
        echo "Status: Fully operational"
      else
        # Phantom connection - speakers in power-save mode
        echo "Connection: ❌ Idle (power-save)"
        echo "Audio Sink: ❌ Not available"
        echo ""
        echo "Speakers are in power-save mode (auto-shutdown)."

        # Auto-disconnect the phantom connection
        bluetoothctl -- disconnect "$SPEAKER_MAC" >/dev/null 2>&1
        sleep 1  # Give disconnect time to complete

        # Check if actually disconnected or if PipeWire reconnected
        if check_connection; then
          echo "Note: Audio system attempting to reconnect (active audio stream detected)"
          echo "The connection will complete when speakers power back on."
        else
          echo "✅ Idle connection has been cleared"
          echo ""
          echo "Run '$0 connect' when ready to play music (takes ~20s from cold start)"
        fi
      fi
    else
      echo "Connection: ❌ Not connected"
      echo "Audio Sink: ❌ Not available"
      echo ""
      echo "Run '$0 connect' to establish connection"
      exit 1
    fi
    exit 0
    ;;

  init)
    # Pre-flight checks for Bluetooth readiness
    # Powers on Bluetooth controller and verifies basic requirements

    # Ensure Bluetooth controller is powered on
    bluetoothctl -- power on >/dev/null 2>&1

    # Check critical services
    if ! systemctl --user is-active --quiet pipewire pipewire-pulse wireplumber; then
      echo "PipeWire services not active"
      exit 1
    fi

    if ! systemctl is-active --quiet bluetooth; then
      echo "Bluetooth service not active"
      exit 1
    fi

    echo "Bluetooth initialized"
    exit 0
    ;;

  wakeup)
    # Legacy compatibility - no longer needed with PipeWire
    echo "Wakeup not required with PipeWire"
    exit 0
    ;;

  debug)
    # Diagnostic information for troubleshooting
    echo "Bluetooth service status:"
    systemctl status bluetooth | grep Active || echo "Unable to check"

    echo "PipeWire status:"
    systemctl --user is-active pipewire pipewire-pulse wireplumber 2>/dev/null || echo "Not active"

    echo "Speaker device status:"
    if bluetoothctl -- info "$SPEAKER_MAC" 2>/dev/null | grep -q "Device"; then
      echo "Device is available"
    else
      echo "Device is NOT available"
    fi

    echo "Connection status:"
    if check_connection; then
      echo "Connected to speakers"
    else
      echo "NOT connected to speakers"
    fi

    echo "Audio sink status:"
    if check_audio_sink; then
      echo "Audio sink exists"
      # Show sink state
      echo "Sink state:"
      pactl list sinks 2>/dev/null | grep -A 3 "bluez" | grep -E "State:|Name:|Available:" || echo "No details"
    else
      echo "Audio sink does NOT exist"
    fi

    exit 0
    ;;

  *)
    echo "Usage: $0 {connect|disconnect|status|init|wakeup|debug}"
    echo ""
    echo "Minimal Bluetooth audio control for PipeWire"
    echo ""
    echo "Commands:"
    echo "  connect    - Connect to $SPEAKER_NAME"
    echo "  disconnect - Disconnect from speakers"
    echo "  status     - Show connection and audio status"
    echo "  init       - Initialize Bluetooth controller"
    echo "  wakeup     - (Legacy - no longer needed)"
    echo "  debug      - Show diagnostic information"
    echo ""
    echo "Note: PipeWire automatically handles audio sink creation."
    echo "      If connected but no audio, just start playing something."
    exit 1
    ;;
esac