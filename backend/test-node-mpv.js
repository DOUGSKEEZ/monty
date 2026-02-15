/**
 * test-node-mpv.js - Event Model Investigation
 *
 * Purpose: Understand which events fire for:
 * - Natural track end (EOF)
 * - User/programmatic stop
 * - This determines queue auto-advance logic!
 *
 * Usage:
 *   node test-node-mpv.js <audio-url-or-file>
 *
 * Example:
 *   # First resolve a YouTube URL
 *   URL=$(yt-dlp -g --no-playlist -f bestaudio "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
 *   node test-node-mpv.js "$URL"
 *
 *   # Or use a local file
 *   node test-node-mpv.js ~/Music/StarCraft_Terran_Theme.mp3
 */

const mpv = require('node-mpv');

// Get audio source from command line
const audioSource = process.argv[2];
if (!audioSource) {
  console.log('Usage: node test-node-mpv.js <audio-url-or-file>');
  console.log('');
  console.log('Example with YouTube (two-step):');
  console.log('  URL=$(yt-dlp -g --no-playlist -f bestaudio "https://www.youtube.com/watch?v=dQw4w9WgXcQ")');
  console.log('  node test-node-mpv.js "$URL"');
  console.log('');
  console.log('Example with local file:');
  console.log('  node test-node-mpv.js ~/Music/StarCraft_Terran_Theme.mp3');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('node-mpv Event Model Investigation');
console.log('='.repeat(60));
console.log(`Audio source: ${audioSource.substring(0, 80)}...`);
console.log('');
console.log('Listening for ALL events. Press Ctrl+C to quit.');
console.log('Commands: [s]top, [p]ause, [r]esume, [e]nd (seek to -10s), [q]uit');
console.log('');

// Create mpv player with our production config
const player = new mpv({
  audio_only: true,
  verbose: false,  // Set to true for mpv debug output
  socket: '/tmp/monty-jukebox-test.sock'
}, [
  '--no-video',
  '--volume=80',
  '--volume-max=100',
  '--no-config',
  '--load-scripts=no'
]);

// Timestamp helper
const ts = () => new Date().toISOString().substr(11, 12);

// Log ALL events we can think of
const events = [
  'started', 'stopped', 'paused', 'resumed', 'quit',
  'idle', 'seek', 'crashed', 'error',
  'statuschange', 'timeposition'
];

// Track timeposition separately (it's noisy)
let lastTimePosition = -1;

events.forEach(eventName => {
  player.on(eventName, (...args) => {
    if (eventName === 'timeposition') {
      // Only log every 5 seconds to reduce noise
      const pos = Math.floor(args[0]);
      if (pos !== lastTimePosition && pos % 5 === 0) {
        lastTimePosition = pos;
        console.log(`[${ts()}] EVENT: timeposition = ${pos}s`);
      }
    } else {
      console.log(`[${ts()}] EVENT: ${eventName}`, args.length ? JSON.stringify(args) : '');
    }
  });
});

// Also try some events that might exist
['playback-restart', 'end-file', 'file-loaded', 'eof-reached'].forEach(eventName => {
  player.on(eventName, (...args) => {
    console.log(`[${ts()}] EVENT: ${eventName}`, args.length ? JSON.stringify(args) : '');
  });
});

// Handle stdin for interactive commands
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (key.ctrl && key.name === 'c') {
    console.log(`\n[${ts()}] Ctrl+C - quitting...`);
    player.quit();
    setTimeout(() => process.exit(0), 500);
    return;
  }

  switch (key.name) {
    case 's':
      console.log(`\n[${ts()}] USER ACTION: Calling player.stop()`);
      try {
        player.stop();
      } catch (e) {
        console.log(`[${ts()}] stop() error: ${e.message}`);
      }
      break;
    case 'p':
      console.log(`\n[${ts()}] USER ACTION: Calling player.pause()`);
      try {
        player.pause();
      } catch (e) {
        console.log(`[${ts()}] pause() error: ${e.message}`);
      }
      break;
    case 'r':
      console.log(`\n[${ts()}] USER ACTION: Calling player.resume()`);
      try {
        player.resume();
      } catch (e) {
        console.log(`[${ts()}] resume() error: ${e.message}`);
      }
      break;
    case 'q':
      console.log(`\n[${ts()}] USER ACTION: Calling player.quit()`);
      player.quit();
      setTimeout(() => process.exit(0), 500);
      break;
    case 'e':
      console.log(`\n[${ts()}] USER ACTION: Seeking to 10 seconds before end...`);
      try {
        // Seek to near the end to test natural EOF
        player.goToPosition(-10);  // -10 = 10 seconds from end
      } catch (e) {
        console.log(`[${ts()}] seek error: ${e.message}`);
      }
      break;
  }
});

// Start playback
console.log(`[${ts()}] Loading audio...`);
try {
  player.load(audioSource);
  console.log(`[${ts()}] load() called - waiting for 'started' event...`);
} catch (err) {
  console.error(`[${ts()}] load() error: ${err.message}`);
  process.exit(1);
}

// Keep process running
process.on('SIGINT', () => {
  console.log(`\n[${ts()}] SIGINT received, quitting...`);
  player.quit();
  setTimeout(() => process.exit(0), 500);
});
