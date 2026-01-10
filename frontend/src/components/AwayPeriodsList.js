import React, { useState } from 'react';
import PropTypes from 'prop-types';

const AwayPeriodsList = ({ awayContext, onSuccess }) => {
  const [deletingIndex, setDeletingIndex] = useState(null);

  // Format date for display
  const formatDate = (dateStr) => {
    // Add explicit time to avoid timezone interpretation issues
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calculate number of days in a period
  const calculateDays = (startDate, endDate) => {
    // Add explicit time to avoid timezone interpretation issues
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both dates
    return diffDays;
  };

  // Handle period deletion
  const handleDelete = async (index, onSuccess) => {
    setDeletingIndex(index);

    try {
      const result = await awayContext.removeAwayPeriod(index);

      if (result.success) {
        // Call success callback if provided
        if (onSuccess) {
          onSuccess('Away period removed successfully');
        }
      } else {
        console.error('Failed to remove period:', result.error);
      }
    } catch (error) {
      console.error('Error removing period:', error);
    } finally {
      setDeletingIndex(null);
    }
  };

  // Sort periods by start date
  const sortedPeriods = [...awayContext.awayPeriods].sort((a, b) => 
    new Date(a.startDate + 'T12:00:00') - new Date(b.startDate + 'T12:00:00')
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">📋</span>
        Away Periods
      </h3>

      {/* Loading State */}
      {awayContext.loading && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
            <p className="text-sm text-gray-600">Loading periods...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {awayContext.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">❌</span>
            <p className="text-sm text-red-700">Error: {awayContext.error}</p>
          </div>
        </div>
      )}

      {/* Periods List */}
      {sortedPeriods.length > 0 ? (
        <div className="space-y-3">
          {sortedPeriods.map((period, index) => {
            const days = calculateDays(period.startDate, period.endDate);
            const isDeleting = deletingIndex === index;
            const isPast = new Date(period.endDate + 'T12:00:00') < new Date().setHours(0, 0, 0, 0);
            const isCurrent = new Date() >= new Date(period.startDate + 'T12:00:00') && new Date() <= new Date(period.endDate + 'T12:00:00');
            
            return (
              <div
                key={`${period.startDate}-${period.endDate}`}
                className={`p-3 rounded-lg border transition-all duration-200 ${
                  isCurrent 
                    ? 'border-blue-400 bg-blue-50' 
                    : isPast 
                    ? 'border-gray-300 bg-gray-50' 
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isCurrent && <span className="text-blue-600 text-xs font-bold">CURRENT</span>}
                      {isPast && <span className="text-gray-500 text-xs">PAST</span>}
                    </div>
                    
                    <p className={`font-medium ${
                      isCurrent ? 'text-blue-800' : isPast ? 'text-gray-600' : 'text-gray-800'
                    }`}>
                      {formatDate(period.startDate)} - {formatDate(period.endDate)}
                    </p>
                    
                    <p className={`text-sm ${
                      isCurrent ? 'text-blue-600' : isPast ? 'text-gray-500' : 'text-gray-600'
                    }`}>
                      {days} day{days !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handleDelete(index, onSuccess)}
                    disabled={isDeleting || awayContext.loading}
                    className="ml-3 px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                    title="Delete this away period"
                  >
                    {isDeleting ? (
                      <span className="flex items-center">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                        ...
                      </span>
                    ) : (
                      '🗑️'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : !awayContext.loading ? (
        <div className="text-center py-8">
          <div className="text-gray-400 text-4xl mb-2">📅</div>
          <p className="text-gray-500 text-sm mb-1">No away periods scheduled</p>
          <p className="text-gray-400 text-xs">Use the date picker above to add periods</p>
        </div>
      ) : null}

      {/* Summary Stats */}
      {sortedPeriods.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-lg font-bold text-blue-800">{sortedPeriods.length}</p>
              <p className="text-xs text-blue-600">Total Periods</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-lg font-bold text-green-800">
                {sortedPeriods.reduce((total, period) => 
                  total + calculateDays(period.startDate, period.endDate), 0
                )}
              </p>
              <p className="text-xs text-green-600">Total Days</p>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-xs text-gray-600">
          💡 <strong>Tip:</strong> Away periods help optimize home automation schedules. 
          Current periods are highlighted in blue, past periods are grayed out.
        </p>
      </div>
    </div>
  );
};

AwayPeriodsList.propTypes = {
  awayContext: PropTypes.shape({
    awayPeriods: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.string,
    removeAwayPeriod: PropTypes.func.isRequired,
  }).isRequired,
  onSuccess: PropTypes.func,
};

export default AwayPeriodsList;