import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../utils/AppContext';

// Guest room metadata for display
const GUEST_ROOM_META = {
  guestroom1: { label: 'Guestroom 1', emoji: '🦌' },
  guestroom2: { label: 'Guestroom 2', emoji: '🏋️' }
};

// Detect if user is on iOS or Android
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isAndroid = () => {
  return /Android/.test(navigator.userAgent);
};

// iOS Share icon (the box with arrow pointing up)
const IOSShareIcon = () => (
  <svg className="inline-block w-5 h-5 align-text-bottom mx-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

function GuestRegisterPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { guest } = useAppContext();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Validate room ID
  const roomMeta = GUEST_ROOM_META[roomId];
  const isValidRoom = roomId && roomMeta;

  // Handle "Continue to Dashboard" button
  const handleContinue = () => {
    setIsRedirecting(true);
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 500);
  };

  // Render platform-specific instructions
  const renderInstructions = () => {
    if (isIOS()) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
          <div className="flex items-center gap-2 mb-2">
            <img src="/images/icons/ios.svg" alt="iOS" className="w-5 h-5" />
            <p className="text-blue-800 font-semibold">Add to your Home Screen</p>
          </div>
          <ol className="text-blue-700 text-sm list-decimal list-inside space-y-1">
            <li>Tap "<span className="font-semibold">⋯</span>" then the <span className="font-semibold">Share</span> button <IOSShareIcon /></li>
            <li>Scroll down and tap <span className="font-semibold">"Add to Home Screen"</span></li>
            <li>Tap <span className="font-semibold">"Add"</span> to confirm</li>
          </ol>
        </div>
      );
    } else if (isAndroid()) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
          <div className="flex items-center gap-2 mb-2">
            <img src="/images/icons/android.svg" alt="Android" className="w-5 h-5" />
            <p className="text-blue-800 font-semibold">Add to your Home Screen</p>
          </div>
          <ol className="text-blue-700 text-sm list-decimal list-inside space-y-1">
            <li>Tap the <span className="font-semibold">⋮</span> menu (top right)</li>
            <li>Tap <span className="font-semibold">"Add to Home screen"</span></li>
            <li>Tap <span className="font-semibold">"Add"</span> to confirm</li>
          </ol>
        </div>
      );
    } else {
      // Generic instructions for desktop/other
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
          <p className="text-blue-800 font-semibold mb-2">
            📱 Add to your Home Screen
          </p>
          <p className="text-blue-700 text-sm">
            For the best experience on mobile, open this page on your phone and add it to your home screen.
          </p>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 to-blue-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">

        {!isValidRoom ? (
          <>
            <div className="text-6xl mb-4">😕</div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">
              Invalid Room
            </h1>
            <p className="text-gray-600 mb-4">
              Room "{roomId}" not found. Please scan the QR code in your room.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Go to Home
            </button>
          </>
        ) : isRedirecting ? (
          <>
            <div className="text-6xl mb-4">{roomMeta.emoji}</div>
            <h1 className="text-2xl font-bold text-green-600 mb-2">
              Let's go!
            </h1>
            <p className="text-gray-600 mb-4">
              Loading your {roomMeta.label} dashboard...
            </p>
            <div className="animate-pulse">
              <div className="h-2 bg-green-200 rounded w-3/4 mx-auto"></div>
            </div>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">{roomMeta.emoji}</div>
            <h1 className="text-2xl font-bold text-green-600 mb-2">
              Welcome to {roomMeta.label}!
            </h1>
            <p className="text-gray-600 mb-6">
              Your personalized room controls are ready.
            </p>

            {/* Guest mode confirmation */}
            {guest.isGuest && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-green-700 text-sm">
                  ✓ Guest mode active for {guest.roomLabel}
                </p>
              </div>
            )}

            {/* Platform-specific Add to Home Screen instructions */}
            {renderInstructions()}

            <button
              onClick={handleContinue}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-lg"
            >
              Continue to Dashboard →
            </button>

            <p className="text-gray-400 text-xs mt-4">
              You can add to home screen now or later from the dashboard
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default GuestRegisterPage;
