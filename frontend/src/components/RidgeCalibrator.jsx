import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppContext } from '../utils/AppContext';
import { schedulerApi } from '../utils/api';
import OffsetAdjuster from './OffsetAdjuster';

/**
 * RidgeCalibrator - tune and calibrate the solar-shade sun-tracking.
 *
 * Centerpiece is an SVG "skyline" graph: azimuth (compass bearing) across the
 * bottom, altitude up the side. It draws your jagged mountain ridge (from
 * recorded points), the ridge+lead threshold the sun must cross to RAISE, and
 * today's sun path diving toward the ridge. Tap "Sun just vanished" the moment
 * the sun disappears and the backend converts that instant into a ridge point.
 *
 * All solar math stays on the backend (/scheduler/solar-preview); this component
 * only fetches and draws, so there's no duplicated astronomy.
 */

// Graph geometry
const W = 580, H = 300;
const PAD = { l: 46, r: 16, t: 16, b: 40 };
const AZ_MIN = 225, AZ_MAX = 305;   // the sunset-azimuth arc (SW winter -> NW summer)
const ALT_MIN = 0, ALT_MAX = 16;

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

function RidgeCalibrator({ onClose }) {
  const { scheduler, actions } = useAppContext();

  const savedCfg = scheduler.config?.solar_shades || {};
  const savedTrigger = savedCfg.lower?.trigger_azimuth_deg ?? 202;
  const savedLead = savedCfg.raise?.viewing_lead_degrees ?? 6;
  const defaultRidge = savedCfg.raise?.default_ridge_altitude_deg ?? 3;

  const [date, setDate] = useState(todayStr());
  const [triggerDraft, setTriggerDraft] = useState(savedTrigger);
  const [leadDraft, setLeadDraft] = useState(savedLead);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // "Sun went behind the ridge" observation entry (editable date + time)
  const [obsDate, setObsDate] = useState(todayStr());
  const [obsTime, setObsTime] = useState('');
  // Guard the editable/deletable observation list behind an Advanced toggle.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const triggerChanged = triggerDraft !== savedTrigger;
  const leadChanged = leadDraft !== savedLead;

  // Fetch the sun track + computed times for the current drafts (debounced).
  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await schedulerApi.getSolarPreview({
        date,
        trigger_azimuth_deg: triggerDraft,
        viewing_lead_degrees: leadDraft,
      });
      if (res.success) setPreview(res.data);
    } catch (e) {
      console.error('solar-preview failed', e);
    } finally {
      setLoading(false);
    }
  }, [date, triggerDraft, leadDraft]);

  useEffect(() => {
    const t = setTimeout(fetchPreview, 250);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) onClose();
  };

  const saveKnobs = async (patch) => {
    setBusy(true);
    setMessage('');
    try {
      const res = await actions.updateSchedulerConfig('solarShades', patch);
      if (!res.success) setMessage(res.error || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const recordObservation = async () => {
    if (!obsTime) {
      setMessage('Enter the time the sun went behind the ridge.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      // Combine the entered date + time as local wall-clock, send as an instant.
      const iso = new Date(`${obsDate}T${obsTime}:00`).toISOString();
      const res = await actions.calibrateRidge({ state: 'gone', timestamp: iso });
      if (res.success && res.data?.recorded) {
        setMessage('Saved — thanks! Your skyline just got a little more accurate.');
        setObsTime('');
        await fetchPreview();
      } else {
        setMessage(res.error || 'Could not save that observation.');
      }
    } finally {
      setBusy(false);
    }
  };

  const deletePoint = async (azimuth) => {
    setBusy(true);
    try {
      await actions.updateSchedulerConfig('solarShades', { delete_azimuth: azimuth });
      await fetchPreview();
    } finally {
      setBusy(false);
    }
  };

  // ---- derived graph data ----
  const profile = preview?.profile || savedCfg.raise?.horizon_profile || [];
  const track = preview?.track || [];
  const gonePts = useMemo(
    () => profile.filter((p) => p.calibratedFrom !== 'still_up').slice().sort((a, b) => a.azimuth - b.azimuth),
    [profile]
  );
  const stillUpPts = useMemo(() => profile.filter((p) => p.calibratedFrom === 'still_up'), [profile]);

  // Date span of recorded observations, for the read-only summary line.
  const obsDates = profile.map((p) => p.observedAt).filter(Boolean).map((s) => new Date(s)).sort((a, b) => a - b);
  const fmtObsDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const obsRange = obsDates.length >= 2
    ? `${fmtObsDate(obsDates[0])} – ${fmtObsDate(obsDates[obsDates.length - 1])}`
    : obsDates.length === 1 ? fmtObsDate(obsDates[0]) : '';

  const ridgeAt = useCallback((az) => {
    if (gonePts.length === 0) return defaultRidge;
    if (gonePts.length === 1) return gonePts[0].altitude;
    if (az <= gonePts[0].azimuth) return gonePts[0].altitude;
    if (az >= gonePts[gonePts.length - 1].azimuth) return gonePts[gonePts.length - 1].altitude;
    for (let i = 0; i < gonePts.length - 1; i++) {
      const a = gonePts[i], b = gonePts[i + 1];
      if (az >= a.azimuth && az <= b.azimuth) {
        const t = (az - a.azimuth) / (b.azimuth - a.azimuth);
        return a.altitude + t * (b.altitude - a.altitude);
      }
    }
    return defaultRidge;
  }, [gonePts, defaultRidge]);

  const xOf = (az) => PAD.l + ((az - AZ_MIN) / (AZ_MAX - AZ_MIN)) * (W - PAD.l - PAD.r);
  const yOf = (alt) => PAD.t + ((ALT_MAX - alt) / (ALT_MAX - ALT_MIN)) * (H - PAD.t - PAD.b);
  const clampAz = (az) => Math.max(AZ_MIN, Math.min(AZ_MAX, az));

  // Sun path clipped to the ridge window (the late-afternoon descent).
  const sunPath = track
    .filter((p) => p.azimuth >= AZ_MIN && p.azimuth <= AZ_MAX && p.altitude >= ALT_MIN - 1 && p.altitude <= ALT_MAX + 2)
    .map((p) => `${xOf(p.azimuth).toFixed(1)},${yOf(Math.max(ALT_MIN, Math.min(ALT_MAX, p.altitude))).toFixed(1)}`)
    .join(' ');

  // Ridge line (drawn across the whole window, clamped like the model).
  const ridgeLine = [];
  for (let az = AZ_MIN; az <= AZ_MAX; az += 2) ridgeLine.push(`${xOf(az).toFixed(1)},${yOf(ridgeAt(az)).toFixed(1)}`);
  // Ridge + lead threshold (dashed): where the sun crosses this, we RAISE.
  const threshLine = [];
  for (let az = AZ_MIN; az <= AZ_MAX; az += 2) threshLine.push(`${xOf(az).toFixed(1)},${yOf(Math.min(ALT_MAX, ridgeAt(az) + leadDraft)).toFixed(1)}`);

  // Raise marker: nearest track sample to the computed raise time.
  const raiseAt = preview?.raiseTime ? new Date(preview.raiseTime) : null;
  const raiseMin = raiseAt ? raiseAt.getHours() * 60 + raiseAt.getMinutes() : null;
  let raiseMarker = null;
  if (raiseMin !== null && track.length) {
    const nearest = track.reduce((best, p) => (Math.abs(p.minute - raiseMin) < Math.abs(best.minute - raiseMin) ? p : best), track[0]);
    if (nearest.azimuth >= AZ_MIN && nearest.azimuth <= AZ_MAX) {
      raiseMarker = { x: xOf(clampAz(nearest.azimuth)), y: yOf(Math.max(ALT_MIN, Math.min(ALT_MAX, nearest.altitude))) };
    }
  }

  const axisColor = 'currentColor';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !busy && onClose()}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold dark:text-white flex items-center">
            <span className="mr-2">📈</span> Ridge Calibrator
          </h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500 dark:text-gray-400">
              Day:{' '}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ml-1 border rounded px-2 py-1 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600"
              />
            </label>
            <button onClick={() => !busy && onClose()} disabled={busy} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50" title="Close">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Graph */}
        <div className="text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg p-2 mb-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Skyline ridge graph">
            {/* axes */}
            <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={axisColor} strokeOpacity="0.4" />
            <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke={axisColor} strokeOpacity="0.4" />
            {/* Y ticks */}
            {[0, 4, 8, 12, 16].map((a) => (
              <g key={a}>
                <line x1={PAD.l - 3} y1={yOf(a)} x2={PAD.l} y2={yOf(a)} stroke={axisColor} strokeOpacity="0.4" />
                <text x={PAD.l - 6} y={yOf(a) + 3} textAnchor="end" fontSize="9" fill={axisColor} fillOpacity="0.6">{a}°</text>
              </g>
            ))}
            {/* X ticks */}
            {[225, 240, 255, 270, 285, 300].map((az) => (
              <g key={az}>
                <line x1={xOf(az)} y1={H - PAD.b} x2={xOf(az)} y2={H - PAD.b + 3} stroke={axisColor} strokeOpacity="0.4" />
                <text x={xOf(az)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill={axisColor} fillOpacity="0.6">{az}°</text>
              </g>
            ))}
            <text x={(W) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill={axisColor} fillOpacity="0.6">azimuth (SW ← → NW)</text>

            {/* ridge fill + line */}
            <polyline
              points={`${xOf(AZ_MIN)},${H - PAD.b} ${ridgeLine.join(' ')} ${xOf(AZ_MAX)},${H - PAD.b}`}
              fill="#78716c" fillOpacity="0.25" stroke="none"
            />
            <polyline points={ridgeLine.join(' ')} fill="none" stroke="#78716c" strokeWidth="2" />
            {/* ridge + lead threshold (dashed) */}
            <polyline points={threshLine.join(' ')} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />

            {/* sun path */}
            {sunPath && <polyline points={sunPath} fill="none" stroke="#eab308" strokeWidth="2" />}

            {/* raise marker */}
            {raiseMarker && (
              <g>
                <circle cx={raiseMarker.x} cy={raiseMarker.y} r="5" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
                <text x={raiseMarker.x + 8} y={raiseMarker.y - 6} fontSize="10" fill="#3b82f6">raise {preview?.raiseLabel || ''}</text>
              </g>
            )}

            {/* gone points */}
            {gonePts.map((p, i) => (
              <circle key={`g${i}`} cx={xOf(clampAz(p.azimuth))} cy={yOf(Math.max(ALT_MIN, Math.min(ALT_MAX, p.altitude)))} r="4" fill="#78716c" stroke="white" strokeWidth="1" />
            ))}
            {/* still_up markers (upper bounds) */}
            {stillUpPts.map((p, i) => (
              <text key={`s${i}`} x={xOf(clampAz(p.azimuth))} y={yOf(Math.max(ALT_MIN, Math.min(ALT_MAX, p.altitude))) + 4} textAnchor="middle" fontSize="12" fill="#9ca3af">▽</text>
            ))}
          </svg>
          {/* legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 px-2 pb-1">
            <span><span style={{ color: '#78716c' }}>■</span> ridge (measured)</span>
            <span><span style={{ color: '#f59e0b' }}>┈</span> raise threshold (ridge + lead)</span>
            <span><span style={{ color: '#eab308' }}>—</span> sun path</span>
            <span><span style={{ color: '#3b82f6' }}>●</span> raise point</span>
            <span>▽ still-above (upper bound)</span>
          </div>
        </div>

        {/* Computed times */}
        <div className="flex justify-center gap-6 text-sm mb-4">
          <span className="text-gray-600 dark:text-gray-300">Lower: <strong className="text-blue-600 dark:text-blue-400">{preview?.lowerLabel || '—'}</strong></span>
          <span className="text-gray-600 dark:text-gray-300">Raise: <strong className="text-blue-600 dark:text-blue-400">{preview?.raiseLabel || '—'}</strong></span>
          {loading && <span className="text-gray-400">updating…</span>}
        </div>

        {/* Sliders */}
        <div className="flex flex-wrap justify-center gap-6 mb-4">
          <OffsetAdjuster
            title="Afternoon Solar shades trigger"
            resultTime={preview?.lowerLabel}
            value={triggerDraft}
            min={150}
            max={260}
            step={1}
            leftLabel="earlier (west)"
            rightLabel="later (square-on)"
            formatValue={(v) => `sun at ${v}° bearing`}
            onChange={setTriggerDraft}
            onUpdate={() => saveKnobs({ trigger_azimuth_deg: triggerDraft })}
            changed={triggerChanged}
            saving={busy}
            align="center"
          />
          <OffsetAdjuster
            title="Evening Sunset Viewing trigger"
            resultTime={preview?.raiseLabel}
            value={leadDraft}
            min={0}
            max={20}
            step={1}
            leftLabel="just before it sets"
            rightLabel="longer golden hour"
            formatValue={(v) => `${v}° above the ridge`}
            onChange={setLeadDraft}
            onUpdate={() => saveKnobs({ viewing_lead_degrees: leadDraft })}
            changed={leadChanged}
            saving={busy}
            align="center"
          />
        </div>

        {/* Calibration — dated "sun went behind the ridge" observations */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-sm text-gray-700 dark:text-gray-200 mb-1 font-medium">
            When did the sun go behind the ridge?
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Enter the exact moment the sun's edge dropped behind the mountains — today, or any past day
            you jotted down or can read off a sunset photo. Each entry sharpens the Evening raise time.
          </p>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="text-sm text-gray-600 dark:text-gray-300">
              Date
              <input
                type="date"
                value={obsDate}
                onChange={(e) => setObsDate(e.target.value)}
                className="block mt-1 border rounded px-2 py-1 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600"
              />
            </label>
            <label className="text-sm text-gray-600 dark:text-gray-300">
              Time it went behind the ridge
              <input
                type="time"
                value={obsTime}
                onChange={(e) => setObsTime(e.target.value)}
                className="block mt-1 border rounded px-2 py-1 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600"
              />
            </label>
            <button
              onClick={recordObservation}
              disabled={busy || !obsTime}
              className="bg-stone-600 hover:bg-stone-700 text-white font-semibold py-2 px-4 rounded disabled:opacity-50"
            >
              🌄 Record
            </button>
          </div>
          {message && <p className="text-xs text-green-600 dark:text-green-400 mb-2">{message}</p>}

          {/* Read-only summary (always visible) */}
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {profile.length > 0 ? (
              <>🗻 Ridge mapped from <strong>{profile.length}</strong> sunset observation{profile.length === 1 ? '' : 's'}{obsRange ? ` (${obsRange})` : ''}.</>
            ) : (
              <>No observations yet — add your first above.</>
            )}
          </div>

          {/* Advanced: edit/remove individual points — gated so guests don't delete by accident */}
          {profile.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
              >
                {showAdvanced ? '▾ Hide advanced' : '▸ Advanced: manage observations'}
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 mb-1">
                    ⚠️ Removing a point only drops it from the active calibration. Your full history stays
                    backed up in <span className="font-mono">data/ridge_observations.csv</span> (never deleted from
                    here — safe to edit in a spreadsheet).
                  </p>
                  <ul className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
                    {profile.slice().sort((a, b) => new Date(a.observedAt || 0) - new Date(b.observedAt || 0)).map((p, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-200">
                          📅 {p.observedAt
                            ? new Date(p.observedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                            : `ridge point at ${p.azimuth}°`}
                        </span>
                        <button
                          onClick={() => deletePoint(p.azimuth)}
                          disabled={busy}
                          title="Remove this observation"
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          🗑 Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RidgeCalibrator;
