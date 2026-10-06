import React, { useSyncExternalStore } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { camerasApi } from '../../utils/api';

/**
 * CAMERA-HEALTH (temporary) — stall warning UI: a banner on the Cameras page and a
 * red dot on the Cameras nav entry, while a Frigate camera has had no video for
 * 5+ min. Backend: services/CameraHealthMonitor.js (its header has the removal steps).
 *
 * The navbar, footer and page all read one shared poller (one request a minute,
 * only while something is mounted).
 */

const POLL_MS = 60 * 1000;
let snapshot = { stalled: [] };
const listeners = new Set();
let timer = null;

const load = () => camerasApi.health()
  .then((r) => { snapshot = { stalled: r?.data?.stalled || [] }; })
  .catch(() => {})            // keep the last known state if the backend blips
  .finally(() => listeners.forEach(fn => fn()));

function subscribe(fn) {
  listeners.add(fn);
  if (!timer) { load(); timer = setInterval(load, POLL_MS); }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { clearInterval(timer); timer = null; }
  };
}

const useCameraHealth = () => useSyncExternalStore(subscribe, () => snapshot);

const ago = (ms) => {
  const min = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d ${h % 24} h`;
};

const clock = (ms) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
};

export function CameraHealthBanner() {
  const { stalled } = useCameraHealth();
  if (!stalled.length) return null;
  return (
    <div role="alert" className="mb-3 space-y-2">
      {stalled.map(cam => (
        <div key={cam.id} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <span className="font-semibold">⚠️ {cam.name} camera: </span>
          {cam.reason === 'frigate-unreachable' ? 'Frigate not responding' : 'no video'} since {clock(cam.since)} ({ago(cam.since)} ago).
          {' '}Frigate isn&apos;t recording or alerting for this camera.
        </div>
      ))}
    </div>
  );
}

/** Red dot for the Cameras nav entry. The parent link must be `relative`. Hidden for guests. */
export function CameraHealthDot() {
  const { guest } = useAppContext();
  const { stalled } = useCameraHealth();
  if (guest.isGuest || !stalled.length) return null;
  return (
    <span
      className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"
      title={`Camera problem: ${stalled.map(c => c.name).join(', ')}`}
      aria-label="Camera problem"
    />
  );
}
