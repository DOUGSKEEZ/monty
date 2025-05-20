# Pianobar Sequence Fix

I've implemented significant improvements to the music player functionality based on your feedback. Here are the key changes:

## Issues Fixed

1. **Proper Sequencing**: Pianobar now ONLY starts after successfully connecting to Bluetooth speakers
   - The previous implementation would try to continue even if Bluetooth connection failed
   - Now, pianobar will abort startup if Bluetooth connection fails

2. **Stations Display**: Fixed the issue with mock stations always showing
   - Added proper checks to only request real stations when pianobar is running
   - Added user-friendly messages to explain why stations aren't showing
   - Added better error handling in the station fetching process

3. **Cleaner User Interface**: Added explanatory messages
   - UI now shows "Turn on player to see your stations" when appropriate
   - Better visual indicators of when mock data is being shown

## Technical Improvements

1. **Sequential Execution**:
   ```javascript
   // Connect to Bluetooth first
   bluetoothConnected = await this.connectBluetooth();
   
   // If connection fails, abort pianobar startup
   if (!bluetoothConnected) {
     return {
       success: false,
       error: 'Failed to connect to Bluetooth speaker, pianobar will not start'
     };
   }
   
   // Verify audio sink is available before starting pianobar
   if (!audioSinkAvailable) {
     return {
       success: false,
       error: 'No Bluetooth audio sink available for music playback'
     };
   }
   
   // Only then start pianobar
   ```

2. **Improved Station Fetching**:
   - First checks if pianobar is running before attempting to fetch stations
   - Uses an active approach to send the station list command and wait for results
   - Implements multiple retry attempts with appropriate timing

3. **Better error handling**:
   - More detailed and actionable error messages
   - Graceful fallbacks when operations fail
   - Properly sequenced operations with verification steps

## What to Expect

1. **Starting the Player**:
   - When you click "Turn On," it will first connect to Bluetooth speakers
   - Only after confirming speaker connection will pianobar start
   - If Bluetooth connection fails, the player won't start at all (avoiding wasted Pandora sessions)

2. **Station Display**:
   - Before turning on the player, you'll see a message indicating you need to turn on the player to see stations
   - After turning on the player, you should see actual stations after a brief loading period
   - If stations can't be loaded, you'll see a helpful message

These changes should provide a much better user experience and prevent pianobar from running when it can't connect to speakers, saving your Pandora bandwidth and ensuring music only plays when it's supposed to.