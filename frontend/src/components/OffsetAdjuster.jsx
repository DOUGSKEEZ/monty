import React from 'react';

/**
 * OffsetAdjuster - touch-friendly control for scene timing offsets.
 *
 * Combines a coarse horizontal slider with fine -/+ stepper buttons so a value
 * can be set quickly on a phone (drag) and precisely (tap) without ever typing a
 * number or a minus sign. Shows the resulting clock time live so the abstract
 * "minutes before/after sunset" offset is concrete.
 *
 * Follows the existing draft + Update pattern: onChange updates a local draft on
 * every tick, and the value is only committed to the backend when Update is
 * pressed (avoids hammering PUT /scenes on every slider movement).
 */
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function OffsetAdjuster({
  title,
  referenceLabel,   // e.g. "Sunset" / "Civil twilight"
  referenceTime,    // formatted string or null
  resultTime,       // formatted resulting clock time or null
  value,
  min,
  max,
  step = 1,
  leftLabel,        // caption under the left end of the slider
  rightLabel,       // caption under the right end of the slider
  formatValue,      // (value) => descriptive string, e.g. "7 min before twilight"
  invert = false,   // reverse the slider so max sits on the left, min on the right
  centerLine = false, // draw a vertical marker at the track midpoint (e.g. value 0)
  align = 'left',   // horizontal placement within the parent column: 'left' | 'center' | 'right'
  onChange,
  onUpdate,
  changed,
  saving,
}) {
  const safeValue = Number.isFinite(value) ? value : min;
  const atMin = safeValue <= min;
  const atMax = safeValue >= max;

  const nudge = (delta) => onChange(clamp(safeValue + delta, min, max));

  const stepBtn =
    'flex items-center justify-center w-11 h-11 rounded-lg text-2xl font-bold ' +
    'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 ' +
    'text-gray-700 dark:text-gray-100 select-none disabled:opacity-40 ' +
    'disabled:cursor-not-allowed touch-manipulation';

  // Place the whole control (capped at 20rem) within its parent column.
  const alignClass = align === 'center' ? 'mx-auto' : align === 'right' ? 'ml-auto' : '';

  return (
    <div className={`max-w-[20rem] ${alignClass}`}>
      {referenceTime && (
        <div className="text-xs text-gray-400 mb-1 text-center">
          {referenceLabel}: {referenceTime}
        </div>
      )}

      <div className="mb-2 text-center">
        <div className="text-gray-700 dark:text-gray-200 text-sm font-bold">
          {title}
        </div>
        {resultTime && (
          <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            at {resultTime}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-step)}
          disabled={atMin}
          aria-label={`Decrease ${title} by ${step} minutes`}
          className={stepBtn}
        >
          −
        </button>

        <div className="relative flex-1">
          {centerLine && (
            <div
              className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gray-400 dark:bg-gray-500 pointer-events-none"
              aria-hidden="true"
            />
          )}
          <input
            type="range"
            dir={invert ? 'rtl' : 'ltr'}
            min={min}
            max={max}
            step={step}
            value={safeValue}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            aria-label={`${title} offset`}
            className="w-full accent-blue-500 cursor-pointer touch-manipulation"
          />
        </div>

        <button
          type="button"
          onClick={() => nudge(step)}
          disabled={atMax}
          aria-label={`Increase ${title} by ${step} minutes`}
          className={stepBtn}
        >
          +
        </button>
      </div>

      <div className="flex justify-between text-xs text-gray-400 mt-1 px-14">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>

      <div className="flex items-center justify-between mt-2 mb-3">
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {formatValue(safeValue)}
        </span>
        <button
          type="button"
          onClick={onUpdate}
          disabled={saving || !changed}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          Update
        </button>
      </div>
    </div>
  );
}

export default OffsetAdjuster;
