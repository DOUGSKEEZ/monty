/**
 * AudioBroker.js - Kill-and-play coordinator for audio sources
 *
 * Ensures only one audio source plays at a time:
 * - Pianobar (Pandora streaming)
 * - Jukebox (YouTube/local library via mpv)
 *
 * Before ANY playback starts, the broker kills the currently active source.
 * This also fixes the existing bug where duplicate pianobar instances could spawn.
 */

const logger = require('../utils/logger').getModuleLogger('audio-broker');

// Singleton instance
let instance = null;

class AudioBroker {
  constructor() {
    // Enforce singleton
    if (instance) {
      logger.warn('AudioBroker instance already exists, returning existing instance');
      return instance;
    }

    // Track which source is currently active
    // Valid values: 'pianobar', 'jukebox', 'none'
    this.activeSource = 'none';

    // Service references (injected later to avoid circular dependencies)
    this._pianobarService = null;
    this._jukeboxService = null;

    // Lock to prevent race conditions during source switching
    this._switchLock = false;

    logger.info('AudioBroker initialized');

    instance = this;
  }

  /**
   * Set reference to PianobarService (called during service initialization)
   * @param {PianobarService} service
   */
  setPianobarService(service) {
    this._pianobarService = service;
    logger.debug('PianobarService reference set');
  }

  /**
   * Set reference to JukeboxService (called during service initialization)
   * @param {JukeboxService} service
   */
  setJukeboxService(service) {
    this._jukeboxService = service;
    logger.debug('JukeboxService reference set');
  }

  /**
   * Acquire playback for a source. Kills any other active source first.
   *
   * @param {string} source - 'pianobar' or 'jukebox'
   * @returns {Promise<boolean>} - true when playback is acquired
   */
  async acquirePlayback(source) {
    if (source !== 'pianobar' && source !== 'jukebox') {
      throw new Error(`Invalid source: ${source}. Must be 'pianobar' or 'jukebox'`);
    }

    // Prevent race conditions
    if (this._switchLock) {
      logger.warn(`Source switch already in progress, waiting...`);
      // Wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this._switchLock) {
        logger.error('Source switch lock timeout');
        return false;
      }
    }

    this._switchLock = true;

    try {
      logger.info(`Acquiring playback for: ${source} (current: ${this.activeSource})`);

      // If same source is already active, just return (handles duplicate prevention)
      if (this.activeSource === source) {
        logger.debug(`${source} is already active, no switch needed`);
        return true;
      }

      // Kill the other source if active
      if (this.activeSource !== 'none') {
        await this._killSource(this.activeSource);
      }

      // Also do a defensive kill of the same source to prevent duplicates
      // (e.g., killing any zombie pianobar before starting a new one)
      await this._killSource(source);

      // Mark new source as active
      this.activeSource = source;
      logger.info(`Playback acquired for: ${source}`);

      return true;

    } catch (error) {
      logger.error(`Error acquiring playback for ${source}: ${error.message}`);
      return false;

    } finally {
      this._switchLock = false;
    }
  }

  /**
   * Release playback for a source (mark as stopped)
   *
   * @param {string} source - 'pianobar' or 'jukebox'
   */
  releasePlayback(source) {
    if (this.activeSource === source) {
      logger.info(`Releasing playback for: ${source}`);
      this.activeSource = 'none';
    }
  }

  /**
   * Get the currently active source
   *
   * @returns {string} - 'pianobar', 'jukebox', or 'none'
   */
  getActiveSource() {
    return this.activeSource;
  }

  /**
   * Check if a specific source is active
   *
   * @param {string} source - 'pianobar' or 'jukebox'
   * @returns {boolean}
   */
  isSourceActive(source) {
    return this.activeSource === source;
  }

  /**
   * Kill a specific audio source
   * @private
   */
  async _killSource(source) {
    logger.info(`Killing source: ${source}`);

    try {
      if (source === 'pianobar') {
        await this._killPianobar();
      } else if (source === 'jukebox') {
        await this._killJukebox();
      }
    } catch (error) {
      logger.error(`Error killing ${source}: ${error.message}`);
      // Don't throw - we want to continue even if kill fails
    }
  }

  /**
   * Kill pianobar process
   * @private
   */
  async _killPianobar() {
    // Use service method if available
    if (this._pianobarService) {
      try {
        await this._pianobarService.stopPianobar(true); // silent mode
        logger.debug('Pianobar stopped via service');
        return;
      } catch (error) {
        logger.warn(`Service stop failed, falling back to pkill: ${error.message}`);
      }
    }

    // Fallback: direct pkill
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    try {
      await execPromise('pkill -f pianobar || true');
      logger.debug('Pianobar killed via pkill');
    } catch (error) {
      // pkill returns non-zero if no process found, which is fine
      logger.debug('pkill pianobar completed (may not have been running)');
    }
  }

  /**
   * Kill jukebox/mpv process
   * @private
   */
  async _killJukebox() {
    // Use service method if available
    if (this._jukeboxService) {
      try {
        await this._jukeboxService.stop();
        logger.debug('Jukebox stopped via service');
        return;
      } catch (error) {
        logger.warn(`Service stop failed, falling back to socket quit: ${error.message}`);
      }
    }

    // Fallback: try to quit mpv via socket, then pkill
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    try {
      // Try socket command first (cleaner shutdown)
      await execPromise('echo \'{ "command": ["quit"] }\' | socat - /tmp/monty-jukebox.sock 2>/dev/null || true');
      logger.debug('Jukebox quit via socket');
    } catch (error) {
      logger.debug('Socket quit failed, using pkill');
    }

    try {
      // Also pkill to ensure cleanup
      await execPromise('pkill -f "mpv.*monty-jukebox" || true');
      logger.debug('mpv killed via pkill');
    } catch (error) {
      logger.debug('pkill mpv completed (may not have been running)');
    }
  }

  /**
   * Force kill all audio sources (emergency cleanup)
   */
  async killAll() {
    logger.warn('Killing all audio sources');

    await this._killPianobar();
    await this._killJukebox();

    this.activeSource = 'none';
    logger.info('All audio sources killed');
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!instance) {
      instance = new AudioBroker();
    }
    return instance;
  }
}

module.exports = AudioBroker;
