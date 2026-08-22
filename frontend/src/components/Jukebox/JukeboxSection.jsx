import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';
import YouTubeSearch from './YouTubeSearch';
import QueueDisplay from './QueueDisplay';
import LibraryBrowser from './LibraryBrowser';
import SaveModal from './SaveModal';

/**
 * JukeboxSection Component
 *
 * Wrapper for jukebox content UI - search, queue, library, save modal.
 * Transport controls are now unified with pianobar in PianobarPage.js
 *
 * This component is always visible below the unified Now Playing area,
 * allowing users to search/browse even when Pianobar is playing.
 */
function JukeboxSection() {
  const { activeSource, actions } = useAppContext();

  const isJukeboxActive = activeSource === 'jukebox';

  // yt-dlp version status for the header line ({ installed, latest, upToDate })
  const [ytDlp, setYtDlp] = useState(null);

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
      } catch (error) {
        // Silent fail - jukebox might not be initialized yet
        console.debug('Jukebox sync skipped (not active):', error.message);
      }
    };

    syncJukeboxState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch yt-dlp version status once on mount (backend caches the GitHub lookup)
  useEffect(() => {
    let cancelled = false;
    jukeboxApi.getYtDlpVersion()
      .then((data) => { if (!cancelled) setYtDlp(data); })
      .catch((error) => console.debug('yt-dlp version check skipped:', error.message));
    return () => { cancelled = true; };
  }, []);

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
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold dark:text-white flex items-center">
            <span className="mr-2">🎵</span>
            Monty's Jukebox
            {isJukeboxActive && (
              <span className="ml-3 text-sm font-normal text-green-600 dark:text-green-400">
                ● Active
              </span>
            )}
          </h2>
        </div>

        {/* yt-dlp version line. Version number is always neutral gray; the status
            carries color. Up to date → blue; out of date → red "(new version)
            available" with a gray admin hint on a second line. ml-7 lines it up
            under "Monty's", not the 🎵 emoji. */}
        {ytDlp && ytDlp.installed && (
          <div className="mt-1 text-xs ml-7">
            {ytDlp.upToDate === false ? (
              <>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    yt-dlp {ytDlp.installed} (current) →
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    {' '}{ytDlp.latest} (new version) available
                  </span>
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  <span className="font-bold">Admin Update Required</span> -- or wait until scheduled update tomorrow morning
                </div>
              </>
            ) : ytDlp.upToDate === true ? (
              <div>
                <span className="text-gray-500 dark:text-gray-400">yt-dlp {ytDlp.installed} · </span>
                <span className="text-blue-600 dark:text-blue-400">up to date</span>
              </div>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">yt-dlp {ytDlp.installed}</span>
            )}
          </div>
        )}
      </div>

      {/* YouTube Search */}
      <YouTubeSearch onSaveRequest={handleSaveRequest} />

      {/* Queue Display - On Deck / In the Hole */}
      <QueueDisplay />

      {/* Library Browser - saved tracks in ~/Music */}
      <LibraryBrowser />

      {/* SaveModal - renders itself when saveModal.isOpen is true */}
      <SaveModal />
    </div>
  );
}

export default JukeboxSection;
