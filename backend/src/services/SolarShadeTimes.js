/**
 * SolarShadeTimes - sun-position-driven timing for the solar shade scenes.
 *
 * Computes, for a given day, when to LOWER the solar shades (afternoon sun
 * swinging onto the WSW-facing glass) and when to RAISE them (a viewing lead
 * before the sun drops behind the jagged western mountain ridge).
 *
 *   LOWER: first afternoon moment the sun's AZIMUTH reaches `trigger_azimuth_deg`.
 *   RAISE: on the descending western side, when the sun's ALTITUDE first drops to
 *          `ridgeAltitude(azimuth) + viewing_lead_degrees` — i.e. `lead` degrees
 *          above where it will disappear behind the ridge.
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

  _viewingLead() {
    const r = this._cfg().raise || {};
    return Number.isFinite(r.viewing_lead_degrees) ? r.viewing_lead_degrees : 6;
  }

  _defaultRidge() {
    const r = this._cfg().raise || {};
    return Number.isFinite(r.default_ridge_altitude_deg) ? r.default_ridge_altitude_deg : 3.0;
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

    // Solar declination (radians).
    const decl = 0.006918
      - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
      - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);

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

  /**
   * Interpolated ridge altitude (degrees) at a given azimuth.
   * 0 hard points -> default; 1 point -> flat at that altitude; >=2 -> linear
   * interpolation, clamped at the endpoints (never extrapolate a jagged ridge).
   */
  ridgeAltitudeAt(azimuth) {
    const pts = this._ridgePoints();
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
   * RAISE time: first descending western minute where the sun altitude drops to
   * ridge(azimuth) + lead. Returns a local Date, or null if no crossing.
   */
  _findRaiseTime(date) {
    const lead = this._viewingLead();
    let prevAlt = null;
    for (let m = 12 * 60; m <= 21 * 60 + 30; m++) {
      const when = this._localTimeAt(date, m);
      const { altitude, azimuth } = this.sunPosition(when);
      const descending = prevAlt !== null && altitude < prevAlt;
      if (descending && azimuth > 180 && altitude > -1) {
        const threshold = this.ridgeAltitudeAt(azimuth) + lead;
        if (altitude <= threshold) return when;
      }
      prevAlt = altitude;
    }
    return null;
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
