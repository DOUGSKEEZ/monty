import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const AwayCalendarDisplay = ({ awayContext }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Create a set of away dates for fast lookup
  const awayDatesSet = useMemo(() => {
    const datesSet = new Set();
    
    console.log('🔍 Calendar: Processing away periods:', awayContext.awayPeriods);
    
    awayContext.awayPeriods.forEach(period => {
      console.log('🔍 Calendar: Processing period:', period);
      const startDate = new Date(period.startDate);
      const endDate = new Date(period.endDate);
      
      console.log('🔍 Calendar: Date range:', startDate, 'to', endDate);
      
      // Add all dates in the range
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        datesSet.add(dateStr);
        console.log('🔍 Calendar: Added away date:', dateStr);
      }
    });
    
    console.log('🔍 Calendar: Final away dates set:', Array.from(datesSet));
    return datesSet;
  }, [awayContext.awayPeriods]);

  // Get away periods that overlap with a specific date
  const getPeriodsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    
    return awayContext.awayPeriods.filter(period => {
      return dateStr >= period.startDate && dateStr <= period.endDate;
    });
  };

  // Custom tile styling for away days
  const getTileClassName = ({ date, view }) => {
    if (view !== 'month') return '';
    
    const dateStr = date.toISOString().split('T')[0];
    const isAway = awayDatesSet.has(dateStr);
    const isToday = date.toDateString() === new Date().toDateString();
    const isPast = date < new Date().setHours(0, 0, 0, 0);
    
    // Debug logging for weekend days that are showing as away
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    if ((dayOfWeek === 0 || dayOfWeek === 6) && isAway) {
      console.log('🔍 Weekend marked as away:', dateStr, 'dayOfWeek:', dayOfWeek, 'isAway:', isAway);
    }
    
    let classes = [];
    
    if (isAway) {
      classes.push('away-day');
    }
    
    if (isToday) {
      classes.push('today-tile');
    }
    
    if (isPast) {
      classes.push('past-day');
    }
    
    return classes.join(' ');
  };

  // Custom tile content for away days
  const getTileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    
    const dateStr = date.toISOString().split('T')[0];
    const isAway = awayDatesSet.has(dateStr);
    
    if (isAway) {
      return (
        <div className="away-indicator">
          <span className="away-dot">•</span>
        </div>
      );
    }
    
    return null;
  };

  // Handle date click to show period details
  const handleDateClick = (date) => {
    const periods = getPeriodsForDate(date);
    
    if (periods.length > 0) {
      // Could show a tooltip or modal with period details
      console.log('Away periods for', date.toDateString(), periods);
    }
  };

  // Navigation handlers
  const handleActiveStartDateChange = ({ activeStartDate }) => {
    setCurrentDate(activeStartDate);
  };

  // Format month/year display
  const formatMonthYear = (locale, date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // Get summary stats for current month
  const getMonthStats = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let awayDaysCount = 0;
    
    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      if (awayDatesSet.has(dateStr)) {
        awayDaysCount++;
      }
    }
    
    return { awayDaysCount };
  };

  const monthStats = getMonthStats();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">📅</span>
        Away Calendar
      </h3>

      {/* Loading State */}
      {awayContext.loading && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
            <p className="text-sm text-gray-600">Loading calendar...</p>
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

      {/* Month Statistics */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-800">
              {formatMonthYear('en-US', currentDate)}
            </p>
            <p className="text-xs text-blue-600">
              {monthStats.awayDaysCount} away day{monthStats.awayDaysCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center text-blue-600">
            <span className="w-3 h-3 bg-red-400 rounded-full mr-1"></span>
            <span className="text-xs">Away</span>
          </div>
        </div>
      </div>

      {/* React Calendar */}
      <div className="away-calendar-container">
        <Calendar
          value={null} // Don't show selected date
          onChange={handleDateClick}
          onActiveStartDateChange={handleActiveStartDateChange}
          tileClassName={getTileClassName}
          tileContent={getTileContent}
          formatMonthYear={formatMonthYear}
          showNeighboringMonth={false}
          showNavigation={true}
          showDoubleView={false}
          selectRange={false}
          minDetail="month"
          maxDetail="month"
          calendarType="gregory" // Use gregorian calendar (Sunday first)
          className="compact-calendar"
        />
      </div>

      {/* Legend */}
      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-xs font-medium text-gray-700 mb-2">Legend:</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center">
            <span className="w-3 h-3 bg-red-400 rounded-full mr-1"></span>
            <span className="text-xs text-gray-600">Away Days</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 bg-blue-500 rounded-full mr-1"></span>
            <span className="text-xs text-gray-600">Today</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 bg-gray-300 rounded-full mr-1"></span>
            <span className="text-xs text-gray-600">Past Days</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {awayContext.awayPeriods.length > 0 && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm font-medium text-green-800 mb-1">
            Total Away Periods: {awayContext.awayPeriods.length}
          </p>
          <p className="text-xs text-green-600">
            Total Days: {awayDatesSet.size}
          </p>
        </div>
      )}

      {/* No periods message */}
      {awayContext.awayPeriods.length === 0 && !awayContext.loading && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-center">
          <p className="text-sm text-gray-500">
            No away periods scheduled
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Use the date picker to add periods
          </p>
        </div>
      )}

      {/* Custom CSS Styles */}
      <style jsx>{`
        .away-calendar-container {
          font-size: 14px;
        }
        
        .compact-calendar {
          width: 100% !important;
          max-width: 300px;
          margin: 0 auto;
          border: none !important;
          font-family: inherit;
        }
        
        .compact-calendar .react-calendar__navigation {
          height: 40px;
          margin-bottom: 1em;
        }
        
        .compact-calendar .react-calendar__navigation button {
          min-width: 30px;
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          color: #374151;
          font-size: 14px;
        }
        
        .compact-calendar .react-calendar__navigation button:hover {
          background: #e5e7eb;
        }
        
        .compact-calendar .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: bold;
          font-size: 10px;
          color: #6b7280;
        }
        
        .compact-calendar .react-calendar__tile {
          max-width: 35px;
          height: 35px;
          background: white;
          border: 1px solid #e5e7eb;
          font-size: 12px;
          position: relative;
        }
        
        .compact-calendar .react-calendar__tile:hover {
          background: #f3f4f6;
        }
        
        .compact-calendar .react-calendar__tile.away-day {
          background: #fecaca !important;
          border-color: #f87171 !important;
          color: #374151 !important;
          font-weight: normal !important;
        }
        
        .compact-calendar .react-calendar__tile.today-tile {
          background: #dbeafe !important;
          border-color: #3b82f6 !important;
          color: #374151 !important;
          font-weight: normal !important;
        }
        
        .compact-calendar .react-calendar__tile.today-tile.away-day {
          background: #fed7d7 !important;
          border-color: #e53e3e !important;
          color: #374151 !important;
          font-weight: normal !important;
        }
        
        .compact-calendar .react-calendar__tile.past-day {
          background: #f9fafb;
          color: #9ca3af;
        }
        
        .compact-calendar .react-calendar__tile.past-day.away-day {
          background: #f3f4f6;
          color: #9ca3af !important;
        }
        
        .away-indicator {
          position: absolute;
          top: 2px;
          right: 2px;
          line-height: 1;
        }
        
        .away-dot {
          color: #dc2626;
          font-size: 8px;
        }
        
        .compact-calendar .react-calendar__tile--disabled {
          background-color: #f9fafb;
          color: #d1d5db;
        }
        
        .compact-calendar .react-calendar__navigation__label__labelText {
          font-weight: bold;
          font-size: 14px;
        }
        
        /* Override ALL react-calendar weekend styling - force normal text color */
        .compact-calendar .react-calendar__month-view__days__day--weekend,
        .compact-calendar .react-calendar__tile--weekend,
        .compact-calendar .react-calendar__month-view__days__day--neighboringMonth.react-calendar__month-view__days__day--weekend,
        .compact-calendar abbr[title],
        .compact-calendar .react-calendar__tile abbr {
          color: inherit !important;
          text-decoration: none !important;
        }
        
        /* Force all tiles to have consistent text color based only on past/present status */
        .compact-calendar .react-calendar__tile {
          color: #374151 !important; /* Default text color */
        }
        
        .compact-calendar .react-calendar__tile.past-day {
          color: #9ca3af !important; /* Gray for past days */
        }
      `}</style>
    </div>
  );
};

AwayCalendarDisplay.propTypes = {
  awayContext: PropTypes.shape({
    awayPeriods: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.string,
    isDateAway: PropTypes.func.isRequired,
  }).isRequired,
};

export default AwayCalendarDisplay;