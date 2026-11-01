/**
 * BluetoothLinkRecovery - Unsticks the speaker link (reversed or silent)
 *
 * After a speaker power-cycle (Oct 31 2026) BlueZ was left holding an AVDTP
 * request the speaker never answered: the Monty -> speaker direction stayed
 * "busy" and the speaker came up reversed (speaker -> Monty, no sound) until
 * bluetoothd was restarted.
 *
 * Two-rung ladder, lightest first:
 *   1. Swap direction: drop the A2DP Source profile, connect A2DP Sink (~10s).
 *      If BlueZ answers "busy" (stuck) or no speaker output appears -> rung 2.
 *   2. Restart bluetoothd (polkit rule 50-monty-bluetooth-restart.rules; the
 *      Govee reader follows via PartOf=) and reconnect through connect().
 *
 * Rails: one recovery at a time. Automatic triggers wait 10 min after a rung 2
 * and give up after 3 failed recoveries in a row (reset by any successful
 * connect). A user pressing Connect is never held back.
 *
 * Owned by BluetoothService. The journal is the durable history.
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('bluetooth-link-recovery');
const prometheusMetrics = require('./PrometheusMetricsService');

const A2DP_SINK_UUID = '0000110b-0000-1000-8000-00805f9b34fb';   // Monty -> speaker (playback)
const A2DP_SOURCE_UUID = '0000110a-0000-1000-8000-00805f9b34fb'; // speaker -> Monty (reversed)
const AUTO_SPACING_MS = 10 * 60 * 1000;
const MAX_FAILED_AUTO = 3;
const SINK_WAIT_MS = 20 * 1000;
const BLUEZ_READY_WAIT_MS = 20 * 1000;
const EXEC_OPTS = { timeout: 5000 };

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class BluetoothLinkRecovery {
  /**
   * @param {Object} deps
   * @param {string} deps.deviceMac - Speaker MAC
   * @param {string} deps.adapterMac - Dongle MAC (the speaker is paired on both radios)
   * @param {Function} deps.connect - Reconnect via bt-connect.sh; resolves { success }
   * @param {Function} deps.hasSink - Resolves true when the speaker's bluez sink exists
   * @param {Function} deps.recordEvent - Records an event for the link-health toast
   */
  constructor({ deviceMac, adapterMac, connect, hasSink, recordEvent }) {
    this.deviceMac = deviceMac;
    this.adapterMac = adapterMac;
    this.connect = connect;
    this.hasSink = hasSink;
    this.recordEvent = recordEvent;

    this.running = false;
    this.failedInARow = 0;
    this.autoHoldUntil = 0;
    this.lastRung1FixAt = 0;
  }

  get inProgress() {
    return this.running;
  }

  /** Any successful connect re-arms automatic recovery. */
  noteConnected() {
    this.failedInARow = 0;
  }

  /**
   * @param {'reversed'|'silent'|'connect-failed'} reason
   * @param {'auto'|'user'} trigger
   */
  async recover(reason, trigger) {
    if (this.running) return;
    if (trigger === 'auto' && (this.failedInARow >= MAX_FAILED_AUTO || Date.now() < this.autoHoldUntil)) return;

    this.running = true;
    logger.warn(`Bluetooth link stuck (${reason}, ${trigger}) - recovering`);
    try {
      // A reversal that comes back soon after a rung-1 fix goes straight to rung 2
      const repeatReversal = reason === 'reversed' && Date.now() - this.lastRung1FixAt < AUTO_SPACING_MS;
      if (!repeatReversal && await this._swapToPlayback()) {
        this.lastRung1FixAt = Date.now();
        this._finish(true, reason, trigger, 1);
        return;
      }
      if (trigger === 'auto') this.autoHoldUntil = Date.now() + AUTO_SPACING_MS;
      this._finish(await this._restartAndReconnect(), reason, trigger, 2);
    } catch (error) {
      logger.warn(`Bluetooth recovery error: ${error.message}`);
      this._finish(false, reason, trigger, null);
    } finally {
      this.running = false;
    }
  }

  /**
   * Rung 1: close any speaker -> Monty stream, open Monty -> speaker.
   * @private
   */
  async _swapToPlayback() {
    const path = await this._speakerPath();
    if (!path) return false;
    await this._callProfile(path, 'DisconnectProfile', A2DP_SOURCE_UUID).catch(() => {}); // fine if not connected
    try {
      await this._callProfile(path, 'ConnectProfile', A2DP_SINK_UUID);
    } catch (error) {
      logger.info(`Rung 1 failed${/busy/i.test(error.message) ? ' - BlueZ is stuck (busy)' : ''}: ${error.message.trim()}`);
      return false;
    }
    return this._waitFor(this.hasSink, SINK_WAIT_MS);
  }

  /**
   * Rung 2: restart bluetoothd, wait for it to reload the speaker, reconnect.
   * @private
   */
  async _restartAndReconnect() {
    logger.warn('Restarting bluetoothd to clear a stuck link');
    await execPromise('systemctl --no-ask-password restart bluetooth.service', { timeout: 30000 });
    if (!await this._waitFor(() => this._speakerPath(), BLUEZ_READY_WAIT_MS)) return false;
    await sleep(3000); // let PulseAudio re-register its Bluetooth endpoints
    const result = await this.connect();
    return Boolean(result && result.success) && await this.hasSink();
  }

  /**
   * The speaker's D-Bus object on the dongle, or null until bluetoothd has it loaded.
   * hci numbers shuffle across reboots, so resolve the dongle by MAC.
   * @private
   */
  async _speakerPath() {
    try {
      const { stdout } = await execPromise('hciconfig', EXEC_OPTS);
      const hci = stdout.split(/\n(?=hci\d+:)/)
        .find(block => block.includes(`BD Address: ${this.adapterMac}`))
        ?.match(/^(hci\d+):/)?.[1];
      if (!hci) return null;
      const path = `/org/bluez/${hci}/dev_${this.deviceMac.replace(/:/g, '_')}`;
      await execPromise(`busctl --system get-property org.bluez ${path} org.bluez.Device1 Paired`, EXEC_OPTS);
      return path;
    } catch (error) {
      return null;
    }
  }

  /** @private */
  async _callProfile(path, method, uuid) {
    await execPromise(`busctl --system --timeout=20 call org.bluez ${path} org.bluez.Device1 ${method} s ${uuid}`,
      { timeout: 25000 });
  }

  /** @private */
  async _waitFor(check, ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const result = await check();
      if (result) return result;
      await sleep(2000);
    }
    return null;
  }

  /** @private */
  _finish(success, reason, trigger, rung) {
    this.failedInARow = success ? 0 : this.failedInARow + 1;
    this.recordEvent({ type: success ? 'recovered' : 'recovery-failed', reason, trigger, rung });
    prometheusMetrics.recordOperation('bluetooth-link-recovery', success);

    if (success) {
      logger.warn(`Bluetooth link recovered (${reason}, ${trigger}) at rung ${rung}`);
    } else {
      logger.warn(`Bluetooth link recovery FAILED (${reason}, ${trigger}, rung ${rung})` +
        (trigger === 'auto' && this.failedInARow >= MAX_FAILED_AUTO
          ? ` - ${MAX_FAILED_AUTO} failures in a row, automatic recovery paused until the next successful connect`
          : ''));
    }
  }
}

module.exports = BluetoothLinkRecovery;
