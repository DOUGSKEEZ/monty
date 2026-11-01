/**
 * BluetoothLinkState - Live Bluetooth state for the UI, pushed over the Pianobar WebSocket
 *
 *   'connecting'   - a connect or a stuck-link recovery is running, no sink yet (yellow)
 *   'finishing'    - the speaker's sink exists (music can play) but that connect/recovery
 *                    is still wrapping up - shown blue but not yet clickable (~8s tail)
 *   'connected'    - sink exists and nothing is running (pulsing blue, clickable)
 *   'disconnected' - no speaker sink (grey)
 *
 * PulseAudio's event stream (`pactl subscribe`) announces sinks/cards appearing
 * and disappearing, so changes go out within a second. A 30s sweep backstops a
 * missed event or a dead watcher (the watcher is also restarted if it exits).
 * New WebSocket clients get the current state on connect, so page loads and
 * navigation never wait for a poll.
 *
 * Owned by BluetoothService.
 */

const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('bluetooth-link-state');

const SWEEP_MS = 30 * 1000;
const WATCHER_RESTART_MS = 5 * 1000;
const DEBOUNCE_MS = 300;
const EXEC_OPTS = { timeout: 5000 };

class BluetoothLinkState {
  /**
   * @param {string} deviceMac - Speaker MAC
   * @param {Object} [hooks]
   * @param {Function} [hooks.isConnecting] - True while a connect or recovery is running
   */
  constructor(deviceMac, { isConnecting = () => false } = {}) {
    this.sinkName = `bluez_sink.${deviceMac.replace(/:/g, '_')}`;
    this.isConnecting = isConnecting;
    this.current = { state: 'disconnected', since: new Date().toISOString() };

    this.stopped = true;
    this.watcher = null;
    this.sweep = null;
    this.debounce = null;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this._watch();
    this.sweep = setInterval(() => this.refresh(), SWEEP_MS);
    this.refresh();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.sweep);
    clearTimeout(this.debounce);
    if (this.watcher) this.watcher.kill();
    this.watcher = null;
  }

  /** Current { state, since } */
  get() {
    return { ...this.current };
  }

  /** Recompute soon (debounced: a connect fires a burst of PulseAudio events). */
  refresh() {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => { this._update().catch(() => {}); }, DEBOUNCE_MS);
  }

  /** @private */
  async _update() {
    let sinkExists;
    try {
      const { stdout } = await execPromise('pactl list short sinks', EXEC_OPTS);
      sinkExists = stdout.includes(this.sinkName);
    } catch (error) {
      return; // PulseAudio unreachable - keep the last known state
    }

    const busy = this.isConnecting();
    const state = sinkExists ? (busy ? 'finishing' : 'connected') : (busy ? 'connecting' : 'disconnected');
    if (state === this.current.state) return;

    this.current = { state, since: new Date().toISOString() };
    logger.info(`Bluetooth link state: ${state}`);
    this._broadcast();
  }

  /** @private */
  _broadcast() {
    try {
      const { getWebSocketServiceInstance } = require('./PianobarWebsocketIntegration');
      const wsService = getWebSocketServiceInstance();
      if (wsService) wsService.broadcast({ type: 'bluetooth', data: this.get() });
    } catch (error) {
      logger.debug(`Could not broadcast Bluetooth state: ${error.message}`);
    }
  }

  /**
   * Watch PulseAudio for sinks/cards coming and going; restart the watcher if it exits.
   * @private
   */
  _watch() {
    const startedAt = Date.now();
    this.watcher = spawn('pactl', ['subscribe'], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.watcher.stdout.on('data', (chunk) => {
      if (/Event '(new|remove)' on (sink|card) #/.test(chunk.toString())) this.refresh();
    });
    this.watcher.on('error', (error) => logger.debug(`pactl subscribe error: ${error.message}`));
    this.watcher.on('exit', () => {
      this.watcher = null;
      if (this.stopped) return;
      // Info only when a healthy watcher dies; if PulseAudio is down it exits at once every retry - keep that quiet
      const msg = `PulseAudio event watcher exited - restarting in ${WATCHER_RESTART_MS / 1000}s`;
      if (Date.now() - startedAt > 60 * 1000) logger.info(msg); else logger.debug(msg);
      setTimeout(() => { if (!this.stopped && !this.watcher) this._watch(); }, WATCHER_RESTART_MS);
    });
  }
}

module.exports = BluetoothLinkState;
