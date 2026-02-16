import React, { useState, useCallback, useEffect } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';
import TransportControls from '../shared/TransportControls';
import YouTubeSearch from './YouTubeSearch';

/**
 * JukeboxSection Component
 *
 * Wrapper for all jukebox UI - keeps PianobarPage.js thin.
 * Contains: TransportControls, YouTubeSearch, QueueDisplay, LibraryBrowser, SaveModal
 *
 * This component is always visible below the Pianobar controls,
 * allowing users to search/browse even when Pianobar is playing.
 */
function JukeboxSection() {
  const { jukebox, activeSource, actions } = useAppContext();
  const [restartCooldown, setRestartCooldown] = useState(false);

  const isJukeboxActive = activeSource === 'jukebox';
  const hasTrack = jukebox.track?.title || jukebox.track?.youtubeId;
  const isFinished = jukebox.isFinished && !jukebox.isPlaying;

  // ============================================
  // SYNC STATE ON MOUNT
  // ============================================
  // Fetches current jukebox status so page refresh shows accurate state
  useEffect(() => {
    const syncJukeboxState = async () => {
      try {
        const status = await jukeboxApi.getStatus();

        // Sync current track if one is loaded
        if (status.currentTrack) {
          actions.updateJukeboxTrack({
            title: status.currentTrack.title || '',
            artist: status.currentTrack.artist || '',
            duration: status.currentTrack.duration || status.duration || 0,
            position: status.position || 0,
            youtubeId: status.currentTrack.youtubeId || null,
            filepath: status.currentTrack.filepath || null
          });
          actions.updateJukeboxStatus({ isPlaying: status.isPlaying });

          // Set active source if jukebox has a track (playing or paused)
          actions.setActiveSource('jukebox');
        }

        // Sync queue state
        if (status.queue) {
          actions.updateJukeboxQueue(status.queue);
        }

        console.log('🎵 [JUKEBOX] State synced on mount:', status);
      } catch (error) {
        // Silent fail - jukebox might not be initialized yet
        console.debug('Jukebox sync skipped (not active):', error.message);
      }
    };

    syncJukeboxState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // TRANSPORT CONTROL HANDLERS
  // ============================================

  const handlePlayPause = async () => {
    const wasPlaying = jukebox.isPlaying;
    actions.updateJukeboxStatus({ isPlaying: !wasPlaying });

    try {
      if (wasPlaying) {
        await jukeboxApi.pause();
      } else {
        // Resume - only works if mpv has content loaded (mid-song pause)
        // After EOF this is a no-op, but button is dimmed anyway
        await jukeboxApi.play();
      }
    } catch (error) {
      console.error('Error toggling jukebox playback:', error);
      actions.updateJukeboxStatus({ isPlaying: wasPlaying });
    }
  };

  const handleNext = async () => {
    try {
      await jukeboxApi.next();
    } catch (error) {
      console.error('Error skipping to next track:', error);
    }
  };

  const handleStop = async () => {
    try {
      await jukeboxApi.stop();
      // Clear local state immediately for responsive UI
      actions.clearJukeboxTrack();
      actions.setActiveSource('none');
    } catch (error) {
      console.error('Error stopping jukebox:', error);
    }
  };

  const handleRestart = useCallback(async () => {
    // Prevent hammering - 3.5 second cooldown
    if (restartCooldown) return;

    const { track } = jukebox;
    if (!track) return;

    // Start cooldown (5s to allow yt-dlp URL resolution)
    setRestartCooldown(true);
    setTimeout(() => setRestartCooldown(false), 5000);

    // Clear finished state immediately for responsive UI
    actions.updateJukeboxStatus({ isFinished: false, isPlaying: true });

    try {
      if (track.youtubeId) {
        // YouTube track - re-request with same metadata
        await jukeboxApi.playYouTube(track.youtubeId, {
          title: track.title,
          artist: track.artist,
          duration: track.duration
        });
      } else if (track.filepath) {
        // Library track - re-request same file
        await jukeboxApi.playLocal(track.filepath);
      }
    } catch (error) {
      console.error('Error restarting track:', error);
      // Revert on error
      actions.updateJukeboxStatus({ isFinished: true, isPlaying: false });
    }
  }, [jukebox, restartCooldown, actions]);

  // ============================================
  // SAVE MODAL HANDLERS
  // ============================================

  const handleSaveRequest = (result) => {
    // Open save modal with pre-populated values from search result
    actions.openSaveModal({
      youtubeId: result.youtubeId,
      parsedArtist: result.parsedArtist || '',
      parsedTitle: result.parsedTitle || result.title || ''
    });
  };

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 p-6 rounded shadow">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold dark:text-white flex items-center">
          <span className="mr-2">🎵</span>
          Jukebox
          {isJukeboxActive && (
            <span className="ml-3 text-sm font-normal text-green-600 dark:text-green-400">
              ● Playing
            </span>
          )}
        </h2>
      </div>

      {/* Transport Controls - Show when jukebox is active or has a track */}
      {(isJukeboxActive || hasTrack) && (
        <div className="mb-6">
          <TransportControls
            source="jukebox"
            isActive={isJukeboxActive || hasTrack}
            isPlaying={jukebox.isPlaying}
            onPlayPause={handlePlayPause}
            onNext={handleNext}
            onStop={handleStop}
            onRestart={handleRestart}
            restartDisabled={restartCooldown}
            playDisabled={isFinished}
          />
        </div>
      )}

      {/* Current Track Info - Simple display for now */}
      {hasTrack && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded">
          <p className="text-sm text-gray-500 dark:text-gray-400">Now Playing</p>
          <p className="font-semibold dark:text-white">{jukebox.track.title || 'Unknown'}</p>
          <p className="text-gray-600 dark:text-gray-300">{jukebox.track.artist || 'Unknown Artist'}</p>
        </div>
      )}

      {/* YouTube Search */}
      <YouTubeSearch onSaveRequest={handleSaveRequest} />

      {/* Placeholder: Queue Display (4.6) */}
      <div className="mb-6 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
        <p className="text-gray-500 dark:text-gray-400 text-center">
          📋 Queue: On Deck / In The Hole (Coming in 4.6)
        </p>
      </div>

      {/* Placeholder: Library Browser (4.7) */}
      <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
        <p className="text-gray-500 dark:text-gray-400 text-center">
          📚 Library Browser (Coming in 4.7)
        </p>
      </div>

      {/* SaveModal will be rendered conditionally when implemented (4.5) */}
    </div>
  );
}

export default JukeboxSection;
