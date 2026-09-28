import React, { useEffect, useState } from 'react';
import { schedulerApi } from '../utils/api';
import { useAppContext } from '../utils/AppContext';

// Monty's forecast-driven afternoon solar shade decisions (backend OvercastGovernor).
// The log line is the entry's `message`; the toast is friendlier, for guests.
const ACTIONS = {
  held_up: { icon: '☁️', kind: 'monty-cloud', toast: 'Monty is holding the solar shades open this afternoon based on the forecast.' },
  held_up_manual: { icon: '✋', kind: 'monty-cloud', toast: 'The solar shades are staying open this afternoon.' },
  lowered_reversal: { icon: '🌤️', kind: 'monty-sun', toast: "It's brighter than Monty anticipated, so the shades are going down until the evening." },
  raised_reversal: { icon: '🌧️', kind: 'monty-cloud', toast: 'It got dark out! Monty raised the afternoon shades to let some light in.' }
};
// 'lowered_as_normal' is still recorded (forecast calibration data) but it's just
// the regular schedule, not an intervention — so it's neither listed nor toasted.
const isIntervention = (e) => Boolean(ACTIONS[e.action]);
const SEEN_KEY = 'monty_interventions_seen';

const fmtWhen = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return today ? time : `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
};

/** Modal listing the last week of Weather Interventions (opened from Settings). */
export function WeatherInterventionsModal({ onClose }) {
  const [history, setHistory] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    schedulerApi.getInterventions(7)
      .then(res => setHistory((res.data?.history || []).filter(isIntervention)))
      .catch(() => setHistory([]));
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold dark:text-white flex items-center">
            <span className="mr-2">🌥️</span> Weather Interventions
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none" title="Close">×</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          At Good Afternoon, Monty keeps the solar shades open if the forecast is overcast through evening, and checks every 15 minutes for one change of plan. Tap an entry for the forecast behind it.
        </p>

        {history === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No decisions in the last week yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((e, i) => (
              <li key={e.timestamp + e.action}>
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full text-left flex items-start gap-2 text-sm dark:text-gray-200"
                >
                  <span className="text-lg leading-5">{ACTIONS[e.action].icon}</span>
                  <span className="flex-1">
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{fmtWhen(e.timestamp)}</span>
                    {e.message}
                  </span>
                </button>
                {expanded === i && e.hours?.length > 0 && (
                  <div className="ml-8 mt-1 text-xs text-gray-600 dark:text-gray-400 grid grid-cols-3 sm:grid-cols-6 gap-1">
                    {e.hours.map(h => (
                      <div key={h.time} className="bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5 text-center">
                        <div className="font-medium">{h.time}</div>
                        <div>{h.clouds}%</div>
                        <div className="truncate">{h.weather}</div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * App-wide watcher (renders nothing): toasts today's Monty interventions that
 * this device hasn't seen yet, so guests know why the shades moved (or didn't).
 */
export function InterventionToaster() {
  const { actions } = useAppContext();

  useEffect(() => {
    const check = async () => {
      try {
        const res = await schedulerApi.getInterventions(1);
        let seen = 0;
        try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { /* storage unavailable */ }
        const todayStr = new Date().toDateString();
        const fresh = (res.data?.history || [])
          .filter(isIntervention)
          .filter(e => new Date(e.timestamp).toDateString() === todayStr && new Date(e.timestamp).getTime() > seen)
          .reverse(); // oldest first
        if (fresh.length === 0) return;
        fresh.forEach(e => actions.showToast(ACTIONS[e.action].kind, ACTIONS[e.action].toast, 12000));
        try { localStorage.setItem(SEEN_KEY, String(new Date(fresh[fresh.length - 1].timestamp).getTime())); } catch { /* ignore */ }
      } catch { /* backend unreachable — try again next poll */ }
    };
    check();
    const id = setInterval(check, 2 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
