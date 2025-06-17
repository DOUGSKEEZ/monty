# Monitoring Directory

This directory contains all APM agent configurations and monitoring-related code.

## Files
- `index.js` - Main loader that conditionally loads APM agents
- `newrelic.js` - New Relic APM configuration
- Future: `datadog.js`, `splunk.js`, `honeycomb.js`

## Usage
The monitoring loader is required at the top of server.js and automatically
initializes any APM agents that have API keys configured in the environment.
