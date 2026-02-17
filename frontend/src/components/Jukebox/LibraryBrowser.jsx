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
    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
          <span className="mr-2">📚</span>
          My Library
          {library.length > 0 && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({library.length} tracks)
            </span>
          )}
        </h3>

        {/* Refresh button */}
        <button
          onClick={loadLibrary}
          disabled={libraryLoading}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          title="Refresh library"
        >
          <svg className={`w-4 h-4 ${libraryLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Sort buttons */}
      <div className="flex space-x-2 mb-3">
        {sortButtons.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              sortMode === mode
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter input */}
      <div className="relative mb-4">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tracks..."
          className="w-full px-4 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Clear filter"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading state */}
      {libraryLoading && library.length === 0 && (
        <div className="text-center py-8">
          <svg className="w-8 h-8 mx-auto animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading library...</p>
        </div>
      )}

      {/* Empty state */}
      {!libraryLoading && library.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            No saved tracks yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Search YouTube above and save some!
          </p>
        </div>
      )}

      {/* No results from filter */}
      {!libraryLoading && library.length > 0 && filteredAndSortedTracks.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            No tracks match "{filter}"
          </p>
        </div>
      )}

      {/* Track list */}
      {filteredAndSortedTracks.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
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
