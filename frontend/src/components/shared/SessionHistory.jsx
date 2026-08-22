import React, { useState } from 'react';

/**
 * SessionHistory - collapsible list of songs played earlier in the current
 * pianobar session (most recent first). The list is server-maintained and
 * bounded, and resets whenever pianobar restarts, so it only ever shows
 * "this session" — never a stale backlog.
 *
 * Each row offers a "replay" link that searches the track on YouTube via the
 * Jukebox, since Pandora/pianobar has no repeat feature.
 *
 * Props:
 * - songs: array of { title, artist, album, stationName, coverArt, detailUrl, playedAt }
 * - onReplay: (query: string) => void  — triggers a Jukebox YouTube search
 */
function SessionHistory({ songs = [], onReplay }) {
  const [open, setOpen] = useState(false);

  if (!songs.length) return null;

  // Stored oldest→newest; show most recently played first.
  const ordered = [...songs].reverse();

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center space-x-2 font-medium text-gray-800 dark:text-white">
          <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9zm9-5v5l3 2" />
          </svg>
          <span>Session History</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">({songs.length})</span>
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* List */}
      {open && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
          {ordered.map((s, i) => (
            <li key={`${s.playedAt || 0}-${i}`} className="flex items-center gap-3 px-4 py-2">
              {/* Cover thumbnail */}
              {s.coverArt ? (
                <img
                  src={s.coverArt}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center flex-shrink-0 text-white text-lg">
                  ♪
                </div>
              )}

              {/* Title / artist */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white">{s.title}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{s.artist}</p>
              </div>

              {/* Replay: search this song on YouTube via the Jukebox */}
              <button
                onClick={() => onReplay && onReplay(`${s.artist || ''} ${s.title || ''}`.trim())}
                title="Search this song on YouTube (Jukebox)"
                aria-label={`Search ${s.title} on YouTube`}
                className="flex-shrink-0 p-2 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SessionHistory;
