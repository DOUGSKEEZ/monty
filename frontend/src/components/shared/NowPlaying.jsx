import React from 'react';

/**
 * NowPlaying Component - Shared between Pianobar and Jukebox
 *
 * Displays current track information with source-appropriate UI.
 * Pianobar gets full Pandora chrome; Jukebox gets minimal clean display.
 *
 * Props (shared):
 * - source: 'pianobar' | 'jukebox' - Which audio source is playing
 * - title: string - Track title
 * - artist: string - Artist name
 * - position: number - Current playback position in seconds
 * - duration: number - Total track duration in seconds
 * - isActive: boolean - Whether the player is on
 *
 * Props (pianobar-only):
 * - album: string - Album name
 * - stationName: string - Pandora station name
 * - coverArt: string - Album art URL from Pandora CDN
 * - rating: number - Track rating (>0 means loved)
 * - detailUrl: string - Pandora track detail URL
 * - onOpenModeSelector: function - Callback to open mode selector
 * - onRefresh: function - Callback for force sync button
 *
 * Props (jukebox-only):
 * - sourceType: 'youtube' | 'library' - Where the track came from
 * - youtubeId: string - YouTube video ID (for potential linking)
 * - isPlaying: boolean - Whether audio is currently playing (for seek button state)
 * - onSeekBackward: function - Seek backward (e.g., -10s)
 * - onSeekForward: function - Seek forward (e.g., +10s)
 */
function NowPlaying({
  source,
  title,
  artist,
  position = 0,
  duration = 0,
  isActive,
  // Pianobar-specific
  album,
  stationName,
  coverArt,
  rating = 0,
  detailUrl,
  onOpenModeSelector,
  onRefresh,
  // Jukebox-specific
  sourceType,
  youtubeId,
  filepath,
  isPlaying = false,
  onSeekBackward,
  onSeekForward
}) {
  // Format time in MM:SS format
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isPianobar = source === 'pianobar';
  const isJukebox = source === 'jukebox';

  // Get source badge text
  const getSourceBadge = () => {
    if (isPianobar) return 'Pandora';
    if (isJukebox) {
      return sourceType === 'youtube' ? 'YouTube' : 'Library';
    }
    return 'Unknown';
  };

  // Get source badge color
  const getSourceBadgeColor = () => {
    if (isPianobar) return 'bg-blue-600 text-white';
    if (sourceType === 'youtube') return 'bg-red-600 text-white';
    return 'bg-green-600 text-white'; // Library
  };

  return (
    <div className="mb-6">
      <p className={`text-lg font-semibold mb-4 dark:text-white ${isActive ? '' : 'opacity-50'}`}>Now Playing</p>

      {/* Album Art + Song Details Layout */}
      <div className="flex items-start space-x-4">

        {/* Album Art Column - Pianobar */}
        {isPianobar && (
          <div className="flex flex-col space-y-3">
            {/* Album Art */}
            <div className={`flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}>
              {coverArt ? (
                <img
                  src={coverArt}
                  alt={`${album || 'Album'} cover`}
                  className="w-32 h-32 rounded-lg shadow-lg object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-32 h-32 rounded-lg shadow-lg bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                  <span className="text-white text-4xl">🎵</span>
                </div>
              )}
            </div>

            {/* Station Mode Button - Pianobar only */}
            <button
              onClick={onOpenModeSelector}
              disabled={!isActive}
              className={`w-32 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 shadow-md'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
              }`}
              title={isActive ? 'Customize your station mode' : 'Start pianobar to change modes'}
            >
              <div className="flex flex-col items-center justify-center space-y-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[12px] opacity-75">Mode</span>
                  <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <span className="leading-tight text-[14px] font-semibold">Tune Your Station</span>
              </div>
            </button>
          </div>
        )}

        {/* Thumbnail Column - Jukebox (YouTube) */}
        {isJukebox && youtubeId && (
          <div className="flex flex-col space-y-3">
            <div className={`flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}>
              <img
                src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                alt={title || 'YouTube thumbnail'}
                className="w-32 h-24 rounded-lg shadow-lg object-cover"
                onError={(e) => {
                  // Fallback to placeholder on error
                  e.target.style.display = 'none';
                }}
              />
            </div>
            {/* Seek Buttons - Below artwork */}
            {onSeekBackward && onSeekForward && (
              <div className="flex justify-center space-x-2">
                <button
                  onClick={onSeekBackward}
                  disabled={!isActive || !isPlaying}
                  className={`p-2 rounded-full transition-all ${
                    isActive && isPlaying
                      ? 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  title="Seek -10s"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                  </svg>
                </button>
                <button
                  onClick={onSeekForward}
                  disabled={!isActive || !isPlaying}
                  className={`p-2 rounded-full transition-all ${
                    isActive && isPlaying
                      ? 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  title="Seek +10s"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zm8 0a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Library Art - Jukebox (artwork if exists, otherwise placeholder) */}
        {isJukebox && !youtubeId && (
          <div className="flex flex-col space-y-3">
            <div className={`flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}>
              <div className="w-32 h-24 rounded-lg shadow-lg bg-gradient-to-br from-green-400 to-teal-600 flex items-center justify-center relative overflow-hidden">
                <span className="text-white text-3xl">🎵</span>
                {filepath && (
                  <img
                    key={filepath}
                    src={`http://192.168.10.15:3001/api/jukebox/artwork?filepath=${encodeURIComponent(filepath)}`}
                    alt="Album art"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
              </div>
            </div>
            {/* Seek Buttons - Below artwork */}
            {onSeekBackward && onSeekForward && (
              <div className="flex justify-center space-x-2">
                <button
                  onClick={onSeekBackward}
                  disabled={!isActive || !isPlaying}
                  className={`p-2 rounded-full transition-all ${
                    isActive && isPlaying
                      ? 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  title="Seek -10s"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                  </svg>
                </button>
                <button
                  onClick={onSeekForward}
                  disabled={!isActive || !isPlaying}
                  className={`p-2 rounded-full transition-all ${
                    isActive && isPlaying
                      ? 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  title="Seek +10s"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zm8 0a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Song Details */}
        <div className="flex-grow min-w-0">
          {/* Source Badge */}
          <div className="mb-2">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getSourceBadgeColor()}`}>
              {getSourceBadge()}
            </span>
          </div>

          {/* Title */}
          <h3 className={`text-xl font-bold truncate dark:text-white ${isActive ? '' : 'opacity-50'}`} data-testid="song-title">
            {title || 'No song playing'}
          </h3>

          {/* Artist */}
          {artist && (
            <p className={`text-lg text-gray-700 dark:text-gray-300 truncate ${isActive ? '' : 'opacity-50'}`} data-testid="song-artist">
              {artist}
            </p>
          )}

          {/* Album - Pianobar only */}
          {isPianobar && album && (
            <p className={`text-sm text-gray-600 dark:text-gray-400 truncate ${isActive ? '' : 'opacity-50'}`} data-testid="song-album">
              {album}
            </p>
          )}

          {/* Station - Pianobar only */}
          {isPianobar && stationName && (
            <p className={`text-sm text-blue-600 font-medium truncate flex items-center space-x-1 ${isActive ? '' : 'opacity-50'}`} data-testid="song-station">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="10" width="2" height="4" fill="currentColor"/>
                <rect x="5" y="8" width="2" height="8" fill="currentColor"/>
                <rect x="8" y="6" width="2" height="12" fill="currentColor"/>
                <rect x="11" y="4" width="2" height="16" fill="currentColor"/>
                <rect x="14" y="6" width="2" height="12" fill="currentColor"/>
                <rect x="17" y="8" width="2" height="8" fill="currentColor"/>
                <rect x="20" y="10" width="2" height="4" fill="currentColor"/>
              </svg>
              <span className="truncate">{stationName}</span>
            </p>
          )}

          {/* Loved Indicator - Pianobar only */}
          {isPianobar && rating > 0 && (
            <div className={`flex items-center mt-2 ${isActive ? '' : 'opacity-50'}`}>
              <span className="text-sm text-red-500 flex items-center">
                <span className="mr-1">Loved</span>
                <span className="text-red-500 animate-pulse">❤️</span>
              </span>
            </div>
          )}

          {/* Progress Bar - Shared (when duration > 0) */}
          {duration > 0 && (
            <div className="mt-4 flex items-center space-x-3">
              <div className={`flex-1 ${isActive ? '' : 'opacity-50'}`}>
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <span>{formatTime(position)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min(100, (position / duration) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* Force Sync Button - Pianobar only */}
              {isPianobar && onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-all duration-200 transform hover:scale-105 shadow-md"
                  title="🔄 Force Sync Latest Track & Progress"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                    <path d="M21 3v5h-5"></path>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                    <path d="M3 21v-5h5"></path>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Pandora Link - Pianobar only */}
          {isPianobar && detailUrl && (
            <a
              href={detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm text-blue-400 hover:text-blue-300 mt-3 inline-block transition-colors ${isActive ? '' : 'opacity-50'}`}
            >
              View on Pandora →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default NowPlaying;
