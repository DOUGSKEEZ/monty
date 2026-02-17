import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';
import LibraryTrack from './LibraryTrack';

/**
 * LibraryBrowser Component - Browse saved tracks in ~/Music/
 *
 * Features:
 * - Three sort modes: Recently Saved (default), A-Z by Artist, A-Z by Song
 * - Filter/search input to narrow the list
 * - Empty state message when library is empty
 * - Loads library on mount
 */
function LibraryBrowser() {
  const { jukebox, activeSource, actions } = useAppContext();
  const { library, libraryLoading, queue } = jukebox;

  const [sortMode, setSortMode] = useState('recent'); // 'recent' | 'artist' | 'title'
  const [filter, setFilter] = useState('');

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLibrary = async () => {
    actions.setJukeboxLibraryLoading(true);
    try {
      const response = await jukeboxApi.getLibrary();
      actions.setJukeboxLibrary(response.tracks || []);
    } catch (error) {
      console.error('Error loading library:', error);
      actions.showToast('error', 'Failed to load library');
    } finally {
      actions.setJukeboxLibraryLoading(false);
    }
  };

  // Filter and sort tracks
  const filteredAndSortedTracks = useMemo(() => {
    let tracks = [...library];

    // Apply filter
    if (filter.trim()) {
      const lowerFilter = filter.toLowerCase();
      tracks = tracks.filter(track =>
        track.title?.toLowerCase().includes(lowerFilter) ||
        track.artist?.toLowerCase().includes(lowerFilter) ||
        track.filename?.toLowerCase().includes(lowerFilter)
      );
    }

    // Apply sort
    switch (sortMode) {
      case 'artist':
        tracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
        break;
      case 'title':
        tracks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'recent':
      default:
        // Already sorted by savedAt (most recent first) from backend
        break;
    }

    return tracks;
  }, [library, filter, sortMode]);

  // Check if a track is currently playing
  const isTrackPlaying = (track) => {
    return activeSource === 'jukebox' &&
           jukebox.track?.filepath === track.filepath &&
           jukebox.isPlaying;
  };

  // Check if a track is in the queue
  const isTrackQueued = (track) => {
    return (queue.onDeck?.filepath === track.filepath) ||
           (queue.inTheHole?.filepath === track.filepath);
  };

  const sortButtons = [
    { mode: 'recent', label: 'Recent' },
    { mode: 'artist', label: 'Artist A-Z' },
    { mode: 'title', label: 'Song A-Z' }
  ];

  return (
    <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
      {/* Header row with title, sort buttons, and refresh */}
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
          📚 Song Library ({library.length})
        </h3>

        {/* Sort buttons */}
        <div className="flex space-x-1 flex-1">
          {sortButtons.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                sortMode === mode
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Refresh button - icon only */}
        <button
          onClick={loadLibrary}
          disabled={libraryLoading}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400
                     hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
          title="Refresh library"
        >
          <svg className={`w-4 h-4 ${libraryLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Filter input - its own row for mobile visibility */}
      <div className="relative mb-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter songs..."
          className="w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:ring-1 focus:ring-blue-500 focus:border-transparent"
        />
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Clear filter"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading state */}
      {libraryLoading && library.length === 0 && (
        <div className="text-center py-4">
          <svg className="w-5 h-5 mx-auto animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      )}

      {/* Empty state */}
      {!libraryLoading && library.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
          No saved tracks — search YouTube and save some!
        </p>
      )}

      {/* No results from filter */}
      {!libraryLoading && library.length > 0 && filteredAndSortedTracks.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
          No tracks match "{filter}"
        </p>
      )}

      {/* Track list - dense, no gaps */}
      {filteredAndSortedTracks.length > 0 && (
        <div className="max-h-80 overflow-y-auto border-t border-gray-200 dark:border-gray-600">
          {filteredAndSortedTracks.map((track) => (
            <LibraryTrack
              key={track.filepath}
              track={track}
              isPlaying={isTrackPlaying(track)}
              isQueued={isTrackQueued(track)}
              onRefresh={loadLibrary}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default LibraryBrowser;
