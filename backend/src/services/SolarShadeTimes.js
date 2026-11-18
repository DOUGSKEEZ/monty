/**
 * SolarShadeTimes - sun-position-driven timing for the solar shade scenes.
 *
 * Computes, for a given day, when to LOWER the solar shades (afternoon sun
 * swinging onto the WSW-facing glass) and when to RAISE them (a viewing lead
 * before the sun drops behind the jagged western mountain ridge).
 *
 *   LOWER: first afternoon moment the sun's AZIMUTH reaches `trigger_azimuth_deg`.
 *   RAISE: the earlier of golden hour (sun down to `raise_altitude_deg`, NW sunsets
 *          only) and `raise_lead_minutes` before the sun is fully behind the ridge.
 *
 * The ridge is described by a "horizon profile" — a list of {azimuth, altitude}
 * points. Only points measured as an actual disappearance (`calibratedFrom` !==
 * 'still_up') define the interpolated ridge; 'still_up' points are upper bounds
 * kept for the graph but never used to raise the ridge estimate.
 *
 * Solar geometry is a self-contained port of the NOAA solar-position algorithm
 * (no external dependency). It derives day-of-year / hour from UTC, so it is
 * inherently DST-agnostic; scan windows use local wall-clock time so the Dates
 * returned line up with the scheduler's system-local cron.
 *
 * Design: constructed with a CONFIG GETTER (not a snapshot) so it always sees
 * the latest hot-reloaded schedulerConfig. getTodaysTimes() never throws — on
 * any internal error it returns nulls so the caller falls back to fixed timing.
 */

const logger = require('../utils/logger').getModuleLogger('solar-shade-times');

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// Hamilton Creek Metro District (primary weather/sun coordinates)
const DEFAULT_LAT = 39.66336894676102;
const DEFAULT_LON = -106.06774195949477;

class SolarShadeTimes {
  /**
   * @param {() => object} configGetter - returns the live schedulerConfig object
   * @param {{latitude?: number, longitude?: number}} [opts]
   */
  constructor(configGetter, opts = {}) {
    this.getConfig = typeof configGetter === 'function' ? configGetter : () => configGetter;
    this.latitude = Number.isFinite(opts.latitude) ? opts.latitude : DEFAULT_LAT;
    this.longitude = Number.isFinite(opts.longitude) ? opts.longitude : DEFAULT_LON;
  }

  /** The `solar_shades` config block (or {} if absent). */
  _cfg() {
    const c = this.getConfig();
    return (c && c.solar_shades) || {};
  }

  isEnabled() {
    return !!this._cfg().enabled;
  }

  _triggerAzimuth() {
    const v = this._cfg().lower && this._cfg().lower.trigger_azimuth_deg;
    return Number.isFinite(v) ? v : 202;
  }

  // The standard "raise" altitude — the conventional start of golden hour (~6°).
  // Shades normally raise when the sun descends to this height over the horizon.
  _raiseAltitude() {
    const r = this._cfg().raise || {};
    return Number.isFinite(r.raise_altitude_deg) ? r.raise_altitude_deg : 6;
  }

  // Golden hour only applies to sunsets at or past this bearing (northwest, summer).
  // The windows face ~240°, so a winter sunset in the low saddle (~236–243°) hits the
  // glass square-on and is harsh even at 5–6°; a summer sunset (~285–298°) is 45–58°
  // off the window face. South of this bearing, the raise waits for the ridge tuck.
  _goldenMinAzimuth() {
    const r = this._cfg().raise || {};
    return Number.isFinite(r.golden_hour_min_azimuth_deg) ? r.golden_hour_min_azimuth_deg : 260;
  }

  _defaultRidge() {
    const r = this._cfg().raise || {};
    return Number.isFinite(r.default_ridge_altitude_deg) ? r.default_ridge_altitude_deg : 3.0;
  }

  // Degrees above the ridge at which we raise when the ridge is TALLER than the
  // standard height — i.e. "raise the moment the sun tucks behind the ridge",
  // ~1–2 min before it's fully gone. Also guarantees the raise beats the ridge.
  // How many minutes BEFORE the sun is fully behind the ridge to raise, when the
  // ridge is taller than the golden-hour height (the "tuck-behind" lead). Expressed
  // in time (not degrees) so it stays ~constant across seasons.
  _raiseLeadMinutes() {
    const r = this._cfg().raise || {};
    return Number.isFinite(r.raise_lead_minutes) ? r.raise_lead_minutes : 2;
  }

  /** Sorted list of "hard" ridge points (excludes still_up upper bounds). */
  _ridgePoints() {
    const r = this._cfg().raise || {};
    const profile = Array.isArray(r.horizon_profile) ? r.horizon_profile : [];
    return profile
      .filter((p) => p && Number.isFinite(p.azimuth) && Number.isFinite(p.altitude) && p.calibratedFrom !== 'still_up')
      .sort((a, b) => a.azimuth - b.azimuth);
  }

  /**
   * Sun altitude & azimuth (degrees) for a given instant.
   * NOAA algorithm; azimuth is a compass bearing measured clockwise from north.
   */
  sunPosition(date) {
    const lat = this.latitude;
    const lon = this.longitude;
    const latR = lat * D2R;

    // Day-of-year and fractional hour, both in UTC (matches the NOAA formulation).
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - startOfYear;
    const dayOfYear = Math.floor(dayMs / 86400000);
    const hourUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    const g = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourUTC - 12) / 24);

    const eqtime = 229.18 * (0.000075
      + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));

    const decl = SolarShadeTimes._declination(g);

    const tst = hourUTC * 60 + eqtime + 4 * lon; // true solar time, minutes
    const ha = (tst / 4 - 180) * D2R;            // hour angle, radians

    const cosZen = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    const altitude = 90 - R2D * Math.acos(Math.max(-1, Math.min(1, cosZen)));

    const azFromSouth = Math.atan2(
      Math.sin(ha),
      Math.cos(ha) * Math.sin(latR) - Math.tan(decl) * Math.cos(latR)
    );
    const azimuth = ((R2D * azFromSouth) + 180 + 360) % 360;

    return { altitude, azimuth };
  }

  /** Solar declination (radians) for the NOAA fractional-year angle g. */
  static _declination(g) {
    return 0.006918
      - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
      - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  }

  /** Declination (radians) at an instant: the same series sunPosition uses. */
  _declinationAt(date) {
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - startOfYear;
    const hourUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    return SolarShadeTimes._declination((2 * Math.PI / 365) * (Math.floor(dayMs / 86400000) - 1 + (hourUTC - 12) / 24));
  }

  /**
   * The other day of the year the sun crosses the same ridge spot as at `when`.
   * The sun's evening path is set by its declination, which takes each value twice
   * a year (once heading toward the winter solstice, once heading away), so a ridge
   * point seen on one date is crossed again on its "mirror" date (Nov 17 <-> Jan 26).
   * Returns null near a solstice, where the two dates collapse into the turnaround.
   */
  mirrorDate(when) {
    const target = this._declinationAt(when);
    let prev = null;
    for (let d = 1; d <= 366; d++) {
      const diff = this._declinationAt(new Date(when.getTime() + d * 86400000)) - target;
      if (prev !== null && (prev < 0) !== (diff < 0)) {
        const days = d - 1 + prev / (prev - diff);
        // Within a few days of the reading (either way round the year) = the turnaround itself.
        return days < 4 || days > 361 ? null : new Date(when.getTime() + days * 86400000);
      }
      prev = diff;
    }
    return null;
  }

  /**
   * Ridge points collapsed for the CALCULATION: only readings essentially on the
   * SAME spot (within MERGE_BAND° — narrower than the sun's ~0.5° width) collapse to
   * one: a watched reading beats a guess, otherwise the MOST RECENT wins. (The sun
   * re-crosses each bearing after the solstice, so a later-dated guess must not
   * override a real reading from the other side of the year.) Distinct days are
   * ~0.5°/day apart near the equinox, so they stay separate ridge points.
   * Mirrored in the frontend RidgeCalibrator.
   */
  _ridgeReps() {
    const MERGE_BAND = 0.3;
    const reps = [];
    for (const p of this._ridgePoints()) {
      const near = reps.find((r) => Math.abs(r.azimuth - p.azimuth) <= MERGE_BAND);
      const guess = !!p.guess;
      if (!near) {
        reps.push({ azimuth: p.azimuth, altitude: p.altitude, observedAt: p.observedAt, guess });
      } else if (guess !== near.guess ? !guess : new Date(p.observedAt || 0) >= new Date(near.observedAt || 0)) {
        Object.assign(near, { azimuth: p.azimuth, altitude: p.altitude, observedAt: p.observedAt, guess });
      }
    }
    return reps.sort((a, b) => a.azimuth - b.azimuth);
  }

  /**
   * Interpolated ridge altitude (degrees) at a given azimuth.
   * 0 points -> default; 1 point -> flat; >=2 -> linear interpolation between the
   * most-recent representative points, clamped at the endpoints.
   */
  ridgeAltitudeAt(azimuth) {
    const pts = this._ridgeReps();
    if (pts.length === 0) return this._defaultRidge();
    if (pts.length === 1) return pts[0].altitude;
    if (azimuth <= pts[0].azimuth) return pts[0].altitude;
    if (azimuth >= pts[pts.length - 1].azimuth) return pts[pts.length - 1].altitude;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (azimuth >= a.azimuth && azimuth <= b.azimuth) {
        const t = (azimuth - a.azimuth) / (b.azimuth - a.azimuth);
        return a.altitude + t * (b.altitude - a.altitude);
      }
    }
    return this._defaultRidge();
  }

  /** Local-midnight Date for the calendar day of `date`. */
  _localMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  /** Build a local wall-clock Date on `date`'s day at the given minutes-since-midnight. */
  _localTimeAt(date, minuteOfDay) {
    const d = this._localMidnight(date);
    d.setMinutes(minuteOfDay);
    return d;
  }

  /**
   * LOWER time: first afternoon minute (>= 12:00 local) where the sun's azimuth
   * has reached the trigger AND the sun is descending (rejects the morning wrap).
   * Returns a local Date, or null if no crossing in the window.
   */
  _findLowerTime(date) {
    const trigger = this._triggerAzimuth();
    let prevAlt = null;
    for (let m = 12 * 60; m <= 20 * 60; m++) {
      const when = this._localTimeAt(date, m);
      const { altitude, azimuth } = this.sunPosition(when);
      const descending = prevAlt !== null && altitude < prevAlt;
      if (descending && azimuth >= trigger && azimuth < 330 && altitude > 0) {
        return when;
      }
      prevAlt = altitude;
    }
    return null;
  }

  /**
   * RAISE time — the EARLIER of two moments on the descending western side:
   *   • golden hour: when the sun descends to raise_altitude_deg (~6°), and
   *   • the tuck: `raise_lead_minutes` before the sun is fully behind the ridge.
   * On a low ridge, golden hour comes first (long open-sky view). On a ridge
   * taller than 6°, the sun is already behind it by 6°, so the tuck wins — and
   * because it's a TIME lead, it's a genuine ~1–2 min before the sun vanishes,
   * every season. Golden hour only counts when the sun reaches 6° at or past
   * golden_hour_min_azimuth_deg (NW summer sunsets); otherwise the tuck decides.
   * Returns a local Date, or null if no crossing.
   */
  _findRaiseTime(date) {
    const { goldenTime, goldenAz, goneTime } = this._scanEvening(date);
    const candidates = [];
    if (goldenTime && goldenAz >= this._goldenMinAzimuth()) candidates.push(goldenTime.getTime());
    if (goneTime) candidates.push(goneTime.getTime() - this._raiseLeadMinutes() * 60000);
    if (!candidates.length) return null;
    return new Date(Math.min(...candidates));
  }

  /** When the sun goes fully behind the ridge on `date` (local Date), or null. */
  goneTime(date) {
    return this._scanEvening(date).goneTime;
  }

  /** Evening scan: when (and where) the sun reaches golden-hour height, and the ridge. */
  _scanEvening(date) {
    const raiseAlt = this._raiseAltitude();
    // 20-second resolution: the ridge-crossing time must be accurate, since we
    // subtract a couple minutes from it (minute-rounding there would skew the lead).
    const base = this._localMidnight(date);
    let goldenTime = null;   // sun reaches golden-hour height
    let goldenAz = null;     // ...and the bearing where it does
    let goneTime = null;     // sun reaches the ridge (fully behind)
    let prevAlt = null;
    for (let sec = 12 * 3600; sec <= 21.5 * 3600; sec += 20) {
      const when = new Date(base.getTime() + sec * 1000);
      const { altitude, azimuth } = this.sunPosition(when);
      const descending = prevAlt !== null && altitude < prevAlt;
      if (descending && azimuth > 180) {
        if (goldenTime === null && altitude <= raiseAlt) { goldenTime = when; goldenAz = azimuth; }
        if (goneTime === null && altitude <= this.ridgeAltitudeAt(azimuth)) goneTime = when;
      }
      prevAlt = altitude;
    }
    return { goldenTime, goldenAz, goneTime };
  }

  /**
   * Master entry used by SchedulerService. Never throws.
   * @returns {{ lowerTime: Date|null, raiseTime: Date|null }}
   */
  getTodaysTimes(date = new Date()) {
    try {
      return {
        lowerTime: this._findLowerTime(date),
        raiseTime: this._findRaiseTime(date),
      };
    } catch (err) {
      logger.warn(`getTodaysTimes failed: ${err.message}`);
      return { lowerTime: null, raiseTime: null };
    }
  }

  /**
   * Sun track for the graph / preview: sampled altitude & azimuth across the
   * afternoon-evening. `minute` is minutes-since-local-midnight.
   * @returns {Array<{minute:number, altitude:number, azimuth:number}>}
   */
  sunTrack(date = new Date(), { stepMin = 2, fromHour = 11, toHour = 21 } = {}) {
    const out = [];
    try {
      for (let m = fromHour * 60; m <= toHour * 60; m += stepMin) {
        const { altitude, azimuth } = this.sunPosition(this._localTimeAt(date, m));
        out.push({ minute: m, altitude, azimuth });
      }
    } catch (err) {
      logger.warn(`sunTrack failed: ${err.message}`);
    }
    return out;
  }
}

module.exports = SolarShadeTimes;
