console.log('[MONITORING] Module loaded!');

/**
 * Monitoring Configuration Loader
 * Loads appropriate APM agents based on environment variables
 */

// Load monitoring environment variables FIRST
const dotenv = require('dotenv');
const path = require('path');

// Load from .env.monitoring file
const monitoringEnvPath = path.join(__dirname, '../../.env.monitoring');
dotenv.config({ path: monitoringEnvPath });

console.log('[MONITORING] Loaded env from:', monitoringEnvPath);
console.log('[MONITORING] NEW_RELIC_LICENSE_KEY present:', !!process.env.NEW_RELIC_LICENSE_KEY);

const logger = require('../utils/logger');

// Load monitoring configs from environment
const enabledAgents = {
  newRelic: process.env.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_ENABLED !== 'false' ? true : false,
  datadog: process.env.DATADOG_API_KEY && process.env.DATADOG_ENABLED !== 'false' ? true : false,
  // Future: splunk, honeycomb, etc.
};

console.log('[MONITORING] Enabled agents:', enabledAgents); //Added for debugging why New Relic agent not starting

// Initialize enabled agents
if (enabledAgents.newRelic) {
  try {
    console.log('[MONITORING] Loading New Relic agent...');
    process.env.NEW_RELIC_HOME = __dirname;
    require('newrelic');
    logger.info('New Relic APM agent loaded');
  } catch (error) {
    logger.error('Failed to load New Relic agent:', error.message);
  }
}

// Future agents will be loaded here
// if (enabledAgents.datadog) { require('./datadog'); }

module.exports = enabledAgents;
