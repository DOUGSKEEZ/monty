import React from 'react';

/**
 * TransportControls Component - Shared between Pianobar and Jukebox
 *
 * Playback control buttons with source-appropriate UI.
 * Pianobar gets Love button; Jukebox gets clean minimal controls.
 *
 * Props (shared):
 * - source: 'pianobar' | 'jukebox' - Which audio source is playing
 * - isActive: boolean - Whether the player is on
 * - isPlaying: boolean - Whether audio is currently playing
 * - onPlayPause: function - Callback for play/pause button
 * - onNext: function - Callback for next button
 *
 * Props (pianobar-only):
 * - isLoved: boolean - Whether current track is loved
 * - isAnimatingLove: boolean - Whether love animation is playing
 * - onLove: function - Callback for love button
 *
 * Props (jukebox-only):
 * - onStop: function - Callback for stop button (clears track, releases AudioBroker)
 */
function TransportControls({
  source,
  isActive,
  isPlaying,
  onPlayPause,
  onNext,
  // Pianobar-specific
  isLoved = false,
  isAnimatingLove = false,
  onLove,
  // Jukebox-specific
  onStop
}) {
  const isPianobar = source === 'pianobar';
  const isJukebox = source === 'jukebox';

  return (
    <div className={`flex justify-center space-x-6 my-6 ${isActive ? '' : 'opacity-50'}`}>
      {/* Love Button - Pianobar only */}
      {isPianobar && (
        <button
          onClick={onLove}
          className={`p-4 rounded-full transition-all duration-300 ${
            !isActive
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : isLoved
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-red-500 hover:bg-red-600 text-white'
          } ${isAnimatingLove ? 'animate-love' : ''}`}
          disabled={!isActive}
          title={isLoved ? "Loved Song" : "Love This Song"}
        >
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        </button>
      )}

      {/* Play/Pause Button - Shared */}
      <button
        onClick={onPlayPause}
        className={`p-4 rounded-full ${
          isActive
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
        disabled={!isActive}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Next Button - Shared */}
      <button
        onClick={onNext}
        className={`p-4 rounded-full ${
          isActive
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
        disabled={!isActive}
        title="Next Song"
      >
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.342 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L14.805 7.06C13.555 6.346 12 7.25 12 8.688v2.34L5.055 7.06z" />
        </svg>
      </button>

      {/* Stop Button - Jukebox only */}
      {/* Distinct from pianobar's "Turn Off" power button. */}
      {/* Stop clears the current track and releases AudioBroker. */}
      {isJukebox && onStop && (
        <button
          onClick={onStop}
          className={`p-4 rounded-full ${
            isActive
              ? 'bg-gray-500 hover:bg-gray-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          disabled={!isActive}
          title="Stop Playback"
        >
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default TransportControls;
