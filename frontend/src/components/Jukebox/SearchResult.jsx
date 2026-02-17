import React from 'react';

/**
 * SearchResult Component - Individual YouTube search result row
 *
 * Props:
 * - result: { title, youtubeId, duration, parsedArtist, parsedTitle }
 * - onPlay: (youtubeId, metadata) => void - Play this track
 * - onSave: (result) => void - Open save modal for this track
 * - isPlaying: boolean - Whether this track is currently playing
 *
 * Note: NO Queue button - queue is library-only by design
 */
function SearchResult({ result, onPlay, onSave, isPlaying }) {
  const { title, youtubeId, duration, parsedArtist, parsedTitle } = result;

  // Format duration as M:SS
  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = () => {
    // Pass metadata so backend can broadcast proper title/artist
    onPlay(youtubeId, {
      title: parsedTitle || title,
      artist: parsedArtist || 'YouTube',
      duration: duration
    });
  };

  const handleSave = () => {
    onSave(result);
  };

  // Thumbnail URL - mqdefault is 320x180, perfect for search results
  const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;

  return (
    <div className={`flex items-center p-3 rounded-lg transition-colors ${
      isPlaying
        ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
        : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
    }`}>
      {/* Thumbnail */}
      <div className="flex-shrink-0 mr-3">
        <img
          src={thumbnailUrl}
          alt={title}
          className="w-24 h-14 object-cover rounded"
          loading="lazy"
        />
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0 mr-4">
        {/* Parsed title (cleaned up) */}
        <p className="font-medium text-gray-900 dark:text-white truncate">
          {parsedTitle || title}
        </p>
        {/* Parsed artist + duration */}
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {parsedArtist || 'Unknown Artist'} • {formatDuration(duration)}
        </p>
        {/* Original YouTube title (always show for identification) */}
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-1">
          {title}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        {/* Play Button / Now Playing Indicator */}
        {isPlaying ? (
          // Non-interactive "Now Playing" indicator - high volume speaker
          <div
            className="p-2 rounded-full bg-blue-500 text-white"
            title="Now Playing"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </div>
        ) : (
          // Play button when not playing
          <button
            onClick={handlePlay}
            className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            title="Play"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          className="p-2 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors"
          title="Save to Library"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SearchResult;
