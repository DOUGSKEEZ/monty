import React, { useState } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';
import SearchResult from './SearchResult';

/**
 * YouTubeSearch Component - Search YouTube and display results
 *
 * Features:
 * - Search input with Enter key support
 * - Loading spinner during search
 * - Results list (5 items from yt-dlp)
 * - Each result has Play and Save buttons
 *
 * No pagination in v1 - backend returns 5 results via ytsearch5:
 */
function YouTubeSearch({ onSaveRequest }) {
  const { jukebox, activeSource, actions } = useAppContext();
  const [query, setQuery] = useState('');

  const { searchResults, searchLoading } = jukebox;

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    actions.setJukeboxSearchLoading(true);
    actions.setJukeboxSearchResults([]); // Clear previous results

    try {
      const response = await jukeboxApi.search(trimmedQuery);
      if (response.results) {
        actions.setJukeboxSearchResults(response.results);
      }
    } catch (error) {
      console.error('Search failed:', error);
      // TODO: Show error toast
    } finally {
      actions.setJukeboxSearchLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePlay = async (youtubeId, metadata) => {
    // Optimistic update - set jukebox as active source immediately
    actions.setActiveSource('jukebox');
    actions.updateJukeboxTrack({
      title: metadata.title,
      artist: metadata.artist,
      duration: metadata.duration,
      youtubeId: youtubeId,
      filepath: null
    });
    actions.updateJukeboxStatus({ isPlaying: true, isFinished: false });

    try {
      await jukeboxApi.playYouTube(youtubeId, metadata);
    } catch (error) {
      console.error('Error playing YouTube track:', error);
      // Revert on error
      actions.setActiveSource('none');
      actions.updateJukeboxStatus({ isPlaying: false });
    }
  };

  const handleSave = (result) => {
    // Open the save modal with pre-populated values
    onSaveRequest(result);
  };

  const handleClearResults = () => {
    actions.setJukeboxSearchResults([]);
    setQuery('');
  };

  // Check if a result is currently playing
  const isResultPlaying = (result) => {
    return activeSource === 'jukebox' &&
           jukebox.track?.youtubeId === result.youtubeId &&
           jukebox.isPlaying;
  };

  return (
    <div className="mb-6">
      {/* Search Input */}
      <div className="flex space-x-2 mb-4">
        <div className="relative flex-1">
          {/* YouTube icon */}
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search YouTube..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={searchLoading}
          />
          {query && !searchLoading && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Clear search"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={searchLoading || !query.trim()}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400
                     text-white rounded-lg transition-colors flex items-center space-x-2"
        >
          {searchLoading ? (
            <>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Searching...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search</span>
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2">
          {/* Clear bar - above results */}
          <button
            onClick={handleClearResults}
            className="w-full flex items-center justify-center py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="mx-3 text-sm">Clear {searchResults.length} Results</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Result list */}
          {searchResults.map((result) => (
            <SearchResult
              key={result.youtubeId}
              result={result}
              onPlay={handlePlay}
              onSave={handleSave}
              isPlaying={isResultPlaying(result)}
            />
          ))}

          {/* Clear bar - below results */}
          <button
            onClick={handleClearResults}
            className="w-full flex items-center justify-center py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="mx-3 text-sm">Clear Results</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Empty state - only show when not loading and no results */}
      {!searchLoading && searchResults.length === 0 && query && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
          Press Enter or click Search to find tracks
        </p>
      )}
    </div>
  );
}

export default YouTubeSearch;
