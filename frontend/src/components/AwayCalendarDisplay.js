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

  // Custom tile content for away days (disabled - using background color only)
  const getTileContent = () => {
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
          showNeighboringMonth={true}
          showNavigation={true}
          showDoubleView={false}
          selectRange={false}
          minDetail="month"
          maxDetail="month"
          calendarType="gregory"
          showWeekNumbers={false}
          className="compact-calendar"
        />
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
          max-width: 350px;
          margin: 0 auto;
        }

        /* Away day highlighting */
        .compact-calendar .react-calendar__tile.away-day {
          background: #fecaca !important;
          border-color: #f87171 !important;
        }

        /* Today highlighting */
        .compact-calendar .react-calendar__tile.today-tile {
          background: #dbeafe !important;
          border-color: #3b82f6 !important;
        }

        /* Today + Away */
        .compact-calendar .react-calendar__tile.today-tile.away-day {
          background: #fed7d7 !important;
          border-color: #e53e3e !important;
        }

        /* Past days - muted */
        .compact-calendar .react-calendar__tile.past-day {
          opacity: 0.5;
        }

        /* Remove weekend color styling */
        .compact-calendar .react-calendar__month-view__days__day--weekend {
          color: inherit !important;
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