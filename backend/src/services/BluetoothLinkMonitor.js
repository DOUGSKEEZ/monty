/**
 * BluetoothLinkMonitor - Self-heals a Bluetooth link that can't keep up with aptX
 *
 * aptX / aptX HD are fixed-bitrate codecs (aptX HD at 44.1 kHz needs ~529 kbps)
 * with no way to throttle, so once the radio link falls behind the stream never
 * catches up and playback chops. SBC adapts its bitpool to the link instead.
 *
 * Every 30s, while the Bluetooth sink is RUNNING on aptX, this samples what the
 * adapter actually sends (hciconfig TX bytes, once per second) against what the
 * codec needs. If 2 of the last 3 windows had a second below 95% of that, it
 * switches the speaker to SBC and records an event (shown as a toast).
 *
 * Deliberately one-way: it never promotes back to aptX HD (each switch garbles
 * audio for 5-10s). A fresh connection brings aptX HD back on its own.
 *
 * When there is no speaker sink at all, it also detects a stuck link and hands
 * it to onStuck (BluetoothLinkRecovery):
 *   - 'reversed': a speaker -> Monty source exists. Never wanted, and in 80 days
 *     of logs it only appeared during the Oct 31 bug, so act on first sighting.
 *   - 'silent': link up with no sink and no source on 2 checks in a row (one
 *     check could land in the normal gap between link-up and sink-up).
 *
 * Owned by BluetoothService - not registered separately, since its lifecycle is
 * the connection's. The journal (logger.warn) is the durable history.
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('bluetooth-link-monitor');
const prometheusMetrics = require('./PrometheusMetricsService');

// Bits per input sample for the fixed-rate codecs we watch (both compress 4:1)
const MONITORED_CODECS = { aptx_hd: 24, aptx: 16 };

// Thresholds from Oct 31 2026 measurements on aptX HD (needs 529 kbps):
// healthy link never dipped below 541 kbps; degraded dipped to 454-497; stuck sat at ~300
const HEALTHY_RATIO = 0.95;
const SAMPLE_SECONDS = 6;
const WINDOW_HISTORY = 3;
const BAD_WINDOWS_TO_ACT = 2;
const CHECK_INTERVAL_MS = 30 * 1000;
const SILENT_CHECKS_TO_ACT = 2;
const MAX_EVENTS = 10;
const EXEC_OPTS = { timeout: 5000 };

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class BluetoothLinkMonitor {
  /**
   * @param {string} deviceMac - Speaker MAC, e.g. '54:B7:E5:87:7B:73'
   * @param {Object} [hooks]
   * @param {Function} [hooks.onStuck] - Called with 'reversed' | 'silent'
   * @param {Function} [hooks.isBusy] - True while a connect or recovery is running
   */
  constructor(deviceMac, { onStuck = null, isBusy = () => false } = {}) {
    this.deviceMac = deviceMac;
    this.onStuck = onStuck;
    this.isBusy = isBusy;
    this.silentChecks = 0;
    this.macUnderscored = deviceMac.replace(/:/g, '_');
    this.cardPath = `/card/bluez_card.${this.macUnderscored}/bluez`;

    this.timer = null;
    this.checking = false;
    this.lastStreamId = null; // sink index + codec; changes on reconnect or codec switch
    this.current = null;      // { codec, hci, expectedKbps } of the last monitored stream
    this.settled = false;
    this.windows = [];        // recent window results: true = had a bad second
    this.events = [];         // recent downgrades, newest last
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this._check().catch(() => {}); }, CHECK_INTERVAL_MS);
    logger.info('Bluetooth link monitor started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Bluetooth link monitor stopped');
    }
  }

  /**
   * Recent codec downgrades plus what the monitor currently sees.
   */
  getLinkHealth() {
    return {
      monitoring: this.timer !== null,
      current: this.current,
      events: [...this.events]
    };
  }

  /**
   * Record a link event (codec-fallback | recovered | recovery-failed) for the toast.
   */
  recordEvent(event) {
    this.events = [...this.events, { timestamp: new Date().toISOString(), ...event }].slice(-MAX_EVENTS);
  }

  /**
   * One monitoring pass. Skips unless the sink is RUNNING on aptX, and skips the
   * first pass after any reconnect/codec change so the stream can settle.
   * @private
   */
  async _check() {
    if (this.checking) return;
    this.checking = true;
    try {
      const sink = await this._readSink();
      if (!sink) {
        this.windows = [];
        this.settled = false;
        await this._checkStuck();
        return;
      }
      this.silentChecks = 0;
      if (sink.state !== 'RUNNING' || !MONITORED_CODECS[sink.codec] || !sink.rate || !sink.hci) {
        this.windows = [];
        this.settled = false;
        return;
      }

      const streamId = `${sink.index}:${sink.codec}`;
      const expectedKbps = sink.rate * 2 * MONITORED_CODECS[sink.codec] / 4 / 1000;
      if (streamId !== this.lastStreamId) {
        this.lastStreamId = streamId;
        this.current = { codec: sink.codec, hci: sink.hci, expectedKbps: Math.round(expectedKbps) };
        logger.info(`Monitoring ${sink.codec} on ${sink.hci} (needs ~${Math.round(expectedKbps)} kbps)`);
        this.settled = false;
      }
      // First RUNNING pass after a reconnect, codec switch, or resume is just settling
      if (!this.settled) {
        this.settled = true;
        this.windows = [];
        return;
      }

      const samples = await this._sampleKbps(sink.hci);
      const after = await this._readSink();
      if (!after || after.state !== 'RUNNING' || after.index !== sink.index || samples.length === 0) {
        return; // song change / pause / reconnect mid-window - discard
      }

      const threshold = expectedKbps * HEALTHY_RATIO;
      const bad = samples.some(kbps => kbps < threshold);
      this.windows = [...this.windows, bad].slice(-WINDOW_HISTORY);
      logger.debug(`${sink.codec} window ${bad ? 'BAD' : 'ok'} (kbps: ${samples.join(' ')}; threshold ${Math.round(threshold)})`);

      if (this.windows.filter(Boolean).length >= BAD_WINDOWS_TO_ACT) {
        await this._downgrade(sink, expectedKbps, samples);
      }
    } catch (error) {
      logger.debug(`Link check failed: ${error.message}`);
    } finally {
      this.checking = false;
    }
  }

  /**
   * No speaker sink: is the link reversed, or up but silent?
   * @private
   */
  async _checkStuck() {
    if (!this.onStuck || this.isBusy()) {
      this.silentChecks = 0;
      return;
    }
    if (await this._sourcePresent()) {
      this.silentChecks = 0;
      this.onStuck('reversed');
      return;
    }
    this.silentChecks = (await this._linkUp()) ? this.silentChecks + 1 : 0;
    if (this.silentChecks >= SILENT_CHECKS_TO_ACT) {
      this.silentChecks = 0;
      this.onStuck('silent');
    }
  }

  /** A speaker -> Monty capture source means the link came up reversed. @private */
  async _sourcePresent() {
    const { stdout } = await execPromise('pactl list short sources', EXEC_OPTS);
    return stdout.includes(`bluez_source.${this.macUnderscored}`);
  }

  /** @private */
  async _linkUp() {
    const { stdout } = await execPromise('hcitool con', EXEC_OPTS);
    return stdout.includes(this.deviceMac);
  }

  /**
   * Read the speaker's bluez sink: state, sample rate, codec, and which hciN carries it.
   * Null only when there is no sink; unparsed fields come back undefined.
   * @private
   */
  async _readSink() {
    const { stdout } = await execPromise('pactl list sinks', EXEC_OPTS);
    const block = stdout.split(/\n(?=Sink #)/).find(b => b.includes(`bluez_sink.${this.macUnderscored}`));
    if (!block) return null;

    const index = (block.match(/^Sink #(\d+)/) || [])[1];
    const state = (block.match(/State:\s*(\S+)/) || [])[1];
    const rate = Number((block.match(/Sample Specification:.*?(\d+)Hz/) || [])[1]);
    const codec = (block.match(/bluetooth\.codec = "([^"]+)"/) || [])[1];
    const hci = (block.match(/bluez\.path = "\/org\/bluez\/(hci\d+)\//) || [])[1];
    return { index, state, rate, codec, hci };
  }

  /**
   * Per-second kbps actually handed to the adapter, using measured elapsed time
   * (exec jitter would otherwise look like dips).
   * @private
   */
  async _sampleKbps(hci) {
    const samples = [];
    let prev = await this._readTxBytes(hci);
    for (let i = 0; i < SAMPLE_SECONDS; i++) {
      await sleep(1000);
      const cur = await this._readTxBytes(hci);
      // hciconfig prints a 32-bit counter (it goes negative) - take the delta mod 2^32
      const bytes = (((cur.bytes - prev.bytes) % 4294967296) + 4294967296) % 4294967296;
      samples.push(Math.round(bytes * 8 / (cur.at - prev.at)));
      prev = cur;
    }
    return samples;
  }

  /** @private */
  async _readTxBytes(hci) {
    const { stdout } = await execPromise(`hciconfig ${hci}`, EXEC_OPTS);
    const match = stdout.match(/TX bytes:(-?\d+)/);
    if (!match) throw new Error(`No TX counter for ${hci}`);
    return { bytes: Number(match[1]), at: Date.now() };
  }

  /**
   * Which side runs the link (CENTRAL = Monty, PERIPHERAL = speaker). Hunch from
   * Oct 31: the choppy link was speaker-led, the clean one Monty-led.
   * @private
   */
  async _linkRole(hci) {
    try {
      const { stdout } = await execPromise(`hcitool -i ${hci} con`, EXEC_OPTS);
      return (stdout.match(/lm (CENTRAL|PERIPHERAL|MASTER|SLAVE)/) || [])[1] || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Switch the speaker to SBC and record why.
   * @private
   */
  async _downgrade(sink, expectedKbps, samples) {
    this.windows = [];
    const role = await this._linkRole(sink.hci);
    try {
      await execPromise(`pactl send-message ${this.cardPath} switch-codec '"sbc"'`, { timeout: 10000 });
    } catch (error) {
      logger.warn(`Bluetooth link degraded on ${sink.codec} but switch to SBC failed: ${error.message}`);
      return;
    }

    const expected = Math.round(expectedKbps);
    this.recordEvent({
      type: 'codec-fallback',
      fromCodec: sink.codec,
      toCodec: 'sbc',
      expectedKbps: expected,
      samplesKbps: samples,
      hci: sink.hci,
      role
    });
    prometheusMetrics.recordOperation('bluetooth-codec-downgrade', true);
    logger.warn(`Bluetooth link couldn't keep up with ${sink.codec} (needs ~${expected} kbps, ` +
      `sent ${samples.join(' ')} kbps on ${sink.hci}, link role ${role}) - switched to SBC`);
  }
}

module.exports = BluetoothLinkMonitor;
