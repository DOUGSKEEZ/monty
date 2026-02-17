import React, { useState } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';

/**
 * LibraryTrack Component - Individual track row in library list
 *
 * Props:
 * - track: { filename, artist, title, filepath, savedAt, sizeMB }
 * - isPlaying: boolean - Whether this track is currently playing
 * - isQueued: boolean - Whether this track is in the queue
 * - onRefresh: () => void - Called after delete to refresh library
 *
 * Actions: Play, Queue (library-only), Delete (with confirmation)
 */
function LibraryTrack({ track, isPlaying, isQueued, onRefresh }) {
  const { actions } = useAppContext();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handlePlay = async () => {
    // Optimistic update
    actions.setActiveSource('jukebox');
    actions.updateJukeboxTrack({
      title: track.title,
      artist: track.artist,
      filepath: track.filepath,
      youtubeId: null,
      duration: 0,
      position: 0
    });
    actions.updateJukeboxStatus({ isPlaying: true, isFinished: false });

    try {
      await jukeboxApi.playLocal(track.filepath);
    } catch (error) {
      console.error('Error playing track:', error);
      actions.showToast('error', 'Failed to play track');
      actions.setActiveSource('none');
      actions.updateJukeboxStatus({ isPlaying: false });
    }
  };

  const handleQueue = async () => {
    try {
      const response = await jukeboxApi.addToQueue(track.filepath);
      if (response.queue) {
        actions.updateJukeboxQueue(response.queue);
      }
      actions.showToast('success', `Queued: ${track.artist} — ${track.title}`);
    } catch (error) {
      console.error('Error adding to queue:', error);
      const errorMsg = error.message || 'Queue is full';
      actions.showToast('error', errorMsg);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await jukeboxApi.deleteTrack(track.filename);
      actions.showToast('success', `Deleted: ${track.filename}`);
      setShowDeleteConfirm(false);
      // Refresh library list
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error deleting track:', error);
      actions.showToast('error', 'Failed to delete track');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`flex items-center p-3 rounded-lg transition-colors ${
      isPlaying
        ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
        : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
    }`}>
      {/* Track Info */}
      <div className="flex-1 min-w-0 mr-4">
        <p className="font-medium text-gray-900 dark:text-white truncate flex items-center">
          <span className="mr-2">♫</span>
          {track.title || 'Unknown Title'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {track.artist || 'Unknown Artist'}
          {isQueued && (
            <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded">
              🪙 Queued
            </span>
          )}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        {/* Play Button / Now Playing Indicator */}
        {isPlaying ? (
          <div
            className="p-2 rounded-full bg-blue-500 text-white"
            title="Now Playing"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </div>
        ) : (
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

        {/* Queue Button */}
        <button
          onClick={handleQueue}
          disabled={isQueued}
          className={`p-2 rounded-full transition-colors ${
            isQueued
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
              : 'bg-yellow-500 hover:bg-yellow-600 text-white'
          }`}
          title={isQueued ? 'Already in queue' : 'Add to queue'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* Delete Button */}
        {showDeleteConfirm ? (
          <div className="flex items-center space-x-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
            >
              {deleting ? '...' : 'Yes'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-red-500 hover:text-white text-gray-600 dark:text-gray-300 transition-colors"
            title="Delete"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default LibraryTrack;
