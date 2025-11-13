import React, { useState, useEffect } from 'react';

/**
 * ModeSelector Modal Component
 *
 * Displays a modal for selecting Pandora station modes
 * - Always fetches fresh modes when opened
 * - Shows loading state during fetch
 * - Radio-button style selection with descriptions
 * - Mobile responsive (full-screen on mobile)
 * - Broadcasts selection and closes on success
 */
function ModeSelector({ isOpen, onClose, stationName }) {
  const [modes, setModes] = useState([]);
  const [activeMode, setActiveMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch modes when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchModes();
    }
  }, [isOpen]);

  // Fetch fresh modes from backend
  const fetchModes = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/pianobar/modes');
      const data = await response.json();

      if (data.success) {
        setModes(data.modes || []);
        setActiveMode(data.activeMode);
        // Note: stationName comes from parent prop, not backend
      } else {
        setError(data.message || 'Failed to fetch modes');
      }
    } catch (err) {
      console.error('Error fetching modes:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Select a mode
  const selectMode = async (modeId) => {
    setSelecting(true);
    setError(null);

    try {
      const response = await fetch('/api/pianobar/mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modeId })
      });

      const data = await response.json();

      if (data.success) {
        // Brief delay to show success, then close
        setTimeout(() => {
          setSelecting(false);
          onClose();
        }, 800);
      } else {
        setError(data.message || 'Failed to select mode');
        setSelecting(false);
      }
    } catch (err) {
      console.error('Error selecting mode:', err);
      setError('Failed to connect to server');
      setSelecting(false);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !selecting) {
      onClose();
    }
  };

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen && !selecting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, selecting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">
              Station Modes
              {stationName && (
                <span className="ml-2 text-blue-600 font-bold">- {stationName}</span>
              )}
            </h2>
            <button
              onClick={onClose}
              disabled={selecting}
              className={`text-gray-400 hover:text-gray-600 transition-colors ${
                selecting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">Fetching modes...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700">{error}</p>
              <button
                onClick={fetchModes}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Modes List */}
          {!loading && !error && modes.length > 0 && (
            <div className="space-y-1">
              {modes.map((mode) => {
                const isActive = activeMode && activeMode.id === mode.id;
                const isCurrentlyActive = mode.active;

                return (
                  <button
                    key={mode.id}
                    onClick={() => !selecting && selectMode(mode.id)}
                    disabled={selecting}
                    className={`w-full text-left p-2 rounded-lg border-2 transition-all ${
                      isActive || isCurrentlyActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                    } ${selecting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start space-x-2">
                      {/* Radio Button */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isActive || isCurrentlyActive
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}
                        >
                          {(isActive || isCurrentlyActive) && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                          )}
                        </div>
                      </div>

                      {/* Mode Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className={`text-sm font-semibold ${
                            isActive || isCurrentlyActive ? 'text-blue-700' : 'text-gray-800'
                          }`}>
                            {mode.name}
                          </h3>
                          {isCurrentlyActive && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 leading-snug">
                          {mode.description}
                        </p>
                      </div>

                      {/* Selection Checkmark */}
                      {selecting && (isActive || isCurrentlyActive) && (
                        <div className="flex-shrink-0">
                          <svg className="w-5 h-5 text-green-500 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* No Modes */}
          {!loading && !error && modes.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No modes available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 md:py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="flex items-center justify-center">
            <button
              onClick={onClose}
              disabled={selecting}
              className={`px-6 py-2 text-gray-700 hover:text-gray-900 font-medium ${
                selecting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModeSelector;
