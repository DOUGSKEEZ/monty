import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { camerasApi } from '../../utils/api';

const ICONS = {
  car: '🚗', person: '🚶', dog: '🐕', cat: '🐈', bird: '🐦', bear: '🐻', horse: '🐎',
  bicycle: '🚲', motorcycle: '🏍️', bus: '🚌',
};
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

function ago(ts) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const clock = ts => new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Frigate hard-caps the AI shortSummary at 140 chars (its response schema), so the
// model can be cut off mid-sentence. If it doesn't end like a sentence, trim back to
// the last complete sentence/clause and add "…". The full `scene` shows when opened.
function tidySummary(t) {
  t = (t || '').trim();
  if (!t || /[.!?]$/.test(t)) return t;
  const sentence = t.search(/[.!?](?!.*[.!?])/);
  if (sentence > 40) return t.slice(0, sentence + 1);
  const clause = t.lastIndexOf(', ');
  return (clause > 40 ? t.slice(0, clause) : t.replace(/\s+\S*$/, '')) + '…';
}

function describe(ev) {
  const main = ev.objects[0] || 'motion';
  const where = ev.zones.length ? ` on the ${ev.zones[0]}` : '';
  return {
    icon: ICONS[main] || '👁️',
    title: ev.title || `${cap(ev.objects.join(' & ') || 'Activity')}${where}`,
    summary: tidySummary(ev.shortSummary),
  };
}

/**
 * Event playback, the way Frigate's own UI does it: hls.js on Frigate's HLS VOD
 * (master.m3u8) everywhere. Frigate's clip.mp4 is built on the fly (no length, no
 * byte ranges) so iPhones refuse it; Safari's native HLS is only a fallback.
 */
function EventVideo({ ev }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 10 });
      hls.loadSource(camerasApi.vodUrl(ev));
      hls.attachMedia(video);
      // iOS ManagedMediaSource pauses hls.js fragment loading while the video is
      // paused and never resumes it by itself (Frigate works around the same thing).
      const resume = () => hls.resumeBuffering?.();
      video.addEventListener('play', resume);
      video.addEventListener('seeking', resume);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { resume(); video.play().catch(() => {}); });
      // Standard hls.js recovery: media error → recover → swap audio codec → give up.
      let recoveries = 0;
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal || recoveries >= 3) return;
        recoveries += 1;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (recoveries === 2) hls.swapAudioCodec();
          hls.recoverMediaError();
        } else if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        }
      });
      return () => {
        video.removeEventListener('play', resume);
        video.removeEventListener('seeking', resume);
        hls.destroy();
      };
    }
    video.src = video.canPlayType('application/vnd.apple.mpegurl') ? camerasApi.vodUrl(ev) : camerasApi.clipUrl(ev);
    return () => { video.removeAttribute('src'); video.load(); };
    // Reload only when the event's identity/time window changes — refreshes hand us
    // new object copies of the same event, which must not restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id, ev.camera, ev.start_time, ev.end_time]);
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <video ref={ref} controls autoPlay muted playsInline preload="auto" />;
}
EventVideo.propTypes = { ev: PropTypes.object.isRequired };

function EventRow({ ev, camName, frigateUiUrl, open, onToggle }) {
  const liRef = useRef(null);
  const d = describe(ev);

  // Opened: if the whole event fits, align its bottom with the screen bottom (the
  // road is in the bottom of the frame); otherwise show it from its top.
  useEffect(() => {
    if (!open || !liRef.current) return;
    const tabs = document.querySelector('.cam-tabs')?.getBoundingClientRect().height || 0;
    const fits = liRef.current.getBoundingClientRect().height <= window.innerHeight - tabs - 16;
    liRef.current.scrollIntoView({ behavior: 'smooth', block: fits ? 'end' : 'start' });
  }, [open]);

  const when = new Date(ev.start_time * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <li ref={liRef} className={`cam-ev ${ev.severity}`} title={ev.severity === 'alert' ? 'Alert' : 'Detection'}>
      <div className="cam-ev-row" onClick={onToggle} role="button" tabIndex={0}>
        <img className="cam-ev-thumb" loading="lazy" alt="" src={camerasApi.thumbUrl(ev)} />
        <div className="cam-ev-head">
          <div className="cam-ev-title dark:text-white"><span className="mr-1.5">{d.icon}</span>{d.title}</div>
          <div className="cam-ev-meta">{camName(ev.camera)} · {ago(ev.start_time)} · {clock(ev.start_time)}</div>
        </div>
        {d.summary && <div className="cam-ev-sum">{d.summary}</div>}
      </div>
      {open && (
        <div className="cam-ev-body">
          <EventVideo ev={ev} />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {ev.severity === 'alert' ? 'Alert' : 'Detection'} · {camName(ev.camera)} · {when}
          </p>
          {ev.scene && <p className="mt-2 text-sm leading-relaxed dark:text-gray-200">{ev.scene}</p>}
          <div className="flex gap-2 mt-2">
            {frigateUiUrl && (
              <a className="cam-btn" href={`${frigateUiUrl}/review?id=${encodeURIComponent(ev.id)}`} target="_blank" rel="noreferrer">
                ↗ Open in Frigate
              </a>
            )}
            <button type="button" className="cam-btn" onClick={onToggle}>✕ Close</button>
          </div>
        </div>
      )}
    </li>
  );
}
EventRow.propTypes = {
  ev: PropTypes.object.isRequired,
  camName: PropTypes.func.isRequired,
  frigateUiUrl: PropTypes.string,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

/**
 * Wyze-style feed of Frigate events. Reads Frigate live (no separate store), so it
 * shows exactly what Frigate retains; pages 30 at a time ("Load older"). Refreshes
 * every 30 s while visible, merging so loaded older pages stay put.
 */
function EventFeed({ active, cameras, frigateUiUrl }) {
  const [events, setEvents] = useState([]);
  const [pageSize, setPageSize] = useState(30);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [status, setStatus] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);

  const camName = useCallback(id => cameras.find(c => c.id === id)?.name || id, [cameras]);
  const severity = alertsOnly ? 'alert' : undefined;

  const merge = (prev, items) => {
    const byId = new Map(prev.map(e => [e.id, e]));
    items.forEach(e => byId.set(e.id, e));      // newer copies win (e.g. summary just arrived)
    return [...byId.values()].sort((a, b) => b.start_time - a.start_time);
  };

  const refresh = useCallback(async (reset = false) => {
    try {
      const r = await camerasApi.events({ severity });
      const items = r?.data || [];
      if (r?.pageSize) setPageSize(r.pageSize);
      setEvents(prev => merge(reset ? [] : prev, items));
      if (reset) setReachedEnd(items.length < (r?.pageSize || 30));
      setStatus(`updated ${clock(Date.now() / 1000)}`);
    } catch (e) {
      setStatus(`⚠ couldn't load events (${e.message})`);
    }
  }, [severity]);

  const loadOlder = async () => {
    if (!events.length || reachedEnd) return;
    setLoadingOlder(true);
    try {
      const r = await camerasApi.events({ severity, before: events[events.length - 1].start_time });
      const items = r?.data || [];
      if (items.length < pageSize) setReachedEnd(true);
      setEvents(prev => merge(prev, items));
    } catch (e) {
      setStatus(`⚠ couldn't load older events (${e.message})`);
    }
    setLoadingOlder(false);
  };

  // (Re)load when the tab opens or the filter changes
  useEffect(() => {
    if (active) refresh(true);
  }, [active, refresh]);

  // Periodic refresh — paused while hidden or while a clip is playing
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { if (!document.hidden && !openId) refresh(); }, 30000);
    return () => clearInterval(t);
  }, [active, openId, refresh]);

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <label className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
          <input type="checkbox" checked={alertsOnly} onChange={e => setAlertsOnly(e.target.checked)} /> Alerts only
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400">{status}</span>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No events yet.</p>
      ) : (
        <ul className="grid gap-2.5">
          {events.map(ev => (
            <EventRow
              key={ev.id}
              ev={ev}
              camName={camName}
              frigateUiUrl={frigateUiUrl}
              open={openId === ev.id}
              onToggle={() => setOpenId(id => (id === ev.id ? null : ev.id))}
            />
          ))}
        </ul>
      )}

      {events.length > 0 && (
        <button type="button" className="cam-btn w-full mt-3 py-3 text-sm" onClick={loadOlder} disabled={reachedEnd || loadingOlder}>
          {reachedEnd
            ? 'That’s everything — Frigate keeps alerts 14 days, detections 7'
            : loadingOlder ? 'Loading…' : `Load older (showing ${events.length})`}
        </button>
      )}
    </div>
  );
}

EventFeed.propTypes = {
  active: PropTypes.bool.isRequired,
  cameras: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })).isRequired,
  frigateUiUrl: PropTypes.string,
};

export default EventFeed;
