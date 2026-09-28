// Run: node --test src/services/OvercastGovernor.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OvercastGovernor = require('./OvercastGovernor');
const { windowHours, overcastThrough, clearingSoon } = OvercastGovernor.rules;

// Local-time helpers (forecast timestamps are local, no 'Z').
const at = (h, m = 0) => new Date(2026, 8, 28, h, m, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
const hour = (h, clouds, main = 'Clouds') => ({
  timestamp: `2026-09-28T${pad(h)}:00:00.000`,
  time: `${h}:00`,
  cloudiness: clouds,
  weather: { main, description: main.toLowerCase() },
  uvIndex: 1
});
// Hourly forecast 12:00–20:00 from a {hour: clouds} override map (default 100% overcast).
const forecast = (overrides = {}, main = 'Clouds') =>
  Array.from({ length: 9 }, (_, i) => 12 + i).map(h =>
    Array.isArray(overrides[h]) ? hour(h, ...overrides[h]) : hour(h, overrides[h] ?? 100, main));

function makeGovernor(hourly, { evening = at(18, 30) } = {}) {
  const calls = [];
  const scheduler = {
    schedulerConfig: {},
    nextSceneTimes: { good_evening: evening },
    skipSolarToday: false,
    isHomeStatusActive: () => true,
    weatherService: { getForecast: async () => ({ allHourly: scheduler.hourly }) },
    callShadeCommander: async (scene) => { calls.push(scene); return { success: true }; },
    hourly
  };
  const historyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'overcast-')), 'h.jsonl');
  const gov = new OvercastGovernor(scheduler, { historyPath });
  gov._resetDay(at(12));
  return { gov, scheduler, calls };
}

test('windowHours includes the partial hour at each end', () => {
  const hrs = windowHours(forecast(), at(13, 45), at(18, 30));
  assert.deepStrictEqual(hrs.map(h => h.time), ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
});

test('overcastThrough: all overcast yes; one scattered hour no; fog no; empty no', () => {
  assert.ok(overcastThrough(forecast(), 90));
  assert.ok(overcastThrough(forecast({}, 'Rain'), 90));
  assert.ok(!overcastThrough(forecast({ 16: 60 }), 90));
  assert.ok(!overcastThrough(forecast({}, 'Fog'), 90));
  assert.ok(!overcastThrough([], 90));
});

test('clearingSoon looks only 2h ahead', () => {
  assert.ok(!clearingSoon(forecast({ 17: 20 }), at(14), 70));
  assert.ok(clearingSoon(forecast({ 15: 20 }), at(14), 70));
});

test('overcast afternoon: holds shades up', async () => {
  const { gov } = makeGovernor(forecast({}, 'Rain'));
  assert.strictEqual(await gov.shouldHoldUp(at(13, 45)), true);
  assert.strictEqual(gov.day.state, 'HELD_UP');
  assert.strictEqual(gov.getStatus().history[0].action, 'held_up');
});

test('one scattered hour: lowers as normal', async () => {
  const { gov } = makeGovernor(forecast({ 16: 60 }));
  assert.strictEqual(await gov.shouldHoldUp(at(13, 45)), false);
  assert.strictEqual(gov.day.state, 'LOWERED');
});

test('held up, then clearing: lowers after 2 consecutive ticks, then latches', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast());
  await gov.shouldHoldUp(at(13, 45));
  scheduler.hourly = forecast({ 15: 30 });
  await gov.tick(at(14, 0));
  assert.deepStrictEqual(calls, []);
  await gov.tick(at(14, 15));
  assert.deepStrictEqual(calls, ['good_afternoon']);
  assert.strictEqual(gov.day.state, 'LOWERED');
  // Latched: even a solid overcast forecast can't reverse again.
  scheduler.hourly = forecast();
  for (const m of [30, 45]) await gov.tick(at(14, m));
  for (const m of [0, 15, 30]) await gov.tick(at(15, m));
  assert.deepStrictEqual(calls, ['good_afternoon']);
});

test('clearing streak resets when the forecast wobbles back', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast());
  await gov.shouldHoldUp(at(13, 45));
  scheduler.hourly = forecast({ 15: 30 });
  await gov.tick(at(14, 0));
  scheduler.hourly = forecast();
  await gov.tick(at(14, 15));
  scheduler.hourly = forecast({ 15: 30 });
  await gov.tick(at(14, 30));
  assert.deepStrictEqual(calls, []);
});

test('sunny then storm at 3 PM: raises early after 3 consecutive ticks', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast({ 13: 10, 14: 20 }));
  assert.strictEqual(await gov.shouldHoldUp(at(13, 45)), false);
  scheduler.hourly = forecast({ 13: 10, 14: 20 });
  await gov.tick(at(15, 0));   // 3 PM onward is solid overcast
  await gov.tick(at(15, 15));
  assert.deepStrictEqual(calls, []);
  await gov.tick(at(15, 30));
  assert.deepStrictEqual(calls, ['good_evening']);
  assert.strictEqual(gov.day.state, 'RAISED_EARLY');
});

test('storm too close to Good Evening (< 90 min left): no early raise', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast({ 13: 10, 14: 10, 15: 10, 16: 10 }));
  await gov.shouldHoldUp(at(13, 45));
  scheduler.hourly = forecast({ 13: 10, 14: 10, 15: 10, 16: 10 });
  for (const m of [15, 30, 45]) await gov.tick(at(17, m));
  assert.deepStrictEqual(calls, []);
});

test('manual skip-solar, then it turns sunny: still lowers (the human can be wrong too)', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast({ 14: 50 }));
  scheduler.skipSolarToday = true;
  assert.strictEqual(await gov.noteManualHold(at(13, 45)), true);
  assert.strictEqual(gov.day.state, 'HELD_UP');
  assert.strictEqual(gov.getStatus().history[0].action, 'held_up_manual');
  scheduler.hourly = forecast({ 15: 10 });
  await gov.tick(at(14, 0));
  await gov.tick(at(14, 15));
  assert.deepStrictEqual(calls, ['good_afternoon']);
});

test('manual skip-solar on a grey afternoon: stays up', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast());
  scheduler.skipSolarToday = true;
  await gov.noteManualHold(at(13, 45));
  for (const m of [0, 15, 30, 45]) await gov.tick(at(14, m));
  assert.deepStrictEqual(calls, []);
});

test('failed shade command keeps the streak so the next tick retries', async () => {
  const { gov, scheduler, calls } = makeGovernor(forecast());
  await gov.shouldHoldUp(at(13, 45));
  scheduler.hourly = forecast({ 15: 30 });
  scheduler.callShadeCommander = async (s) => { calls.push(s); return { success: false, message: 'down' }; };
  await gov.tick(at(14, 0));
  await gov.tick(at(14, 15));
  assert.strictEqual(gov.day.state, 'HELD_UP');
  scheduler.callShadeCommander = async (s) => { calls.push(s); return { success: true }; };
  await gov.tick(at(14, 30));
  assert.strictEqual(gov.day.state, 'LOWERED');
});
