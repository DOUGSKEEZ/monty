import React, { useState, useRef } from 'react';
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
 * Actions:
 * - Tap/click: Play track
 * - Queue button: Add to queue
 * - Long-press (600ms): Show delete confirmation
 */
function LibraryTrack({ track, isPlaying, isQueued, onRefresh }) {
  const { actions } = useAppContext();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Long-press detection
  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);

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

  // Long-press handlers (600ms to trigger)
  const startLongPress = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setShowDeleteConfirm(true);
      // Vibrate on mobile if supported (subtle feedback)
      if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
  };

  const endLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleRowClick = () => {
    // Don't play if this was a long-press or delete is showing
    if (isLongPress.current || showDeleteConfirm) {
      isLongPress.current = false;
      return;
    }
    handlePlay();
  };

  return (
    <div
      onClick={handleRowClick}
      onMouseDown={startLongPress}
      onMouseUp={endLongPress}
      onMouseLeave={endLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={endLongPress}
      className={`flex items-center py-1 px-2 transition-colors border-b border-gray-100 dark:border-gray-700 cursor-pointer select-none ${
        isPlaying
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : showDeleteConfirm
            ? 'bg-red-50 dark:bg-red-900/20'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {/* Track Info - single line, clickable to play */}
      <div className="flex-1 min-w-0 mr-2">
        <p className="text-sm text-gray-900 dark:text-white truncate">
          {isPlaying && <span className="text-blue-500 mr-1">▶</span>}
          {!isPlaying && isQueued && <span className="mr-1">🪙</span>}
          <span className="font-medium">{track.artist || 'Unknown'}</span>
          <span className="text-gray-400 dark:text-gray-500 mx-1">—</span>
          <span>{track.title || 'Unknown'}</span>
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {showDeleteConfirm ? (
          /* Delete confirmation - shown after long-press */
          <div className="flex items-center">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded font-medium transition-colors disabled:opacity-50"
            >
              {deleting ? '...' : 'Yes'}
            </button>
            <span className="text-xs text-red-500 mx-3">Delete?</span>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          /* Queue Button - only action visible normally */
          <button
            onClick={handleQueue}
            disabled={isQueued}
            className={`p-1 transition-colors ${
              isQueued
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-yellow-500 hover:text-yellow-600'
            }`}
            title={isQueued ? 'Already in queue' : 'Add to queue'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default LibraryTrack;
