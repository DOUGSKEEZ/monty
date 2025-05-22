# Pianobar Event Command Script Fix

## Issue
The FIFO communication with pianobar was failing due to a JavaScript error in the `createEventCommandScript()` method:

```
Error creating event command script: i is not defined
```

This error was causing:
- All FIFO writes to time out
- Command recreation to fail
- No commands reaching pianobar

## Root Cause Analysis
The issue was found in the `createEventCommandScript()` method of the PianobarService, which generates a Bash script to handle pianobar events. The specific error was in the `usergetstations` event handler where a C-style for loop was used:

```bash
# Build a list of stations
for ((i=0; i<stationCount; i++)); do
  # loop body
done
```

The problem is that if `stationCount` is not properly defined or is not a number, it would cause the error "i is not defined" in the Bash script.

## Fixes Applied

### 1. Safer Looping Construct
Replaced the C-style for loop with a more robust while loop approach:

```bash
# Make sure stationCount is defined and is a number
if [ -n "$stationCount" ] && [ "$stationCount" -eq "$stationCount" ] 2>/dev/null; then
  # Build a list of stations using a safer loop
  i=0
  while [ "$i" -lt "$stationCount" ]; do
    # Loop body
    
    # Increment counter manually to avoid bash math issues
    i=$((i+1))
  done
fi
```

### 2. Improved Input Validation
Added validation to ensure variables are properly defined:

```bash
# Make sure stationCount is defined and is a number
if [ -n "$stationCount" ] && [ "$stationCount" -eq "$stationCount" ] 2>/dev/null; then
  # Only proceed if stationCount is valid
  # ...
else
  echo "Invalid stationCount: $stationCount" >> /tmp/pianobar_events.log
fi
```

### 3. Enhanced Error Handling
Added fallback strategies for when the input parsing fails:

```bash
# Try to extract station name
stationName=$(echo "$line" | grep -o "station${i}=\([^&]*\)" | cut -d'=' -f2)
          
# Use default name if extraction failed
if [ -n "$stationName" ]; then
  stations="$stations\"$stationName\""
  echo "Found station$i=$stationName" >> /tmp/pianobar_events.log
else
  stations="$stations\"Station $i\""
  echo "Station$i not found, using default name" >> /tmp/pianobar_events.log
fi
```

### 4. Improved Event Parsing
Enhanced the initial event parsing to be more resilient:

```bash
# Read once, avoiding piping issues
read -r line || true

# Debugging - log the event to make troubleshooting easier
echo "Processing event: $line" >> /tmp/pianobar_events.log

# Extract event type
event=$(echo "$line" | grep -o 'event=[[:alnum:]]\+' | cut -d'=' -f2)

# If event is empty, try to recover
if [ -z "$event" ]; then
  echo "Warning: Failed to extract event, trying fallback method" >> /tmp/pianobar_events.log
  event=$(echo "$line" | grep -o 'event=[^ &]\+' | cut -d'=' -f2)
fi

# If still empty, set a default
if [ -z "$event" ]; then
  echo "Error: Could not extract event from input: $line" >> /tmp/pianobar_events.log
  event="unknown"
fi
```

### 5. Better Logging
Added comprehensive logging to make troubleshooting easier:

```bash
# Log for debugging
echo "Song started - title: $title, artist: $artist, station: $station" >> /tmp/pianobar_events.log

# Log final output
echo "Final stations array: $stations" >> /tmp/pianobar_events.log
```

### 6. Improved JSON Handling
Enhanced the JSON creation with proper string escaping:

```bash
title=$(echo "$line" | grep -o 'title=\([^&]*\)' | cut -d'=' -f2 | sed 's/"/\\"/g')
artist=$(echo "$line" | grep -o 'artist=\([^&]*\)' | cut -d'=' -f2 | sed 's/"/\\"/g')
```

### 7. Status Field Standardization
Updated the status file format to include consistent fields like `isPianobarRunning` and `isPlaying`:

```bash
cat > "$STATUS_FILE" <<EOL
{
  "status": "playing",
  "song": "$title",
  "artist": "$artist",
  "album": "$album",
  "station": "$station",
  "duration": "$songDuration",
  "isPianobarRunning": true,
  "isPlaying": true,
  "updateTime": $(date +%s000)
}
EOL
```

## Testing the Fix

To verify this fix is working:

1. Start pianobar by clicking "Turn On"
2. Verify that the stations list loads correctly
3. Try using the Play, Pause, and Next commands to verify FIFO communication
4. Check `/tmp/pianobar_events.log` for any debugging information

This fix should resolve all issues with FIFO communication, ensuring commands properly reach pianobar.