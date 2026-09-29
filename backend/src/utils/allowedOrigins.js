/**
 * Browser origins allowed to call Monty's API from another origin (dev server,
 * monty.home, guest hosts). Shared by the CORS middleware and WebSocket upgrade
 * checks (e.g. /api/cameras/ws) so they can't drift apart. Same-origin requests
 * (pages served by the backend itself) don't need to be listed.
 */
module.exports = [
  'http://localhost:3000',
  'http://localhost',
  'http://127.0.0.1:3000',
  'http://127.0.0.1',
  'http://192.168.10.15:3000',
  'http://192.168.10.15',
  'http://monty.home:3000',
  'http://monty.home',
  'http://guest0.monty.home',
  'http://guest1.monty.home',
  'http://guest2.monty.home',
];
