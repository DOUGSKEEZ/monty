/**
 * UpgradeRouter - one place that dispatches HTTP→WebSocket upgrades by path.
 *
 * Why: a `ws` WebSocketServer created with `{ server, path }` listens to EVERY
 * upgrade on the HTTP server and aborts non-matching paths with 400 — so a
 * second WebSocket endpoint (e.g. /api/cameras/ws next to /api/pianobar/ws)
 * would be killed before its own handler ran. Instead, WebSocket servers are
 * created with `noServer: true` and register their path here.
 *
 *   const upgradeRouter = require('./utils/UpgradeRouter');
 *   upgradeRouter.attach(server);                        // once, in server.js
 *   upgradeRouter.register('/api/x/ws', (req, socket, head) => { ... });
 */

const logger = require('./logger').getModuleLogger('upgrade-router');

const handlers = new Map();
let attached = false;

function pathnameOf(url = '') {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function attach(server) {
  if (attached) return;
  attached = true;
  server.on('upgrade', (req, socket, head) => {
    const handler = handlers.get(pathnameOf(req.url));
    if (!handler) {
      // Same outcome as ws's own abort for an unknown path
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    try {
      handler(req, socket, head);
    } catch (err) {
      logger.error(`Upgrade handler for ${pathnameOf(req.url)} failed: ${err.message}`);
      socket.destroy();
    }
  });
}

function register(path, handler) {
  if (handlers.has(path)) logger.warn(`Replacing upgrade handler for ${path}`);
  handlers.set(path, handler);
}

module.exports = { attach, register };
