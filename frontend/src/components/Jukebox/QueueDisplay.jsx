import React from 'react';
import { useAppContext } from '../../utils/AppContext';
import { jukeboxApi } from '../../utils/api';

/**
 * QueueDisplay Component - Shows upcoming tracks
 *
 * Two slots only (like a real jukebox with quarters lined up):
 * - On Deck: plays when current track ends (🪙 = quarter in slot)
 * - In the Hole: plays after On Deck
 *
 * Each slot shows track name or "Empty" (⚫️ = no quarter).
 * Remove button clears the slot.
 */
function QueueDisplay() {
  const { jukebox, actions } = useAppContext();
  const { queue } = jukebox;

  // Parse display name from track object or filepath
  const getDisplayName = (track) => {
    if (!track) return null;

    // If track has artist/title, use those
    if (track.artist && track.title) {
      return `${track.artist} — ${track.title}`;
    }

    // Otherwise parse from filename
    const filename = track.filename || track.filepath?.split('/').pop() || '';
    // Remove .mp3 extension and parse "Artist - Title" format
    const nameWithoutExt = filename.replace(/\.mp3$/i, '');
    const parts = nameWithoutExt.split(' - ');
    if (parts.length >= 2) {
      return `${parts[0]} — ${parts.slice(1).join(' - ')}`;
    }
    return nameWithoutExt || 'Unknown Track';
  };

  const handleRemove = async (slot) => {
    try {
      await jukeboxApi.removeFromQueue(slot);
      // Update local state - the WebSocket will also send queue-updated
      const newQueue = { ...queue };
      if (slot === 'onDeck') {
        newQueue.onDeck = newQueue.inTheHole;
        newQueue.inTheHole = null;
      } else {
        newQueue.inTheHole = null;
      }
      actions.updateJukeboxQueue(newQueue);
    } catch (error) {
      console.error(`Error removing from ${slot}:`, error);
      actions.showToast('error', `Failed to remove from queue`);
    }
  };

  const renderSlot = (label, slotName, track) => {
    const displayName = getDisplayName(track);
    const isEmpty = !track;

    return (
      <div className="flex items-center justify-between py-2">
        {/* Quarter icon - 🪙 if occupied, ⚫️ if empty */}
        <div className="flex items-center space-x-2">
          <span className="text-lg" title={isEmpty ? 'Empty slot' : 'Quarter in slot'}>
            {isEmpty ? '⚫️' : '🪙'}
          </span>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-24">
            {label}:
          </span>
        </div>

        {/* Track name or empty */}
        <div className="flex-1 mx-2">
          {isEmpty ? (
            <span className="text-sm text-gray-400 dark:text-gray-500 italic">
              Empty
            </span>
          ) : (
            <span className="text-sm text-gray-800 dark:text-gray-200 truncate block">
              {displayName}
            </span>
          )}
        </div>

        {/* Remove button (only for occupied slots) */}
        {!isEmpty && (
          <button
            onClick={() => handleRemove(slotName)}
            className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Remove from queue"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
        <span className="mr-2">📋</span>
        Up Next
      </h3>
      <div className="divide-y divide-gray-200 dark:divide-gray-600">
        {renderSlot('On Deck', 'onDeck', queue.onDeck)}
        {renderSlot('In the Hole', 'inTheHole', queue.inTheHole)}
      </div>
    </div>
  );
}

export default QueueDisplay;
