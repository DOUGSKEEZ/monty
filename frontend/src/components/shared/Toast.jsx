import React from 'react';
import { useAppContext } from '../../utils/AppContext';

/**
 * Toast Component - Non-blocking notifications
 *
 * Displays toast notifications from jukebox.toasts array.
 * Auto-dismisses after duration (default 4s).
 * Click to dismiss manually.
 *
 * Types: 'success' (green), 'error' (red), 'info' (blue) — mobile: just below
 * the navbar; desktop: bottom-right.
 *
 * 'monty-cloud' / 'monty-sun' — Monty's weather interventions: a larger, tinted
 * glass card with the owl. Mobile: centered on screen; desktop: bottom-right.
 */

const MONTY_STYLES = {
  'monty-cloud': {
    card: 'from-sky-100/90 via-white/90 to-indigo-100/90 border-sky-300 text-slate-800 dark:from-sky-900/80 dark:via-gray-800/90 dark:to-indigo-900/80 dark:border-sky-700 dark:text-sky-50',
    label: 'text-sky-600 dark:text-sky-300'
  },
  'monty-sun': {
    card: 'from-amber-100/90 via-white/90 to-orange-100/90 border-amber-300 text-amber-950 dark:from-amber-900/80 dark:via-gray-800/90 dark:to-orange-900/80 dark:border-amber-700 dark:text-amber-50',
    label: 'text-amber-600 dark:text-amber-300'
  }
};

function MontyToast({ toast, onDismiss }) {
  const style = MONTY_STYLES[toast.type];
  return (
    <div
      onClick={onDismiss}
      className={`pointer-events-auto w-full max-w-sm cursor-pointer rounded-2xl border shadow-2xl backdrop-blur-md bg-gradient-to-br px-5 py-4 flex items-center gap-4 animate-monty-toast ${style.card}`}
    >
      <span className="text-4xl flex-shrink-0 animate-monty-owl">🦉</span>
      <div className="flex-1">
        <div className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${style.label}`}>Weather Intervention</div>
        <p className="text-base sm:text-lg font-semibold leading-snug">{toast.message}</p>
      </div>
    </div>
  );
}

function Toast() {
  const { jukebox, actions } = useAppContext();
  const { toasts } = jukebox;

  if (!toasts || toasts.length === 0) {
    return null;
  }

  const montyToasts = toasts.filter(t => MONTY_STYLES[t.type]);
  const otherToasts = toasts.filter(t => !MONTY_STYLES[t.type]);

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
    <>
    {montyToasts.length > 0 && (
      <div className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none sm:inset-x-auto sm:top-auto sm:translate-y-0 sm:bottom-6 sm:right-6 sm:items-end">
        {montyToasts.map(toast => (
          <MontyToast key={toast.id} toast={toast} onDismiss={() => actions.dismissToast(toast.id)} />
        ))}
      </div>
    )}
    {otherToasts.length > 0 && (
    <div className="fixed z-50 flex flex-col space-y-2 left-4 right-4 top-[calc(env(safe-area-inset-top)_+_5.5rem)] sm:left-auto sm:top-auto sm:bottom-4 sm:right-4">
      {otherToasts.map((toast) => (
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
    )}
    </>
  );
}

export default Toast;
