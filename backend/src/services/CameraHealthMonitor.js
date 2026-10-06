/**
 * CameraHealthMonitor — TEMPORARY stall warning for Frigate cameras.
 *
 * Why it exists: a camera's stream can go silent while every container stays
 * "healthy" (the Wyze bridge holds a dead session and never redials). Frigate
 * then records nothing and raises no alerts, and nobody notices for days. This
 * polls Frigate's /api/stats and reports any Frigate camera whose camera_fps has
 * been 0 for STALL_AFTER_MS. It only REPORTS — it never restarts anything, so
 * a stuck stream stays intact for diagnosis.
 *
 * Shown in the UI as a banner on the Cameras page and a red dot on the Cameras
 * nav entry. Each stall start/recovery is also logged (exact times for diagnosis).
 *
 * ─── REMOVING THIS (once the stall's root cause is fixed) ───────────────────
 *   1. `grep -rn "CAMERA-HEALTH" backend/src frontend/src` and delete each tagged
 *      line/block (cameras.js route, api.js camerasApi.health, CamerasPage banner,
 *      Navbar + Footer dots).
 *   2. Delete this file and frontend/src/components/cameras/CameraHealth.jsx.
 *   3. Backend restart + frontend rebuild.
 *   (The `relative` class added to the nav links is harmless; leave it or remove it.)
 * ────────────────────────────────────────────────────────────────────────────
 */

const configManager = require('../utils/config');
const logger = require('../utils/logger').getModuleLogger('camera-health');

const POLL_MS = 30 * 1000;
const STALL_AFTER_MS = 5 * 60 * 1000;

const state = new Map();   // camId -> { since: ms, reason, warned }
let timer = null;

const frigateCams = (c) => (c?.list || []).filter(cam => cam.frigate);

async function poll() {
  const c = configManager.get('cameras', null);
  const cams = frigateCams(c);
  if (!c?.frigateApiUrl || !cams.length) return;

  let stats = null;
  try {
    const r = await fetch(`${c.frigateApiUrl}/api/stats`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    stats = await r.json();
  } catch (err) {
    logger.debug(`Frigate stats unavailable: ${err.message}`);
  }

  const now = Date.now();
  for (const cam of cams) {
    const fps = stats?.cameras?.[cam.id]?.camera_fps;
    const s = state.get(cam.id);

    if (fps > 0) {
      if (s?.warned) {
        logger.info(`${cam.name} camera video recovered after ${Math.round((now - s.since) / 60000)} min (stalled since ${new Date(s.since).toLocaleString()})`);
      }
      state.delete(cam.id);
      continue;
    }

    const reason = stats ? 'no-video' : 'frigate-unreachable';
    const cur = s || { since: now, warned: false };
    cur.reason = reason;
    if (!cur.warned && now - cur.since >= STALL_AFTER_MS) {
      cur.warned = true;
      logger.warn(`${cam.name} camera: ${reason === 'no-video' ? 'Frigate receiving no video' : 'Frigate unreachable'} since ${new Date(cur.since).toLocaleString()}`);
    }
    state.set(cam.id, cur);
  }
}

/** Cameras stalled for at least STALL_AFTER_MS. `since` is the first zero-fps poll
 *  this process saw, so after a backend restart it can be later than the real start. */
function getStatus() {
  const names = new Map(frigateCams(configManager.get('cameras', null)).map(c => [c.id, c.name]));
  const stalled = [];
  for (const [id, s] of state) {
    if (s.warned && names.has(id)) stalled.push({ id, name: names.get(id), since: s.since, reason: s.reason });
  }
  return { stallAfterMinutes: STALL_AFTER_MS / 60000, stalled };
}

function start() {
  if (timer) return;
  poll().catch(() => {});
  timer = setInterval(() => poll().catch(() => {}), POLL_MS);
  timer.unref();
  logger.info(`Camera health monitor started (warns after ${STALL_AFTER_MS / 60000} min of no video)`);
}

module.exports = { start, getStatus };
