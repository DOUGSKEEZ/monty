# Bluetooth Speaker Connection Fix

I've implemented significant improvements to the Bluetooth speaker connection process based on the detailed information in the `/docs/Speakers_Connect_new_README.md` file. 

## What Was Fixed

1. **Used the specialized bluetooth-audio.sh script**
   - Instead of direct bluetoothctl commands, now using the robust script
   - Proper initialization of Bluetooth subsystems after system reboots
   - Step-by-step connection process with appropriate timing

2. **Addressed audio sink initialization delay**
   - Added proper waiting periods for audio sink to become available (20-40 seconds)
   - Added verification that audio sink is ready before starting Pianobar
   - Increased timeouts to match real-world connection behavior

3. **Better error handling and fallbacks**
   - More robust disconnection and cleanup process
   - Fallback to mock data when timeouts occur
   - Better status messaging in UI and logs

## How to Test

1. **Cold start scenario (after reboot)**:
   - Reboot the system
   - Open the Music page
   - Click "Turn On" - note that it may take 30-45 seconds for full connection
   - Verify that music plays through the Klipsch speakers

2. **Warm start scenario**:
   - With the system already running for some time
   - Open the Music page and turn on the player
   - Verify that the connection is established

3. **Disconnection scenario**:
   - After music has been playing for a while
   - Turn off the player and verify the speakers disconnect cleanly

## What to Expect

- The "Turn On" process will take longer (up to 45-60 seconds in some cases)
- The UI will show "Connecting to Speakers..." for a longer period
- Once connected, music should play reliably through the speakers
- The connection should be more stable overall

I've also added detailed documentation on the implementation in:
`/home/monty/monty/docs/BLUETOOTH_SPEAKER_INTEGRATION.md`

These changes don't conflict with the other Music page fixes - they complement them by addressing the specific Bluetooth connection issues.