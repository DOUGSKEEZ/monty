/**
 * OvercastGovernor - "Weather Interventions" for the afternoon solar shades.
 *
 * Decides, from the hourly forecast, whether the solar shades should stay UP
 * for a truly overcast afternoon, and may reverse that call ONCE if the
 * forecast changes. Deterministic and flap-resistant by design:
 *
 *   At Good Afternoon:   hold UP only if EVERY hour from now → Good Evening is
 *                        overcast (clouds ≥ overcast_min_clouds AND cloud/precip
 *                        condition). One partly-cloudy hour = lower as normal.
 *   HELD_UP → LOWERED:   any hour in the next 2h drops below clearing_max_clouds,
 *                        seen on 2 consecutive ticks (easy — glare is the worse error).
 *   LOWERED → RAISED:    EVERY remaining hour overcast AND ≥ min_minutes_left_to_raise
 *                        before Good Evening, seen on 3 consecutive ticks (hard).
 *
 * One initial decision + at most one reversal per day, then latched. The manual
 * "skip solar today" bypass counts as a (human) HELD_UP decision — the clearing
 * reversal still protects against glare if the sky turns sunny. Every decision is
 * appended to data/shade_interventions.jsonl with a plain-English message and
 * the forecast hours behind it (future calibration data for a light sensor).
 *
 * The rule functions are pure (exported for tests); the class owns the daily
 * state machine, a 15-minute tick, and the history file.
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('../utils/logger').getModuleLogger('overcast-governor');

const HISTORY_PATH = path.join(__dirname, '../../../data/shade_interventions.jsonl');
const HOUR_MS = 60 * 60 * 1000;
const OVERCAST_CONDITIONS = new Set(['Clouds', 'Rain', 'Drizzle', 'Snow', 'Thunderstorm']);
const CLEARING_LOOKAHEAD_MS = 2 * HOUR_MS;
const CLEARING_TICKS = 2;
const CLOUDING_TICKS = 3;

const DEFAULTS = {
  enabled: true,
  overcast_min_clouds: 90,
  clearing_max_clouds: 70,
  min_minutes_left_to_raise: 90
};

// ---------- Pure rules ----------

// Forecast hours use a local timestamp without 'Z', which JS parses as local time.
const hourStart = (h) => new Date(h.timestamp).getTime();

// Hours whose [start, start+1h) interval overlaps [from, to).
function windowHours(hourly, from, to) {
  return (hourly || []).filter(h => {
    const start = hourStart(h);
    return start < to.getTime() && start + HOUR_MS > from.getTime();
  });
}

function isOvercastHour(h, minClouds) {
  return h.cloudiness >= minClouds && OVERCAST_CONDITIONS.has(h.weather?.main);
}

function overcastThrough(hours, minClouds) {
  return hours.length > 0 && hours.every(h => isOvercastHour(h, minClouds));
}

function clearingSoon(hourly, now, maxClouds) {
  const next = windowHours(hourly, now, new Date(now.getTime() + CLEARING_LOOKAHEAD_MS));
  return next.some(h => h.cloudiness < maxClouds);
}

// Compact snapshot of the hours behind a decision, for the history log.
const summarize = (hours) => hours.map(h => ({
  time: h.time,
  clouds: h.cloudiness,
  weather: h.weather?.description,
  uvi: h.uvIndex
}));

const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Service ----------

class OvercastGovernor {
  /**
   * @param {object} scheduler - SchedulerService (config, times, weather, shade calls)
   * @param {{historyPath?: string}} [opts]
   */
  constructor(scheduler, opts = {}) {
    this.scheduler = scheduler;
    this.historyPath = opts.historyPath || HISTORY_PATH;
    this.tickJob = null;
    this._resetDay(new Date());
  }

  _cfg() {
    return { ...DEFAULTS, ...(this.scheduler.schedulerConfig.overcast_governor || {}) };
  }

  _resetDay(now) {
    this.day = {
      date: localDateKey(now),
      state: 'PENDING',      // PENDING | HELD_UP | LOWERED | RAISED_EARLY
      reversed: false,
      clearingStreak: 0,
      cloudingStreak: 0
    };
  }

  _today(now) {
    if (this.day.date !== localDateKey(now)) this._resetDay(now);
    return this.day;
  }

  start() {
    if (this.tickJob) return;
    this.tickJob = cron.schedule('*/15 * * * *', () => {
      this.tick().catch(err => logger.error(`Tick failed: ${err.message}`));
    });
    logger.info('Weather Interventions governor started (15-min tick)');
  }

  stop() {
    if (this.tickJob) {
      this.tickJob.stop();
      this.tickJob = null;
    }
  }

  async _hourly() {
    const forecast = await this.scheduler.weatherService.getForecast();
    return forecast?.allHourly || [];
  }

  /**
   * Called by executeScene('good_afternoon'). Returns true to keep the solar
   * shades up (skip the scene's shade commands).
   */
  async shouldHoldUp(now = new Date()) {
    const cfg = this._cfg();
    const day = this._today(now);
    if (!cfg.enabled) return false;

    // Good Afternoon ran again today (e.g. manual trigger): treat as a human
    // lowering the shades — latch and stay out of the way.
    if (day.state !== 'PENDING') {
      day.state = 'LOWERED';
      day.reversed = true;
      return false;
    }

    const evening = this.scheduler.nextSceneTimes?.good_evening;
    let hours = [];
    try {
      if (evening instanceof Date && evening > now) {
        hours = windowHours(await this._hourly(), now, evening);
      }
    } catch (err) {
      logger.warn(`Forecast unavailable, lowering as normal: ${err.message}`);
    }

    if (overcastThrough(hours, cfg.overcast_min_clouds)) {
      day.state = 'HELD_UP';
      this._record('held_up', 'Overcast forecasted this afternoon: Solar Shades stay up', hours);
      return true;
    }

    day.state = 'LOWERED';
    this._record('lowered_as_normal', hours.length
      ? 'Sun forecasted this afternoon: Solar Shades go down'
      : 'No forecast available: Solar Shades go down', hours);
    return false;
  }

  /**
   * Called by executeScene('good_afternoon') when the manual bypass is on. The
   * shades stay up, but the day is tracked as HELD_UP so a sunny turn still
   * lowers them. Always returns true (the bypass is honored at trigger time).
   */
  async noteManualHold(now = new Date()) {
    const day = this._today(now);
    if (!this._cfg().enabled || day.state !== 'PENDING') return true;

    const evening = this.scheduler.nextSceneTimes?.good_evening;
    let hours = [];
    try {
      if (evening instanceof Date && evening > now) hours = windowHours(await this._hourly(), now, evening);
    } catch (err) {
      logger.warn(`Forecast unavailable for manual hold snapshot: ${err.message}`);
    }
    day.state = 'HELD_UP';
    this._record('held_up_manual', 'Skipped for today: Solar Shades stay up (watching for sun)', hours);
    return true;
  }

  /**
   * 15-minute check between Good Afternoon and Good Evening; may make the day's
   * single reversal.
   */
  async tick(now = new Date()) {
    const cfg = this._cfg();
    const day = this._today(now);
    const s = this.scheduler;
    const evening = s.nextSceneTimes?.good_evening;

    if (!cfg.enabled || day.reversed || !s.isHomeStatusActive()) return;
    if (!['HELD_UP', 'LOWERED'].includes(day.state)) return;
    if (!(evening instanceof Date) || now >= evening) return;

    const hourly = await this._hourly();

    if (day.state === 'HELD_UP') {
      day.clearingStreak = clearingSoon(hourly, now, cfg.clearing_max_clouds) ? day.clearingStreak + 1 : 0;
      if (day.clearingStreak >= CLEARING_TICKS) {
        const next = windowHours(hourly, now, new Date(now.getTime() + CLEARING_LOOKAHEAD_MS));
        await this._reverse('good_afternoon', 'LOWERED', 'lowered_reversal',
          'Sun now detected this afternoon: Solar Shades DOWN', next);
      }
      return;
    }

    // LOWERED: only raise early for a long, solidly overcast remainder.
    const minutesLeft = (evening - now) / 60000;
    const remaining = windowHours(hourly, now, evening);
    const clouding = minutesLeft >= cfg.min_minutes_left_to_raise && overcastThrough(remaining, cfg.overcast_min_clouds);
    day.cloudingStreak = clouding ? day.cloudingStreak + 1 : 0;
    if (day.cloudingStreak >= CLOUDING_TICKS) {
      await this._reverse('good_evening', 'RAISED_EARLY', 'raised_reversal',
        'Overcast now detected through evening: Solar Shades UP', remaining);
    }
  }

  async _reverse(sceneName, newState, action, message, hours) {
    const result = await this.scheduler.callShadeCommander(sceneName);
    if (!result.success) {
      // Keep the streak so the next tick retries.
      logger.error(`Weather intervention '${action}' failed: ${result.message}`);
      return;
    }
    this.day.state = newState;
    this.day.reversed = true;
    this._record(action, message, hours);
  }

  _record(action, message, hours) {
    const entry = { timestamp: new Date().toISOString(), action, message, hours: summarize(hours) };
    logger.info(`🌥️ Weather Intervention: ${message}`);
    try {
      fs.appendFileSync(this.historyPath, JSON.stringify(entry) + '\n');
    } catch (err) {
      logger.error(`Failed to write intervention history: ${err.message}`);
    }
  }

  /** Today's state plus the last `days` days of history, newest first. */
  getStatus(days = 7) {
    const cutoff = Date.now() - days * 24 * HOUR_MS;
    let history = [];
    try {
      if (fs.existsSync(this.historyPath)) {
        history = fs.readFileSync(this.historyPath, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line); } catch { return null; } })
          .filter(e => e && new Date(e.timestamp).getTime() >= cutoff)
          .reverse();
      }
    } catch (err) {
      logger.error(`Failed to read intervention history: ${err.message}`);
    }
    const day = this._today(new Date());
    return { enabled: this._cfg().enabled, today: { ...day }, history };
  }
}

module.exports = OvercastGovernor;
module.exports.rules = { windowHours, isOvercastHour, overcastThrough, clearingSoon };
