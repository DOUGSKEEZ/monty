import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { configApi } from '../utils/api';

const AwayManager = ({ children }) => {
  const [awayPeriods, setAwayPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load away periods from backend on mount
  useEffect(() => {
    loadAwayPeriods();
  }, []);

  // Load away periods from backend using established API pattern
  const loadAwayPeriods = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await configApi.getAwayPeriods();

      // The backend returns the value directly for config keys
      const periods = Array.isArray(data.data) ? data.data : [];

      // Transform backend format (start/end) to frontend format (startDate/endDate)
      const transformedPeriods = periods.map(period => ({
        startDate: period.start || period.startDate,
        endDate: period.end || period.endDate
      }));

      setAwayPeriods(transformedPeriods);
    } catch (err) {
      console.error('Error loading away periods:', err);
      setError(err.message);
      // Initialize with empty array on error
      setAwayPeriods([]);
    } finally {
      setLoading(false);
    }
  };

  // Add a new away period
  const addAwayPeriod = async (startDate, endDate) => {
    try {
      // Use the backend API to add the period
      const result = await configApi.addAwayPeriod(startDate, endDate);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to add away period');
      }

      // Reload the periods from backend to get the updated list
      await loadAwayPeriods();
      setError(null);
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Remove an away period
  const removeAwayPeriod = async (periodIndex) => {
    try {
      // Use the backend API to remove the period by index
      const result = await configApi.removeAwayPeriod(periodIndex);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove away period');
      }

      // Reload the periods from backend to get the updated list
      await loadAwayPeriods();
      setError(null);
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Check if a date is within any away period
  const isDateAway = (date) => {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    return awayPeriods.some(period => {
      return dateStr >= period.startDate && dateStr <= period.endDate;
    });
  };

  // Get all away dates as an array (for calendar highlighting)
  const getAwayDates = () => {
    const awayDates = [];
    
    awayPeriods.forEach(period => {
      const startDate = new Date(period.startDate);
      const endDate = new Date(period.endDate);
      
      // Add all dates in the range
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        awayDates.push(new Date(date));
      }
    });
    
    return awayDates;
  };

  // Pass context to children
  const awayContext = {
    awayPeriods,
    loading,
    error,
    addAwayPeriod,
    removeAwayPeriod,
    isDateAway,
    getAwayDates,
    refreshAwayPeriods: loadAwayPeriods
  };

  // Render children with context as props or render function
  if (typeof children === 'function') {
    return children(awayContext);
  }

  // Clone children and pass context as props
  return React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { awayContext });
    }
    return child;
  });
};

AwayManager.propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.node,
    PropTypes.func
  ]).isRequired
};

export default AwayManager;