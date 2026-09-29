/**
 * Cameras routes — a read-only, allow-listed proxy to the private camera stack.
 *
 * The camera stack (go2rtc hub, Frigate, Wyze bridges) runs outside this repo;
 * its addresses and camera list come from the private `cameras` section of
 * config/config.json (see config/config.example.json). The browser only ever
 * sees camera ids/names — never camera IPs, credentials or Frigate's API.
 *
 * Like the weather map-tile proxy, every request is validated against an
 * allow-list before anything is fetched. Frigate's and go2rtc's own APIs can
 * delete recordings / add streams, so nothing is passed through wholesale.
 *
 *   GET  /api/cameras                          camera list + Frigate UI base (deep links)
 *   WS   /api/cameras/ws?src=<cam>             live video (go2rtc MSE/WebRTC signalling)
 *   GET  /api/cameras/events?before=&severity= Frigate review items (ALL retained, paged)
 *   GET  /api/cameras/events/:cam/:id/thumb.webp
 *   GET  /api/cameras/events/:id/clip.mp4       fallback playback (no length/ranges)
 *   GET  /api/cameras/vod/:cam/start/:s/end/:e/:file   Frigate HLS VOD (hls.js)
 *   GET  /api/cameras/battery/:cam             last battery level Wyze reported
 */

const express = require('express');
const http = require('http');
const router = express.Router();
const configManager = require('../utils/config');
const upgradeRouter = require('../utils/UpgradeRouter');
const allowedOrigins = require('../utils/allowedOrigins');
const logger = require('../utils/logger').getModuleLogger('cameras-routes');

const PAGE_SIZE = 30;
const REVIEW_ID = /^\d{9,11}\.\d{1,6}-[a-z0-9]{4,12}$/;          // e.g. 1790662088.123456-ab12cd
const VOD_FILE = /^(master\.m3u8|index-v\d+(-a\d+)?\.m3u8|init-v\d+(-a\d+)?\.mp4|seg-\d+-v\d+(-a\d+)?\.m4s)$/;

const cfg = () => configManager.get('cameras', null);
const findCam = (id) => (cfg()?.list || []).find(c => c.id === id);
const frigateCams = () => (cfg()?.list || []).filter(c => c.frigate).map(c => c.id);

function notConfigured(res) {
  return res.status(503).json({ success: false, error: 'Cameras are not configured' });
}

/**
 * Stream an upstream GET to the client (status, content type, body). Upstream
 * errors become 502; upstream 4xx/5xx are passed through as-is.
 */
function pipeGet(url, res, { headers = {}, timeoutMs = 20000 } = {}) {
  const up = http.get(url, { headers }, (upRes) => {
    res.status(upRes.statusCode);
    for (const h of ['content-type', 'content-length', 'cache-control']) {
      if (upRes.headers[h]) res.setHeader(h, upRes.headers[h]);
    }
    upRes.pipe(res);
  });
  up.setTimeout(timeoutMs, () => up.destroy(new Error('upstream timeout')));
  up.on('error', (err) => {
    logger.warn(`Camera proxy GET failed (${new URL(url).pathname}): ${err.message}`);
    if (!res.headersSent) res.status(502).json({ success: false, error: 'Camera service unreachable' });
    else res.destroy();
  });
  res.on('close', () => up.destroy());
}

function getJson(url, { headers = {}, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (r) => {
      let body = '';
      r.on('data', (c) => { body += c; });
      r.on('end', () => {
        if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------- camera list
router.get('/', (req, res) => {
  const c = cfg();
  if (!c) return notConfigured(res);
  res.json({
    success: true,
    data: {
      frigateUiUrl: c.frigateUiUrl || null,
      cameras: (c.list || []).map(({ id, name, mode, frigate }) => ({
        id, name, mode: mode === 'wake' ? 'wake' : 'live', frigate: Boolean(frigate),
      })),
    },
  });
});

// ---------------------------------------------------------------- events (Frigate review items)
// Frigate's /api/review defaults to the LAST 24 HOURS unless `after` is given, so
// always send after=1 (everything retained); page with before=<oldest start_time>.
router.get('/events', async (req, res) => {
  const c = cfg();
  if (!c?.frigateApiUrl) return notConfigured(res);
  const cams = frigateCams();
  if (!cams.length) return res.json({ success: true, data: [] });

  const q = new URLSearchParams({ limit: PAGE_SIZE, after: 1, cameras: cams.join(',') });
  const before = Number(req.query.before);
  if (Number.isFinite(before) && before > 0) q.set('before', before);
  if (req.query.severity === 'alert' || req.query.severity === 'detection') q.set('severity', req.query.severity);

  try {
    const items = await getJson(`${c.frigateApiUrl}/api/review?${q}`);
    res.json({
      success: true,
      pageSize: PAGE_SIZE,
      data: items.map((r) => {
        const d = r.data || {};
        const m = d.metadata || {};
        return {
          id: r.id,
          camera: r.camera,
          severity: r.severity,
          start_time: r.start_time,
          end_time: r.end_time,
          objects: (d.objects || []).filter(o => !o.includes('-verified')),
          zones: d.zones || [],
          title: m.title || null,
          shortSummary: m.shortSummary || null,
          scene: m.scene || null,
        };
      }),
    });
  } catch (err) {
    logger.warn(`Frigate review fetch failed: ${err.message}`);
    res.status(502).json({ success: false, error: 'Frigate unreachable' });
  }
});

router.get('/events/:cam/:id/thumb.webp', (req, res) => {
  const c = cfg();
  const { cam, id } = req.params;
  if (!c?.frigateApiUrl) return notConfigured(res);
  if (!findCam(cam)?.frigate || !REVIEW_ID.test(id)) return res.status(404).end();
  pipeGet(`${c.frigateApiUrl}/clips/review/thumb-${cam}-${id}.webp`, res);
});

router.get('/events/:id/clip.mp4', (req, res) => {
  const c = cfg();
  if (!c?.frigateApiUrl) return notConfigured(res);
  if (!REVIEW_ID.test(req.params.id)) return res.status(404).end();
  pipeGet(`${c.frigateApiUrl}/api/review/${req.params.id}/clip.mp4`, res, { timeoutMs: 120000 });
});

// HLS VOD for event playback (hls.js). Playlists reference their segments
// relatively, so every file lands back here under the same prefix.
router.get('/vod/:cam/start/:start/end/:end/:file', (req, res) => {
  const c = cfg();
  const { cam, start, end, file } = req.params;
  if (!c?.frigateApiUrl) return notConfigured(res);
  if (!findCam(cam)?.frigate || !/^\d{9,11}$/.test(start) || !/^\d{9,11}$/.test(end)
      || Number(end) <= Number(start) || !VOD_FILE.test(file)) {
    return res.status(404).end();
  }
  pipeGet(`${c.frigateApiUrl}/vod/${cam}/start/${start}/end/${end}/${file}`, res, { timeoutMs: 60000 });
});

// ---------------------------------------------------------------- battery (Outdoor cams)
// The last level Wyze's cloud knows (legacy bridge API; doesn't wake the camera).
const batteryCache = new Map();   // cam -> { at, body }
router.get('/battery/:cam', async (req, res) => {
  const c = cfg();
  const cam = findCam(req.params.cam);
  if (!c?.batteryApi?.url) return notConfigured(res);
  if (!cam || cam.mode !== 'wake') return res.status(404).end();

  const hit = batteryCache.get(cam.id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return res.json(hit.body);

  const { url, username, password } = c.batteryApi;
  const headers = username ? { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') } : {};
  try {
    const d = await getJson(`${url}/api/${cam.id}/battery`, { headers });
    const body = { success: true, data: { value: Number(d.value), reportedAt: Number(d.response?.ts) || null } };
    batteryCache.set(cam.id, { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    logger.warn(`Battery fetch for ${cam.id} failed: ${err.message}`);
    res.status(502).json({ success: false, error: 'Battery level unavailable' });
  }
});

// ---------------------------------------------------------------- live video websocket
// Browser → Monty (same origin) → go2rtc hub /api/ws. go2rtc rejects a websocket
// whose Origin host ≠ Host, so the upstream request presents the hub's own host
// for both; Monty does the real same-origin check here instead.
upgradeRouter.register('/api/cameras/ws', (req, socket, head) => {
  const reject = (code, text) => socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
  const c = cfg();
  if (!c?.hubUrl) return reject(503, 'Service Unavailable');

  const src = new URL(req.url, 'http://x').searchParams.get('src');
  if (!findCam(src)) return reject(404, 'Not Found');

  // Only Monty's own pages may open camera streams: same origin as the API, or one
  // of Monty's known origins (dev server, monty.home, guest hosts) — the same list
  // CORS uses. Blocks other sites from using a visitor's browser to watch cameras.
  const origin = req.headers.origin;
  if (origin) {
    let originHost = null;
    try { originHost = new URL(origin).host; } catch { /* malformed */ }
    if (originHost !== req.headers.host && !allowedOrigins.includes(origin)) return reject(403, 'Forbidden');
  }

  const hub = new URL(c.hubUrl);
  const upstream = http.request({
    hostname: hub.hostname,
    port: hub.port,
    path: `/api/ws?src=${encodeURIComponent(src)}`,
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      Host: hub.host,
      Origin: `${hub.protocol}//${hub.host}`,
      'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
      'Sec-WebSocket-Version': req.headers['sec-websocket-version'],
      ...(req.headers['sec-websocket-extensions'] && { 'Sec-WebSocket-Extensions': req.headers['sec-websocket-extensions'] }),
      ...(req.headers['sec-websocket-protocol'] && { 'Sec-WebSocket-Protocol': req.headers['sec-websocket-protocol'] }),
    },
  });

  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    let head101 = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (let i = 0; i < upRes.rawHeaders.length; i += 2) head101 += `${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}\r\n`;
    socket.write(head101 + '\r\n');
    if (upHead?.length) socket.write(upHead);
    if (head?.length) upSocket.write(head);
    upSocket.pipe(socket).pipe(upSocket);
    const done = () => { socket.destroy(); upSocket.destroy(); };
    socket.on('error', done); upSocket.on('error', done);
    socket.on('close', done); upSocket.on('close', done);
  });
  upstream.on('response', (r) => { reject(r.statusCode || 502, 'Bad Gateway'); r.resume(); });
  upstream.on('error', (err) => {
    logger.warn(`Camera websocket to hub failed: ${err.message}`);
    reject(502, 'Bad Gateway');
  });
  upstream.end();
});

module.exports = router;
