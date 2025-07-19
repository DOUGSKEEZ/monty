/**
 * Debug utility for conditional logging
 * Set DEBUG_LOGGING=false in environment to disable debug logs
 */

const isDebugEnabled = process.env.DEBUG_LOGGING !== 'false';

const debug = {
  log: (...args) => {
    if (isDebugEnabled) {
      console.log(...args);
    }
  },
  
  warn: (...args) => {
    if (isDebugEnabled) {
      console.warn(...args);
    }
  },
  
  error: (...args) => {
    // Always show errors regardless of debug setting
    console.error(...args);
  }
};

module.exports = debug;