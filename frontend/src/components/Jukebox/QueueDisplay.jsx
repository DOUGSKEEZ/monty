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
      <div className="flex items-center py-0.5">
        {/* Quarter icon - 🪙 if occupied, ⚫️ if empty */}
        <span className="text-sm mr-1" title={isEmpty ? 'Empty slot' : 'Quarter in slot'}>
          {isEmpty ? '⚫️' : '🪙'}
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20">
          {label}:
        </span>

        {/* Track name or empty */}
        <div className="flex-1 mx-1 truncate">
          {isEmpty ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">Empty</span>
          ) : (
            <span className="text-xs text-gray-800 dark:text-gray-200">{displayName}</span>
          )}
        </div>

        {/* Remove button (only for occupied slots) */}
        {!isEmpty && (
          <button
            onClick={() => handleRemove(slotName)}
            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Remove from queue"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
      <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
        Up Next
      </h3>
      {renderSlot('On Deck', 'onDeck', queue.onDeck)}
      {renderSlot('In the Hole', 'inTheHole', queue.inTheHole)}
    </div>
  );
}

export default QueueDisplay;
