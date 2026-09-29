import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import '../../vendor/go2rtc/video-stream.js';
import { camerasApi } from '../../utils/api';

// 'live' cameras play while the Live tab is open. 'wake' (battery) cameras connect
// only on tap — connecting is what wakes them; disconnecting lets them sleep.
const WAKE_TIMEOUT_S = 45;   // give up if no frame by then
const AUTO_SLEEP_S = 120;    // battery guard: disconnect a woken camera after this long

function LiveTile({ cam, active }) {
  const screenRef = useRef(null);   // the video box (fullscreen target)
  const hostRef = useRef(null);     // holds the imperative <video-stream> element
  const playerRef = useRef(null);
  const timersRef = useRef([]);
  const isWake = cam.mode === 'wake';

  const [phase, setPhase] = useState(isWake ? 'asleep' : 'idle'); // idle|connecting|live|asleep|waking|failed
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState('');
  const [sleepIn, setSleepIn] = useState(AUTO_SLEEP_S);
  const [battery, setBattery] = useState(null);

  const clearTimers = () => { timersRef.current.forEach(clearInterval); timersRef.current = []; };

  const stop = useCallback(() => {
    clearTimers();
    playerRef.current?.remove();   // removing the element closes the websocket → source idles
    playerRef.current = null;
  }, []);

  const sleep = useCallback((msg = '') => {
    stop();
    setNote(msg);
    setPhase(isWake ? 'asleep' : 'idle');
  }, [isWake, stop]);

  const start = useCallback(() => {
    stop();
    setNote('');
    setElapsed(0);
    setPhase(isWake ? 'waking' : 'connecting');
    const startedAt = performance.now();
    const secs = () => (performance.now() - startedAt) / 1000;

    const el = document.createElement('video-stream');
    el.src = camerasApi.liveUrl(cam.id);
    hostRef.current.append(el);
    playerRef.current = el;

    if (isWake) {
      timersRef.current.push(setInterval(() => {
        setElapsed(secs());
        if (secs() > WAKE_TIMEOUT_S) {
          sleep(`No video after ${WAKE_TIMEOUT_S}s — camera may be unreachable. Tap to retry.`);
          setPhase('failed');
        }
      }, 100));
    }

    // First decoded frame → live. (<video-stream> creates its inner <video> on connect.)
    const video = el.video || el.querySelector('video');
    video?.addEventListener('playing', () => {
      clearTimers();
      const first = secs().toFixed(1);
      const via = el.querySelector('.mode')?.innerText || '';
      setPhase('live');
      if (isWake) {
        let left = AUTO_SLEEP_S;
        setSleepIn(left);
        setNote(`Woke in ${first}s${via ? ` · ${via}` : ''}`);
        timersRef.current.push(setInterval(() => {
          left -= 1;
          if (left <= 0) sleep(`Went back to sleep (auto after ${AUTO_SLEEP_S}s).`);
          else setSleepIn(left);
        }, 1000));
      } else {
        setNote(`First frame in ${first}s${via ? ` · ${via}` : ''}`);
      }
    }, { once: true });
  }, [cam.id, isWake, sleep, stop]);

  // Live cameras follow the tab; battery cameras only ever start on tap.
  useEffect(() => {
    if (!active) sleep();
    else if (!isWake) start();
    return stop;
  }, [active, isWake, start, sleep, stop]);

  // Battery: shown only while a battery camera is AWAKE. The level comes from Wyze's
  // cloud (last report), not the camera — but a woken camera reports in, so fetch
  // fresh on wake and again ~20 s later; hide it again when the camera sleeps.
  useEffect(() => {
    if (!isWake || phase !== 'live') { setBattery(null); return undefined; }
    let cancelled = false;
    const load = () => camerasApi.battery(cam.id, true)
      .then(r => { if (!cancelled) setBattery(r?.data || null); })
      .catch(() => {});
    load();
    const again = setTimeout(load, 20000);
    return () => { cancelled = true; clearTimeout(again); };
  }, [cam.id, isWake, phase]);

  // iPhone Safari can't fullscreen arbitrary elements — only a <video> via
  // webkitEnterFullscreen(). Everything else supports requestFullscreen.
  const goFull = () => {
    const video = playerRef.current?.video;
    if (screenRef.current?.requestFullscreen) screenRef.current.requestFullscreen();
    else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
  };

  const badge = {
    idle: ['bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300', '…'],
    connecting: ['bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300', 'connecting'],
    live: ['bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', 'live'],
    asleep: ['bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', 'asleep'],
    waking: ['bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', 'waking'],
    failed: ['bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', 'failed'],
  }[phase];

  const footerText = phase === 'live' && isWake ? `${note} · sleeping in ${sleepIn}s` : note;

  return (
    <section className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-semibold flex-1 dark:text-white">{cam.name}</span>
        {battery && Number.isFinite(battery.value) && (
          <span
            className="text-xs text-gray-500 dark:text-gray-400"
            title={battery.reportedAt ? `Last reported by Wyze: ${new Date(battery.reportedAt).toLocaleString()}` : ''}
          >
            {battery.value >= 50 ? '🔋' : '🪫'} {battery.value}%
          </span>
        )}
        <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badge[0]}`}>{badge[1]}</span>
      </div>

      <div ref={screenRef} className="cam-screen">
        <div ref={hostRef} className="absolute inset-0" />
        {(phase === 'asleep' || phase === 'failed') && (
          <div className="cam-overlay" onClick={start} role="button" tabIndex={0}>
            <div>
              <div className="text-4xl">😴</div>
              <div className="mt-1 font-semibold">Tap to wake</div>
              <div className="mt-1 text-sm text-gray-400">
                Takes a few seconds · sleeps again after {AUTO_SLEEP_S / 60} min
              </div>
            </div>
          </div>
        )}
        {phase === 'waking' && (
          <div className="cam-overlay" onClick={() => sleep('Wake cancelled.')} role="button" tabIndex={0}>
            <div>
              <div className="text-4xl">⏳</div>
              <div className="mt-1 font-semibold">Waking…</div>
              <div className="mt-1 text-sm text-gray-400">{elapsed.toFixed(1)} s</div>
              <div className="mt-1 text-sm text-gray-400">Tap to cancel</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 min-h-[38px] border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex-1">{footerText}</span>
        {phase === 'waking' && (
          <button type="button" onClick={() => sleep('Wake cancelled.')} className="cam-btn">✕ Cancel</button>
        )}
        {phase === 'live' && (
          <>
            <button type="button" onClick={goFull} className="cam-btn">⛶ Full</button>
            {isWake && (
              <button type="button" onClick={() => sleep('Put to sleep.')} className="cam-btn">😴 Sleep now</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

LiveTile.propTypes = {
  cam: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    mode: PropTypes.oneOf(['live', 'wake']).isRequired,
  }).isRequired,
  active: PropTypes.bool.isRequired,
};

export default LiveTile;
