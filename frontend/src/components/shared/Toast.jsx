import React from 'react';
import { useAppContext } from '../../utils/AppContext';

/**
 * Toast Component - Non-blocking notifications
 *
 * Displays toast notifications from jukebox.toasts array.
 * Auto-dismisses after duration (default 4s).
 * Click to dismiss manually.
 *
 * Types: 'success' (green), 'error' (red), 'info' (blue)
 */
function Toast() {
  const { jukebox, actions } = useAppContext();
  const { toasts } = jukebox;

  if (!toasts || toasts.length === 0) {
    return null;
  }

  const getTypeStyles = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'info':
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => actions.dismissToast(toast.id)}
          className={`
            flex items-center space-x-3 px-4 py-3 rounded-lg shadow-lg cursor-pointer
            transform transition-all duration-300 ease-out
            hover:scale-105 hover:shadow-xl
            ${getTypeStyles(toast.type)}
          `}
          style={{ minWidth: '280px', maxWidth: '400px' }}
        >
          {/* Icon */}
          <div className="flex-shrink-0">
            {getIcon(toast.type)}
          </div>

          {/* Message */}
          <p className="flex-1 text-sm font-medium">
            {toast.message}
          </p>

          {/* Dismiss hint */}
          <div className="flex-shrink-0 opacity-60">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Toast;
