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
        socket: '/tmp/monty-jukebox.sock'
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

    // Time position updates (every second)
    this.mpvPlayer.on('timeposition', (seconds) => {
      this.position = seconds;

      // Only broadcast if there are subscribers (opt-in to reduce chatter)
      if (this.progressSubscribers.size > 0) {
        this._broadcastProgress();
      }
    });

    // Status changes
    this.mpvPlayer.on('statuschange', (status) => {
      if (status.duration) {
        this.duration = status.duration;
      }
    });

    logger.debug('mpv event handlers configured');
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

    const searchQuery = `ytsearch5:${query}`;

    return new Promise((resolve, reject) => {
      // Use spawn with array args to prevent shell injection
      const child = spawn('yt-dlp', [
        searchQuery,
        '--flat-playlist',
        '--print', '%(title)s\t%(id)s\t%(duration)s'
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
            const [title, id, duration] = line.split('\t');
            const parsed = this._parseYouTubeTitle(title || '');

            return {
              title: title || 'Unknown',
              youtubeId: id,
              duration: parseFloat(duration) || 0,
              parsedArtist: parsed.artist,
              parsedTitle: parsed.title
            };
          });

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
   */
  _parseYouTubeTitle(title) {
    let artist = '';
    let parsedTitle = title;

    // Pre-scrub: handle "(ft. Artist)", "(feat. Artist)", "(featuring Artist)" etc.
    // Handles: ft, feat, featuring, with or without . or : after it, any capitalization
    // Removes both parens, keeps content as "ft. Artist"
    parsedTitle = parsedTitle.replace(/\((?:feat(?:uring)?|ft)[.:!]?\s*([^)]*)\)/gi, 'ft. $1');

    // Pre-scrub: handle "(Instrumental)", "(Instrumental Version)", etc.
    // Move to end of title as " - Instrumental"
    if (/\(instrumental[^)]*\)/i.test(parsedTitle)) {
      parsedTitle = parsedTitle.replace(/\s*\(instrumental[^)]*\)\s*/gi, ' ').trim() + ' - Instrumental';
    }

    // Pre-scrub: preserve (Live), (Acoustic), (Remix) by moving to end
    // These are meaningful metadata that users might want to keep
    // NOTE: Avoid .test() + .replace() on same regex with 'g' flag - lastIndex gotcha
    const preservePatterns = [
      { regex: /\s*\(live[^)]*\)\s*/gi, suffix: ' - Live' },
      { regex: /\s*\(acoustic[^)]*\)\s*/gi, suffix: ' - Acoustic' },
      { regex: /\s*\(remix[^)]*\)\s*/gi, suffix: ' - Remix' }
    ];

    for (const pattern of preservePatterns) {
      const cleaned = parsedTitle.replace(pattern.regex, ' ').trim();
      if (cleaned !== parsedTitle) {
        parsedTitle = cleaned + pattern.suffix;
        break;  // Only apply first match
      }
    }

    // Split on first " - "
    const dashIndex = parsedTitle.indexOf(' - ');
    if (dashIndex !== -1) {
      artist = parsedTitle.substring(0, dashIndex).trim();
      parsedTitle = parsedTitle.substring(dashIndex + 3).trim();
    }

    // Truncate at first "(" (remove video metadata like "(Official Video)")
    const parenIndex = parsedTitle.indexOf('(');
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

    // Delete the file
    fs.unlinkSync(resolvedPath);
    logger.info(`Deleted: ${filename}`);
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
      duration: this.duration,
      queue: this.getQueue()
    };
  }

  /**
   * Subscribe a client to progress updates
   * @param {string} clientId
   */
  subscribeProgress(clientId) {
    this.progressSubscribers.add(clientId);
    logger.debug(`Progress subscriber added: ${clientId} (total: ${this.progressSubscribers.size})`);
  }

  /**
   * Unsubscribe a client from progress updates
   * @param {string} clientId
   */
  unsubscribeProgress(clientId) {
    this.progressSubscribers.delete(clientId);
    logger.debug(`Progress subscriber removed: ${clientId} (total: ${this.progressSubscribers.size})`);
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
        duration: this.duration,
        position: this.position,
        isPlaying: this.isPlaying,
        youtubeId: this.currentTrack?.youtubeId || null,
        filepath: this.currentTrack?.filepath || null
      }
    };

    this.websocketService.broadcast(message);
  }

  /**
   * Broadcast playback progress
   * @private
   */
  _broadcastProgress() {
    if (!this.websocketService) return;

    const message = {
      type: 'playback-progress',
      data: {
        position: this.position,
        duration: this.duration
      }
    };

    this.websocketService.broadcast(message);
  }

  /**
   * Broadcast queue update
   * @private
   */
  _broadcastQueueUpdate() {
    if (!this.websocketService) return;

    const message = {
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
}

module.exports = JukeboxService;
