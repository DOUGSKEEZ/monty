/**
 * JukeboxService.js - YouTube streaming and local library playback via mpv
 *
 * Handles:
 * - YouTube search via yt-dlp
 * - Audio playback via node-mpv
 * - Local library management (~/Music/)
 * - Queue system (On Deck / In the Hole)
 *
 * Key Design Notes:
 * - URLs from yt-dlp -g are EPHEMERAL - never cache them
 * - Both natural EOF and user stop fire 'stopped' event - use skipAutoAdvance flag
 * - Progress broadcasts are opt-in to avoid WebSocket spam
 */

const mpv = require('node-mpv');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('../utils/logger').getModuleLogger('jukebox-service');

// Singleton instance
let instance = null;

class JukeboxService {
  constructor(audioBroker, websocketService = null) {
    // Enforce singleton
    if (instance) {
      logger.warn('JukeboxService instance already exists, returning existing instance');
      return instance;
    }

    this.audioBroker = audioBroker;
    this.websocketService = websocketService;

    // mpv player instance
    this.mpvPlayer = null;
    this.isInitialized = false;

    // Playback state
    this.currentTrack = null;  // { title, artist, duration, youtubeId, filepath, source }
    this.isPlaying = false;
    this.position = 0;
    this.duration = 0;

    // Queue system - library tracks only
    this.queue = {
      onDeck: null,      // { filename, artist, title, filepath }
      inTheHole: null    // { filename, artist, title, filepath }
    };

    // Flag to prevent auto-advance on intentional stops
    // MUST be set for both stop() AND next() calls
    this.skipAutoAdvance = false;

    // Progress broadcast subscribers (WebSocket client tracking)
    this.progressSubscribers = new Set();

    // Library path
    this.libraryPath = path.join(process.env.HOME || '/home/monty', 'Music');

    // Search timeout (5 seconds)
    this.searchTimeout = 5000;

    // Register with AudioBroker
    if (this.audioBroker) {
      this.audioBroker.setJukeboxService(this);
    }

    logger.info('JukeboxService constructed (not yet initialized)');

    instance = this;
  }

  /**
   * Initialize the mpv player
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug('JukeboxService already initialized');
      return;
    }

    logger.info('Initializing JukeboxService...');

    try {
      // Create mpv player with our configuration
      this.mpvPlayer = new mpv({
        audio_only: true,
        verbose: false,
        socket: '/tmp/monty-jukebox.sock',
        time_update: 1  // Enable timeposition events (fires every 1 second)
      }, [
        '--no-video',
        '--volume=80',           // Comfortable default level
        '--volume-max=100',      // Absolute ceiling (software safety net)
        '--ytdl=no',             // Disable mpv's built-in ytdl_hook (broken with pip yt-dlp)
        '--no-config',
        '--load-scripts=no'
      ]);

      // Set up event handlers
      this._setupEventHandlers();

      this.isInitialized = true;
      logger.info('JukeboxService initialized successfully');

    } catch (error) {
      logger.error(`Failed to initialize JukeboxService: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set up mpv event handlers
   * @private
   */
  _setupEventHandlers() {
    // Track started playing
    this.mpvPlayer.on('started', () => {
      logger.info('mpv: Track started');
      this.isPlaying = true;

      // Re-register property observers (initial ones may be lost to socket race condition)
      // At this point socket is guaranteed connected because mpv just loaded a track
      // timeposition event requires: observed.filename, !observed.pause, currentTimePos
      // duration needed for local files (YouTube provides duration upfront)
      // IDs match node-mpv internal assignment: pause=2, duration=3, filename=5, time-pos=0
      try {
        this.mpvPlayer.observeProperty('time-pos', 0);
        this.mpvPlayer.observeProperty('pause', 2);
        this.mpvPlayer.observeProperty('duration', 3);
        this.mpvPlayer.observeProperty('filename', 5);
        logger.info('mpv: Re-registered property observers (time-pos, pause, duration, filename)');
      } catch (err) {
        logger.warn(`mpv: Failed to re-register observers: ${err.message}`);
      }

      this._broadcastStatus();
    });

    // Track stopped (could be natural EOF or user stop)
    this.mpvPlayer.on('stopped', () => {
      logger.info(`mpv: Stopped (skipAutoAdvance: ${this.skipAutoAdvance})`);

      if (this.skipAutoAdvance) {
        // User called stop() or next() - they're handling it
        this.skipAutoAdvance = false;
        logger.debug('Auto-advance skipped (intentional stop)');
      } else {
        // Natural EOF - auto-advance queue!
        logger.debug('Natural EOF detected, checking queue...');
        this._autoAdvanceQueue();
      }

      this.isPlaying = false;
      this._broadcastStatus();
    });

    // Paused
    this.mpvPlayer.on('paused', () => {
      logger.debug('mpv: Paused');
      this.isPlaying = false;
      this._broadcastStatus();
    });

    // Resumed
    this.mpvPlayer.on('resumed', () => {
      logger.debug('mpv: Resumed');
      this.isPlaying = true;
      this._broadcastStatus();
    });

    // Time position updates (every second - requires time_update option)
    this.mpvPlayer.on('timeposition', (seconds) => {
      this.position = seconds;

      // Only broadcast if there are subscribers (opt-in to reduce chatter)
      if (this.progressSubscribers.size > 0) {
        this._broadcastProgress();
      }
    });

    // Log when timeposition events start (confirms time_update is working)
    let firstTimeposition = true;
    this.mpvPlayer.on('timeposition', () => {
      if (firstTimeposition) {
        logger.info('mpv: First timeposition event received (time_update working)');
        firstTimeposition = false;
      }
    });

    // Status changes (captures duration for local files)
    this.mpvPlayer.on('statuschange', (status) => {
      if (status.duration && status.duration !== this.duration) {
        const previousDuration = this.duration;
        this.duration = status.duration;
        logger.debug(`mpv: Duration updated: ${previousDuration} → ${this.duration}`);

        // If duration was unknown (0) and now we have it, broadcast update
        // This is critical for local files where duration isn't known until loaded
        if (previousDuration === 0 && this.duration > 0) {
          this._broadcastStatus();
        }
      }
    });

    // Error handling - catches load failures, stream issues, etc.
    this.mpvPlayer.on('error', (error) => {
      logger.error(`mpv error: ${error}`);
    });

    logger.debug('mpv event handlers configured');
  }

  /**
   * Ensure mpv is healthy and responsive before playback
   * Detects stale IPC socket after reboot/idle and reinitializes if needed
   * @private
   */
  async _ensureMpvHealthy() {
    if (!this.mpvPlayer) {
      logger.debug('mpv: No player instance, skipping health check');
      return true;
    }

    try {
      // Query a simple property with timeout - stale sockets can hang forever
      // (Same lesson learned from FIFO hang: always timeout IPC operations)
      // 500ms is generous for local Unix socket on dedicated hardware - healthy mpv responds in <10ms
      await Promise.race([
        this.mpvPlayer.getProperty('idle-active'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 500)
        )
      ]);
      logger.debug('mpv: Health check passed');
      return true;
    } catch (err) {
      logger.warn(`mpv: Unresponsive (${err.message}), reinitializing...`);
      await this._reinitializeMpv();
      // Wait for socket to fully establish after fresh spawn
      // 500ms is generous - socket either establishes quickly or something is wrong
      await new Promise(resolve => setTimeout(resolve, 500));
      logger.debug('mpv: Socket settlement delay complete');
      return true;
    }
  }

  /**
   * Tear down and reinitialize mpv player
   * Called when IPC socket becomes stale after reboot/long idle
   * @private
   */
  async _reinitializeMpv() {
    logger.info('mpv: Reinitializing player...');

    // Kill existing mpv process via pkill (quit() can hang on stale socket)
    // Same pattern AudioBroker uses - OS-level kill is always reliable
    try {
      require('child_process').execSync('pkill -f "monty-jukebox.sock" || true', { timeout: 3000 });
      logger.debug('mpv: Killed via pkill');
    } catch (err) {
      logger.debug(`mpv: pkill cleanup: ${err.message}`);
    }
    this.mpvPlayer = null;

    // Clean up stale socket file if it exists
    const fs = require('fs');
    const socketPath = '/tmp/monty-jukebox.sock';
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
        logger.debug('mpv: Removed stale socket file');
      } catch (err) {
        logger.warn(`mpv: Could not remove socket file: ${err.message}`);
      }
    }

    // Reset state
    this.isInitialized = false;
    this.isPlaying = false;
    this.position = 0;

    // Reinitialize
    await this.initialize();
    logger.info('mpv: Reinitialized successfully');
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    logger.info('Shutting down JukeboxService...');

    if (this.mpvPlayer) {
      try {
        this.mpvPlayer.quit();
      } catch (error) {
        logger.warn(`Error quitting mpv: ${error.message}`);
      }
    }

    this.isInitialized = false;
    this.isPlaying = false;
    this.currentTrack = null;

    if (this.audioBroker) {
      this.audioBroker.releasePlayback('jukebox');
    }

    logger.info('JukeboxService shut down');
  }

  // ==================== PLAYBACK CONTROLS ====================

  /**
   * Play a YouTube video by ID
   * @param {string} youtubeId - YouTube video ID
   * @param {object} metadata - Optional metadata { title, artist, duration }
   */
  async playYouTube(youtubeId, metadata = {}) {
    logger.info(`Playing YouTube: ${youtubeId}`);

    // Ensure initialized
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Health check: verify mpv is responsive (catches stale socket after reboot/idle)
    await this._ensureMpvHealthy();

    // Acquire playback (kills pianobar if active)
    if (this.audioBroker) {
      const acquired = await this.audioBroker.acquirePlayback('jukebox');
      if (!acquired) {
        throw new Error('Failed to acquire playback');
      }
    }

    // IMPORTANT: Resolve URL fresh every time - URLs are EPHEMERAL
    // Never cache these! They expire in minutes.
    const streamUrl = await this._resolveYouTubeUrl(youtubeId);

    // Update current track info
    this.currentTrack = {
      title: metadata.title || 'Unknown',
      artist: metadata.artist || 'YouTube',
      duration: metadata.duration || 0,
      youtubeId: youtubeId,
      filepath: null,
      source: 'youtube'
    };

    // Load and play
    try {
      this.mpvPlayer.load(streamUrl);
      logger.info(`Loaded YouTube stream for: ${youtubeId}`);
    } catch (error) {
      logger.error(`Failed to load YouTube stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Play a local file from the library
   * @param {string} filepath - Full path to the audio file
   */
  async playLocal(filepath) {
    logger.info(`Playing local file: ${filepath}`);

    // Ensure initialized
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Health check: verify mpv is responsive (catches stale socket after reboot/idle)
    await this._ensureMpvHealthy();

    // SECURITY: Validate path doesn't escape library directory (path traversal protection)
    const resolvedPath = path.resolve(filepath);
    if (!resolvedPath.startsWith(this.libraryPath)) {
      logger.error(`Path traversal attempt blocked: ${filepath}`);
      throw new Error('Invalid file path');
    }

    // Validate file exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    // Acquire playback
    if (this.audioBroker) {
      const acquired = await this.audioBroker.acquirePlayback('jukebox');
      if (!acquired) {
        throw new Error('Failed to acquire playback');
      }
    }

    // Parse filename for metadata
    const filename = path.basename(filepath, '.mp3');
    const parsed = this._parseLibraryFilename(filename);

    // Update current track info
    this.currentTrack = {
      title: parsed.title,
      artist: parsed.artist,
      duration: 0,  // Will be updated by mpv
      youtubeId: null,
      filepath: filepath,
      source: 'library'
    };

    // Load and play
    try {
      this.mpvPlayer.load(filepath);
      logger.info(`Loaded local file: ${filename}`);
    } catch (error) {
      logger.error(`Failed to load local file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resume paused playback
   */
  async play() {
    if (!this.isInitialized || !this.currentTrack) {
      logger.warn('Cannot play: no track loaded');
      return;
    }

    try {
      this.mpvPlayer.resume();
      logger.debug('Playback resumed');
    } catch (error) {
      logger.error(`Failed to resume: ${error.message}`);
    }
  }

  /**
   * Pause playback
   */
  async pause() {
    if (!this.isInitialized) return;

    try {
      this.mpvPlayer.pause();
      logger.debug('Playback paused');
    } catch (error) {
      logger.error(`Failed to pause: ${error.message}`);
    }
  }

  /**
   * Stop playback completely
   */
  async stop() {
    if (!this.isInitialized) return;

    // Set flag to prevent auto-advance
    this.skipAutoAdvance = true;

    try {
      this.mpvPlayer.stop();
      logger.debug('Playback stopped');
    } catch (error) {
      logger.error(`Failed to stop: ${error.message}`);
    }

    this.currentTrack = null;

    // Release playback
    if (this.audioBroker) {
      this.audioBroker.releasePlayback('jukebox');
    }
  }

  /**
   * Seek forward or backward in the current track
   * @param {number} seconds - Positive to seek forward, negative to seek backward
   */
  async seek(seconds) {
    if (!this.isInitialized || !this.isPlaying) {
      logger.debug('Cannot seek: not playing');
      return;
    }

    try {
      await this.mpvPlayer.seek(seconds);
      logger.debug(`Seeked ${seconds > 0 ? '+' : ''}${seconds}s`);
    } catch (error) {
      logger.error(`Failed to seek: ${error.message}`);
    }
  }

  /**
   * Skip to next track in queue
   */
  async next() {
    logger.info('Skipping to next track');

    // Set flag to prevent auto-advance (we're manually advancing)
    this.skipAutoAdvance = true;

    // Stop current track
    if (this.isPlaying) {
      try {
        this.mpvPlayer.stop();
      } catch (error) {
        logger.warn(`Error stopping current track: ${error.message}`);
      }
    }

    // Play on-deck track if available
    if (this.queue.onDeck) {
      const nextTrack = this.queue.onDeck;
      this._promoteQueue();

      try {
        await this.playLocal(nextTrack.filepath);
      } catch (error) {
        logger.error(`Failed to play next track: ${error.message}`);
      }
    } else {
      logger.info('No track on deck, stopping');
      this.currentTrack = null;
      if (this.audioBroker) {
        this.audioBroker.releasePlayback('jukebox');
      }
    }
  }

  /**
   * Set volume (0-100)
   * @param {number} level - Volume level 0-100
   */
  async setVolume(level) {
    if (!this.isInitialized) return;

    const clampedLevel = Math.max(0, Math.min(100, level));

    try {
      this.mpvPlayer.volume(clampedLevel);
      logger.debug(`Volume set to ${clampedLevel}`);
    } catch (error) {
      logger.error(`Failed to set volume: ${error.message}`);
    }
  }

  // ==================== YOUTUBE SEARCH ====================

  /**
   * Search YouTube for tracks
   * @param {string} query - Search query
   * @param {number} offset - Result offset for pagination (not yet implemented)
   * @returns {Promise<Array>} - Search results
   */
  async searchYouTube(query, offset = 0) {
    logger.info(`Searching YouTube: "${query}"`);

    // Request 10 results, filter out non-videos, return up to 7
    const searchQuery = `ytsearch10:${query}`;

    return new Promise((resolve, reject) => {
      // Use spawn with array args to prevent shell injection
      // Include ie_key to filter out channels (YoutubeTab) vs videos (Youtube)
      const child = spawn('yt-dlp', [
        searchQuery,
        '--flat-playlist',
        '--print', '%(title)s\t%(id)s\t%(duration)s\t%(ie_key)s'
      ]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Timeout handler
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Search timed out'));
      }, this.searchTimeout);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          logger.error(`yt-dlp search failed: ${stderr}`);
          reject(new Error(`Search failed with code ${code}`));
          return;
        }

        const results = stdout
          .trim()
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [title, id, duration, ieKey] = line.split('\t');
            const parsed = this._parseYouTubeTitle(title || '');

            return {
              title: title || 'Unknown',
              youtubeId: id,
              duration: parseFloat(duration) || 0,
              parsedArtist: parsed.artist,
              parsedTitle: parsed.title,
              _ieKey: ieKey  // Internal: for filtering
            };
          })
          // Filter out non-video results (channels, playlists, mixes)
          .filter(result => {
            // 1. Must be a video (ie_key=Youtube), not a channel/tab (YoutubeTab)
            if (result._ieKey !== 'Youtube') {
              logger.debug(`Filtered non-video (${result._ieKey}): "${result.title}"`);
              return false;
            }
            // 2. Must have valid duration (catches anything missed above)
            if (!result.duration || result.duration <= 0) {
              logger.debug(`Filtered no-duration: "${result.title}"`);
              return false;
            }
            // 3. Safety net: filter YouTube auto-generated Mixes by title pattern
            const titleLower = result.title.toLowerCase();
            if (titleLower.startsWith('mix - ') || titleLower.startsWith('mix– ')) {
              logger.debug(`Filtered YouTube Mix: "${result.title}"`);
              return false;
            }
            return true;
          })
          // Remove internal field before returning
          .map(({ _ieKey, ...result }) => result)
          // Limit to 7 results (we fetched 10 to have room for filtering)
          .slice(0, 7);

        logger.info(`Found ${results.length} results for "${query}"`);
        resolve(results);
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        logger.error(`yt-dlp spawn error: ${error.message}`);
        reject(new Error(`Search failed: ${error.message}`));
      });
    });
  }

  /**
   * Resolve YouTube ID to stream URL
   * IMPORTANT: These URLs are EPHEMERAL - they expire in minutes. Never cache them!
   * @private
   */
  async _resolveYouTubeUrl(youtubeId) {
    logger.debug(`Resolving URL for: ${youtubeId}`);

    return new Promise((resolve, reject) => {
      const url = `https://www.youtube.com/watch?v=${youtubeId}`;

      // Use spawn with array args to prevent shell injection
      const child = spawn('yt-dlp', [
        '-g',
        '--no-playlist',
        '-f', 'bestaudio',
        url
      ]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 10 second timeout
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('URL resolution timed out'));
      }, 10000);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          logger.error(`yt-dlp URL resolution failed: ${stderr}`);
          reject(new Error(`Failed to resolve URL (code ${code})`));
          return;
        }

        const resolvedUrl = stdout.trim();
        logger.debug(`Resolved URL (${resolvedUrl.substring(0, 50)}...)`);
        resolve(resolvedUrl);
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        logger.error(`yt-dlp spawn error: ${error.message}`);
        reject(new Error(`Failed to resolve URL: ${error.message}`));
      });
    });
  }

  /**
   * Parse YouTube title into artist/title
   * @private
   *
   * Handles both parentheses () and square brackets [] since YouTube titles use both.
   * Example: "Sash! - Encore Une Fois [Remastered] Multi - 1997 HD & HQ @Channel"
   *       -> { artist: "Sash!", title: "Encore Une Fois - Remastered" }
   */
  _parseYouTubeTitle(title) {
    let artist = '';
    let parsedTitle = title;

    // Pre-scrub: handle "(ft. Artist)", "[ft. Artist]", etc.
    // Handles: ft, feat, featuring, with or without . or : after it, any capitalization
    // Removes parens/brackets, keeps content as "ft. Artist"
    parsedTitle = parsedTitle.replace(/[\[(](?:feat(?:uring)?|ft)[.:!]?\s*([^\])]*)[)\]]/gi, 'ft. $1');

    // Pre-scrub: handle "(Instrumental)", "[Instrumental Version]", etc.
    // Move to end of title as " - Instrumental"
    if (/[\[(]instrumental[^\])]*[)\]]/i.test(parsedTitle)) {
      parsedTitle = parsedTitle.replace(/\s*[\[(]instrumental[^\])]*[)\]]\s*/gi, ' ').trim() + ' - Instrumental';
    }

    // Pre-scrub: preserve (Live), [Acoustic], (Remix), [Remastered] by moving to end
    // These are meaningful metadata that users might want to keep
    // Handles both () and [] - YouTube uses square brackets frequently
    // IMPORTANT: Truncate everything AFTER the match - it's usually junk like "HD & HQ @Channel"
    const preservePatterns = [
      // Match keyword ANYWHERE inside parens/brackets: (Live at...), [Best live...], etc.
      // \b word boundary prevents false matches like (Oliver's Version) matching "live"
      { regex: /[\[(][^\])]*\blive\b[^\])]*[)\]]/i, suffix: ' - Live' },
      { regex: /[\[(][^\])]*\bacoustic\b[^\])]*[)\]]/i, suffix: ' - Acoustic' },
      { regex: /[\[(][^\])]*\bremix\b[^\])]*[)\]]/i, suffix: ' - Remix' },
      { regex: /[\[(][^\])]*\bremaster(ed)?\b[^\])]*[)\]]/i, suffix: ' - Remastered' }
    ];

    for (const pattern of preservePatterns) {
      const match = parsedTitle.match(pattern.regex);
      if (match) {
        // Truncate at the match position (everything after is junk)
        const matchIndex = parsedTitle.indexOf(match[0]);
        parsedTitle = parsedTitle.substring(0, matchIndex).trim() + pattern.suffix;
        break;  // Only apply first match
      }
    }

    // Split on first " - "
    const dashIndex = parsedTitle.indexOf(' - ');
    if (dashIndex !== -1) {
      artist = parsedTitle.substring(0, dashIndex).trim();
      parsedTitle = parsedTitle.substring(dashIndex + 3).trim();
    }

    // Truncate at first "(" or "[" (remove video metadata like "(Official Video)" or "[HD]")
    const parenIndex = parsedTitle.search(/[\[(]/);
    if (parenIndex !== -1) {
      parsedTitle = parsedTitle.substring(0, parenIndex).trim();
    }

    return { artist, title: parsedTitle };
  }

  // ==================== LIBRARY MANAGEMENT ====================

  /**
   * List all tracks in the library
   * @returns {Promise<Array>} - Library tracks sorted by modification time
   */
  async listLibrary() {
    logger.debug('Listing library...');

    try {
      const files = fs.readdirSync(this.libraryPath)
        .filter(file => file.endsWith('.mp3'));

      const tracks = files.map(filename => {
        const filepath = path.join(this.libraryPath, filename);
        const stats = fs.statSync(filepath);
        const parsed = this._parseLibraryFilename(filename.replace('.mp3', ''));

        return {
          filename,
          artist: parsed.artist,
          title: parsed.title,
          filepath,
          savedAt: stats.mtime.toISOString(),
          sizeMB: Math.round(stats.size / 1024 / 1024 * 10) / 10
        };
      });

      // Sort by most recently modified
      tracks.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

      logger.debug(`Found ${tracks.length} tracks in library`);
      return tracks;

    } catch (error) {
      logger.error(`Failed to list library: ${error.message}`);
      return [];
    }
  }

  /**
   * Save a YouTube track to the library
   * @param {string} youtubeId - YouTube video ID
   * @param {string} artist - Artist name
   * @param {string} title - Track title
   * @returns {Promise<object>} - { status, filename }
   */
  async saveTrack(youtubeId, artist, title) {
    logger.info(`Saving track: ${artist} - ${title}`);

    // Sanitize filename
    const sanitizedArtist = this._sanitizeFilename(artist);
    const sanitizedTitle = this._sanitizeFilename(title);
    const filename = `${sanitizedArtist} - ${sanitizedTitle}.mp3`;
    const filepath = path.join(this.libraryPath, filename);

    // Check if file already exists
    if (fs.existsSync(filepath)) {
      throw new Error('Track already exists in library');
    }

    // Start background download
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;
    const outputTemplate = path.join(this.libraryPath, `${sanitizedArtist} - ${sanitizedTitle}.%(ext)s`);

    // Spawn background process (detached so it survives if parent dies)
    const child = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputTemplate,
      url
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']  // Need pipes for exit event to fire
    });

    // Listen for process completion - more reliable than filesystem polling
    // This fires even for detached processes as long as parent hasn't exited
    child.on('exit', (code) => {
      if (code === 0 && fs.existsSync(filepath)) {
        logger.info(`Save complete: ${filename}`);
        this._broadcastSaveComplete(filename);
      } else {
        const errorMsg = code === 0 ? 'File not found after download' : `yt-dlp exited with code ${code}`;
        logger.error(`Save failed: ${filename} - ${errorMsg}`);
        this._broadcastSaveFailed(filename, errorMsg);
      }
    });

    child.on('error', (error) => {
      logger.error(`Save process error: ${filename} - ${error.message}`);
      this._broadcastSaveFailed(filename, error.message);
    });

    // Unref so the parent can exit without waiting for download
    child.unref();

    // Download YouTube thumbnail (fire-and-forget, don't block save)
    const artworkDir = path.join(this.libraryPath, 'artwork');
    const artworkPath = path.join(artworkDir, `${sanitizedArtist} - ${sanitizedTitle}.jpg`);
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

    // Ensure artwork directory exists
    if (!fs.existsSync(artworkDir)) {
      fs.mkdirSync(artworkDir, { recursive: true });
    }

    https.get(thumbnailUrl, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(artworkPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          logger.debug(`Artwork saved: ${sanitizedArtist} - ${sanitizedTitle}.jpg`);
        });
      } else {
        logger.debug(`Artwork download failed: HTTP ${response.statusCode}`);
      }
    }).on('error', (err) => {
      logger.debug(`Artwork download failed (non-fatal): ${err.message}`);
    });

    logger.info(`Download started for: ${filename}`);
    return { status: 'saving', filename };
  }

  /**
   * Delete a track from the library
   * @param {string} filename - Filename to delete
   */
  async deleteTrack(filename) {
    logger.info(`Deleting track: ${filename}`);

    const filepath = path.join(this.libraryPath, filename);

    // SECURITY: Validate path doesn't escape library directory (path traversal protection)
    const resolvedPath = path.resolve(filepath);
    if (!resolvedPath.startsWith(this.libraryPath)) {
      logger.error(`Path traversal attempt blocked: ${filename}`);
      throw new Error('Invalid filename');
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error('Track not found');
    }

    // If this track is currently playing, stop it
    if (this.currentTrack && this.currentTrack.filepath === resolvedPath) {
      await this.stop();
    }

    // Delete the mp3 file
    fs.unlinkSync(resolvedPath);
    logger.info(`Deleted: ${filename}`);

    // Delete associated artwork if it exists
    const artworkFilename = filename.replace('.mp3', '.jpg');
    const artworkPath = path.join(this.libraryPath, 'artwork', artworkFilename);
    if (fs.existsSync(artworkPath)) {
      fs.unlinkSync(artworkPath);
      logger.info(`Deleted artwork: ${artworkFilename}`);
    }
  }

  /**
   * Parse library filename into artist/title
   * @private
   */
  _parseLibraryFilename(filename) {
    const dashIndex = filename.indexOf(' - ');
    if (dashIndex !== -1) {
      return {
        artist: filename.substring(0, dashIndex).trim(),
        title: filename.substring(dashIndex + 3).trim()
      };
    }
    return { artist: 'Unknown', title: filename };
  }

  /**
   * Sanitize string for use in filename
   * @private
   */
  _sanitizeFilename(str) {
    return str
      .replace(/[/\\:*?"<>|]/g, '')  // Remove invalid chars
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .trim();
  }

  // ==================== QUEUE MANAGEMENT ====================

  /**
   * Get current queue state
   */
  getQueue() {
    return {
      onDeck: this.queue.onDeck,
      inTheHole: this.queue.inTheHole
    };
  }

  /**
   * Add a track to the queue
   * @param {string} filepath - Path to the track
   */
  addToQueue(filepath) {
    // Path traversal protection - ensure file is within library
    const resolvedPath = path.resolve(filepath);
    if (!resolvedPath.startsWith(this.libraryPath)) {
      throw new Error('Invalid file path');
    }

    const filename = path.basename(filepath);
    const parsed = this._parseLibraryFilename(filename.replace('.mp3', ''));

    const track = {
      filename,
      artist: parsed.artist,
      title: parsed.title,
      filepath: resolvedPath  // Use resolved path for consistency
    };

    // Add to first empty slot
    if (!this.queue.onDeck) {
      this.queue.onDeck = track;
      logger.info(`Added to On Deck: ${filename}`);
    } else if (!this.queue.inTheHole) {
      this.queue.inTheHole = track;
      logger.info(`Added to In the Hole: ${filename}`);
    } else {
      throw new Error('Queue is full (max 2 tracks)');
    }

    this._broadcastQueueUpdate();
  }

  /**
   * Remove a track from the queue
   * @param {string} slot - 'onDeck' or 'inTheHole'
   */
  removeFromQueue(slot) {
    if (slot === 'onDeck') {
      this.queue.onDeck = this.queue.inTheHole;
      this.queue.inTheHole = null;
    } else if (slot === 'inTheHole') {
      this.queue.inTheHole = null;
    }

    logger.info(`Removed from ${slot}`);
    this._broadcastQueueUpdate();
  }

  /**
   * Promote queue (on-deck becomes playing, in-the-hole becomes on-deck)
   * @private
   */
  _promoteQueue() {
    this.queue.onDeck = this.queue.inTheHole;
    this.queue.inTheHole = null;
    logger.debug('Queue promoted');
    this._broadcastQueueUpdate();
  }

  /**
   * Auto-advance to next track in queue (called on natural EOF)
   * @private
   */
  _autoAdvanceQueue() {
    if (this.queue.onDeck) {
      const nextTrack = this.queue.onDeck;
      this._promoteQueue();

      logger.info(`Auto-advancing to: ${nextTrack.filename}`);

      // Play next track (async, don't await)
      this.playLocal(nextTrack.filepath).catch(error => {
        logger.error(`Auto-advance failed: ${error.message}`);
      });
    } else {
      logger.debug('No track on deck, playback complete');
      this.currentTrack = null;

      if (this.audioBroker) {
        this.audioBroker.releasePlayback('jukebox');
      }
    }
  }

  // ==================== STATUS & BROADCASTING ====================

  /**
   * Get current playback status
   */
  getStatus() {
    return {
      isPlaying: this.isPlaying,
      currentTrack: this.currentTrack,
      position: this.position,
      duration: this.currentTrack?.duration || this.duration,
      queue: this.getQueue()
    };
  }

  /**
   * Subscribe a WebSocket client to progress updates
   * @param {WebSocket} ws - The WebSocket connection
   */
  subscribeProgress(ws) {
    this.progressSubscribers.add(ws);
    logger.info(`Progress subscriber added (total: ${this.progressSubscribers.size})`);
  }

  /**
   * Unsubscribe a WebSocket client from progress updates
   * @param {WebSocket} ws - The WebSocket connection
   */
  unsubscribeProgress(ws) {
    this.progressSubscribers.delete(ws);
    logger.debug(`Progress subscriber removed (total: ${this.progressSubscribers.size})`);
  }

  /**
   * Broadcast current status via WebSocket
   * @private
   */
  _broadcastStatus() {
    if (!this.websocketService) return;

    const message = {
      type: 'song',
      data: {
        source: 'jukebox',
        title: this.currentTrack?.title || '',
        artist: this.currentTrack?.artist || '',
        // Prefer metadata duration (from search results), fall back to mpv-reported
        duration: this.currentTrack?.duration || this.duration,
        position: this.position,
        isPlaying: this.isPlaying,
        youtubeId: this.currentTrack?.youtubeId || null,
        filepath: this.currentTrack?.filepath || null
      }
    };

    this.websocketService.broadcast(message);
  }

  /**
   * Broadcast playback progress directly to subscribed WebSocket clients
   * Uses direct send to subscribers (not broadcast) to avoid chatter to non-interested clients
   * @private
   */
  _broadcastProgress() {
    const WebSocket = require('ws');

    const message = JSON.stringify({
      type: 'playback-progress',
      data: {
        source: 'jukebox',
        position: this.position,
        duration: this.currentTrack?.duration || this.duration
      }
    });

    // Send directly to each subscriber, cleaning up dead connections
    const deadSockets = [];
    for (const ws of this.progressSubscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          logger.debug(`Error sending progress to subscriber: ${error.message}`);
          deadSockets.push(ws);
        }
      } else {
        deadSockets.push(ws);
      }
    }

    // Clean up dead sockets
    for (const ws of deadSockets) {
      this.progressSubscribers.delete(ws);
    }
  }

  /**
   * Broadcast queue update
   * @private
   */
  _broadcastQueueUpdate() {
    if (!this.websocketService) return;

    const message = {
      source: 'jukebox',
      type: 'queue-updated',
      data: this.getQueue()
    };

    this.websocketService.broadcast(message);
  }

  /**
   * Broadcast save complete
   * @private
   */
  _broadcastSaveComplete(filename) {
    if (!this.websocketService) return;

    const message = {
      source: 'jukebox',
      type: 'save-complete',
      data: { filename }
    };

    this.websocketService.broadcast(message);
  }

  /**
   * Broadcast save failed
   * @private
   */
  _broadcastSaveFailed(filename, error) {
    if (!this.websocketService) return;

    const message = {
      source: 'jukebox',
      type: 'save-failed',
      data: { filename, error }
    };

    this.websocketService.broadcast(message);
  }

  /**
   * Get singleton instance
   */
  static getInstance(audioBroker, websocketService) {
    if (!instance) {
      instance = new JukeboxService(audioBroker, websocketService);
    }
    return instance;
  }

  /**
   * Get existing instance without creating a new one
   * Used by WebSocket handlers that need to interact with jukebox if it's running
   * @returns {JukeboxService|null} The existing instance or null
   */
  static getExistingInstance() {
    return instance || null;
  }
}

module.exports = JukeboxService;
