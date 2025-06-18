/**
 * Monty Monitoring Module
 * This module initializes monitoring agents (New Relic, Datadog) before the application starts.
 * It must be self-contained as it's loaded via the -r flag before other modules.
 */

// Load environment variables from monitoring-specific .env file
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load monitoring-specific environment variables
const envPath = path.join(__dirname, '../../.env.monitoring');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[MONITORING] Loaded env from:', envPath);
} else {
  console.warn('[MONITORING] No .env.monitoring file found, using default environment');
}

// Check for required environment variables
const NEW_RELIC_LICENSE_KEY = process.env.NEW_RELIC_LICENSE_KEY;
const NEW_RELIC_APP_NAME = process.env.NEW_RELIC_APP_NAME || 'Monty Backend';
const NEW_RELIC_DISTRIBUTED_TRACING_ENABLED = process.env.NEW_RELIC_DISTRIBUTED_TRACING_ENABLED === 'true';
const NEW_RELIC_LOGGING_ENABLED = process.env.NEW_RELIC_LOGGING_ENABLED === 'true';

// Determine which agents to enable
const enabledAgents = {
  newRelic: !!NEW_RELIC_LICENSE_KEY,
  datadog: false // Datadog not currently implemented
};

console.log('[MONITORING] Module loaded!');
console.log('[MONITORING] NEW_RELIC_LICENSE_KEY present:', !!NEW_RELIC_LICENSE_KEY);
console.log('[MONITORING] Enabled agents:', enabledAgents);

// Initialize New Relic if enabled
if (enabledAgents.newRelic) {
  try {
    console.log('[MONITORING] Loading New Relic agent...');
    
    // Set New Relic configuration
    process.env.NEW_RELIC_APP_NAME = NEW_RELIC_APP_NAME;
    process.env.NEW_RELIC_DISTRIBUTED_TRACING_ENABLED = NEW_RELIC_DISTRIBUTED_TRACING_ENABLED;
    process.env.NEW_RELIC_LOGGING_ENABLED = NEW_RELIC_LOGGING_ENABLED;
    
    // Load New Relic agent
    require('newrelic');
    
    console.log('[MONITORING] New Relic agent loaded successfully');
  } catch (error) {
    console.error('[MONITORING] Failed to load New Relic agent:', error.message);
    console.error('[MONITORING] Stack trace:', error.stack);
  }
}

// Initialize Datadog if enabled
if (enabledAgents.datadog) {
  try {
    console.log('[MONITORING] Loading Datadog agent...');
    // Datadog initialization code will go here
    console.log('[MONITORING] Datadog agent loaded successfully');
  } catch (error) {
    console.error('[MONITORING] Failed to load Datadog agent:', error.message);
    console.error('[MONITORING] Stack trace:', error.stack);
  }
}

// Export monitoring status
module.exports = {
  enabledAgents,
  isNewRelicEnabled: enabledAgents.newRelic,
  isDatadogEnabled: enabledAgents.datadog
};
