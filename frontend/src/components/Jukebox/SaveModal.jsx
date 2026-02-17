import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';

/**
 * SaveModal Component - Download YouTube tracks to local library
 *
 * Pre-populated with parsed artist/title from search results.
 * User can edit before saving. Download happens in background.
 *
 * Non-blocking flow:
 * 1. User clicks Save on SearchResult → modal opens with pre-populated fields
 * 2. User edits if needed (common: swap button for backwards titles)
 * 3. User clicks Save → modal closes immediately
 * 4. Toast shows "Saving..." (future: Toast component)
 * 5. WebSocket delivers save-complete or save-failed
 *
 * The track keeps playing the whole time.
 */
function SaveModal() {
  const { jukebox, actions } = useAppContext();
  const { saveModal } = jukebox;

  // Local state for editable fields
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync local state when modal opens with new values
  useEffect(() => {
    if (saveModal.isOpen) {
      setArtist(saveModal.parsedArtist || '');
      setTitle(saveModal.parsedTitle || '');
      setError('');
    }
  }, [saveModal.isOpen, saveModal.parsedArtist, saveModal.parsedTitle]);

  const handleClose = () => {
    if (!saving) {
      actions.closeSaveModal();
    }
  };

  // Swap artist and title - common fix for backwards YouTube titles
  // e.g., "Beat It - Michael Jackson (Lyrics)" → artist="Beat It", title="Michael Jackson"
  const handleSwap = () => {
    const temp = artist;
    setArtist(title);
    setTitle(temp);
  };

  const handleSave = async () => {
    // Validate inputs
    const trimmedArtist = artist.trim();
    const trimmedTitle = title.trim();

    if (!trimmedArtist || !trimmedTitle) {
      setError('Both artist and title are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await jukeboxApi.saveTrack(
        saveModal.youtubeId,
        trimmedArtist,
        trimmedTitle
      );

      if (response.status === 'saving' || response.success) {
        // Close modal immediately - download happens in background
        // WebSocket will deliver save-complete or save-failed event
        actions.closeSaveModal();
        console.log('🎵 [SAVE] Track save initiated:', response.filename);
      } else {
        setError(response.error || 'Failed to save track');
      }
    } catch (err) {
      console.error('Error saving track:', err);
      // Handle specific error messages from backend
      const errorMsg = err.response?.data?.error || err.message || 'Failed to save track';
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !saving) {
      handleSave();
    } else if (e.key === 'Escape' && !saving) {
      handleClose();
    }
  };

  // Don't render if modal is closed
  if (!saveModal.isOpen) {
    return null;
  }

  // Check if both fields have content (for swap button visibility)
  const canSwap = artist.trim() && title.trim();

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      {/* Modal */}
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold dark:text-white flex items-center">
            <span className="mr-2">💾</span>
            Save to Library
          </h3>
          <button
            onClick={handleClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            title="Close"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Fields container with swap button */}
        <div className="relative">
          {/* Artist field */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Artist
            </label>
            <div className="relative">
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist name"
                disabled={saving}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              />
              {artist && !saving && (
                <button
                  onClick={() => setArtist('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Clear"
                  type="button"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Swap button - positioned between fields */}
          {canSwap && !saving && (
            <div className="flex justify-center -my-1 relative z-10">
              <button
                onClick={handleSwap}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                           text-gray-600 dark:text-gray-300 rounded-full border border-gray-300 dark:border-gray-600
                           transition-colors flex items-center space-x-1"
                title="Swap artist and title"
                type="button"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>Swap</span>
              </button>
            </div>
          )}

          {/* Title field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <div className="relative">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track title"
                disabled={saving}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {title && !saving && (
                <button
                  onClick={() => setTitle('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Clear"
                  type="button"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Preview filename */}
        <div className="mb-6 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Will be saved as:</p>
          <p className="text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
            {artist.trim() || 'Artist'} - {title.trim() || 'Title'}.mp3
          </p>
        </div>

        {/* Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !artist.trim() || !title.trim()}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400
                       text-white rounded-lg transition-colors flex items-center justify-center space-x-2
                       disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Save</span>
              </>
            )}
          </button>
        </div>

        {/* Info text */}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          Download will continue in the background
        </p>
      </div>
    </div>
  );
}

export default SaveModal;
