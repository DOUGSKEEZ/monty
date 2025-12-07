import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';

const AwayDatePicker = ({ awayContext, onSuccess, onError }) => {
  const flatpickrRef = useRef(null);
  const flatpickrInstance = useRef(null);
  const [selectedRange, setSelectedRange] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Initialize Flatpickr on mount
  useEffect(() => {
    if (flatpickrRef.current) {
      flatpickrInstance.current = flatpickr(flatpickrRef.current, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        minDate: 'today',
        showMonths: 1,
        static: true,
        allowInput: false,
        position: 'below',
        onChange: (selectedDates) => {
          setSelectedRange(selectedDates);
          setValidationError(''); // Clear validation errors when dates change
        },
        onClose: () => {
          // Validate range when picker closes
          if (selectedRange.length === 2) {
            validateDateRange(selectedRange[0], selectedRange[1]);
          }
        }
      });
    }

    // Cleanup on unmount
    return () => {
      if (flatpickrInstance.current) {
        flatpickrInstance.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: flatpickr callbacks capture values from separate validation useEffect

  // Update selected range when flatpickr changes
  useEffect(() => {
    if (selectedRange.length === 2) {
      validateDateRange(selectedRange[0], selectedRange[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRange, awayContext.awayPeriods]); // validateDateRange uses awayPeriods internally

  // Validate the selected date range
  const validateDateRange = (startDate, endDate) => {
    setValidationError('');

    if (!startDate || !endDate) {
      setValidationError('Please select both start and end dates');
      return false;
    }

    // Check if start date is before end date
    if (startDate >= endDate) {
      setValidationError('End date must be after start date');
      return false;
    }

    // Check if the range is too long (optional: max 365 days)
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 365) {
      setValidationError('Away period cannot exceed 365 days');
      return false;
    }

    // Check for overlapping periods
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const hasOverlap = awayContext.awayPeriods.some(period => {
      const periodStart = period.startDate;
      const periodEnd = period.endDate;
      
      // Check for any overlap: ranges overlap if one starts before the other ends
      return (startDateStr <= periodEnd && endDateStr >= periodStart);
    });

    if (hasOverlap) {
      setValidationError('This date range overlaps with an existing away period');
      return false;
    }

    return true;
  };

  // Add the selected period
  const handleAddPeriod = async () => {
    if (selectedRange.length !== 2) {
      setValidationError('Please select a date range');
      return;
    }

    const [startDate, endDate] = selectedRange;
    
    // Validate before attempting to add
    if (!validateDateRange(startDate, endDate)) {
      return;
    }

    setIsAdding(true);
    setValidationError('');

    try {
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const result = await awayContext.addAwayPeriod(startDateStr, endDateStr);

      if (result.success) {
        // Clear the selection
        setSelectedRange([]);
        if (flatpickrInstance.current) {
          flatpickrInstance.current.clear();
        }

        // Calculate number of days for success message
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

        // Call success callback
        if (onSuccess) {
          onSuccess(`Away period added successfully (${diffDays} days)`);
        }
      } else {
        setValidationError(result.error || 'Failed to add away period');
        if (onError) {
          onError(result.error || 'Failed to add away period');
        }
      }
    } catch (error) {
      const errorMessage = error.message || 'Failed to add away period';
      setValidationError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsAdding(false);
    }
  };

  // Clear the current selection
  const handleClear = () => {
    setSelectedRange([]);
    setValidationError('');
    if (flatpickrInstance.current) {
      flatpickrInstance.current.clear();
    }
  };

  // Format date for display
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calculate days in range
  const getDaysInRange = () => {
    if (selectedRange.length === 2) {
      const diffTime = Math.abs(selectedRange[1] - selectedRange[0]);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both dates
      return diffDays;
    }
    return 0;
  };

  const isValidSelection = selectedRange.length === 2 && !validationError;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">📅</span>
        Add Away Period
      </h3>

      {/* Date Picker Input */}
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2">
          Select Date Range
        </label>
        <input
          ref={flatpickrRef}
          type="text"
          placeholder="Select start and end dates..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          readOnly
        />
      </div>

      {/* Selected Range Display */}
      {selectedRange.length === 2 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800">
                Selected Range:
              </p>
              <p className="text-sm text-blue-700">
                {formatDate(selectedRange[0])} - {formatDate(selectedRange[1])}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {getDaysInRange()} days
              </p>
            </div>
            <button
              onClick={handleClear}
              className="text-blue-600 hover:text-blue-800 text-sm underline"
              disabled={isAdding}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Validation Error Display */}
      {validationError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">⚠️</span>
            <p className="text-sm text-red-700">{validationError}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {awayContext.loading && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
            <p className="text-sm text-gray-600">Loading away periods...</p>
          </div>
        </div>
      )}

      {/* Global Error Display */}
      {awayContext.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">❌</span>
            <p className="text-sm text-red-700">Error: {awayContext.error}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleAddPeriod}
          disabled={!isValidSelection || isAdding || awayContext.loading}
          className="flex-1 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isAdding ? (
            <span className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Adding...
            </span>
          ) : (
            'Add Period'
          )}
        </button>
        
        {selectedRange.length > 0 && (
          <button
            onClick={handleClear}
            disabled={isAdding}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors duration-200"
          >
            Clear
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-xs text-gray-600">
          💡 <strong>Tips:</strong> Select a start date, then an end date. 
          Away periods cannot overlap with existing periods and cannot exceed 365 days.
        </p>
      </div>
    </div>
  );
};

AwayDatePicker.propTypes = {
  awayContext: PropTypes.shape({
    awayPeriods: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.string,
    addAwayPeriod: PropTypes.func.isRequired,
  }).isRequired,
  onSuccess: PropTypes.func,
  onError: PropTypes.func,
};

export default AwayDatePicker;