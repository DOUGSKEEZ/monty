import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../utils/AppContext';

// Guest room metadata for display
const GUEST_ROOM_META = {
  guestroom1: { label: 'Guestroom 1', emoji: '🦌' },
  guestroom2: { label: 'Guestroom 2', emoji: '🏋️' }
};

function GuestRegisterPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { actions } = useAppContext();
  const [status, setStatus] = useState('registering'); // 'registering', 'success', 'error', 'clearing'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Special case: "clear" command to exit guest mode
    if (roomId === 'clear') {
      setStatus('clearing');
      actions.clearGuestMode();
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
      return;
    }

    // Validate the room ID
    if (!roomId || !GUEST_ROOM_META[roomId]) {
      setStatus('error');
      setErrorMessage(`Invalid room: "${roomId}". Please scan the QR code in your room.`);
      return;
    }

    // Register the guest
    const success = actions.setGuestMode(roomId);

    if (success) {
      setStatus('success');
      // Redirect to home page after a brief delay to show success message
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 2000);
    } else {
      setStatus('error');
      setErrorMessage('Failed to register guest mode. Please try again.');
    }
  }, [roomId, actions, navigate]);

  const roomMeta = GUEST_ROOM_META[roomId] || { label: 'Unknown', emoji: '❓' };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 to-blue-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {status === 'clearing' && (
          <>
            <div className="text-6xl mb-4">👋</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Goodbye!
            </h1>
            <p className="text-gray-600">
              Guest mode cleared. Returning to normal mode...
            </p>
          </>
        )}

        {status === 'registering' && (
          <>
            <div className="text-6xl mb-4 animate-pulse">{roomMeta.emoji}</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Setting up your room...
            </h1>
            <p className="text-gray-600">
              Please wait while we configure {roomMeta.label}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">{roomMeta.emoji}</div>
            <h1 className="text-2xl font-bold text-green-600 mb-2">
              Welcome to {roomMeta.label}!
            </h1>
            <p className="text-gray-600 mb-4">
              Your guest controls are now active.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-700 text-sm">
                Redirecting to your personalized dashboard...
              </p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">😕</div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">
              Oops! Something went wrong
            </h1>
            <p className="text-gray-600 mb-4">{errorMessage}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default GuestRegisterPage;
