// Elastic APM monitoring setup
// This must be loaded BEFORE any other modules

const apm = require('elastic-apm-node');

// Only initialize if APM is enabled
if (process.env.ELASTIC_APM_ENABLED === 'true') {
  const apmAgent = apm.start({
    serviceName: process.env.ELASTIC_APM_SERVICE_NAME || 'monty-backend',
    serviceVersion: process.env.ELASTIC_APM_SERVICE_VERSION || '1.0.0',
    serverUrl: process.env.ELASTIC_APM_SERVER_URL || 'http://192.168.0.152:8200',
    verifyServerCert: false, // For self-hosted without SSL
    environment: process.env.NODE_ENV || 'development',
    
    // Capture settings
    captureBody: 'all',
    captureHeaders: true,
    
    // Performance settings
    transactionSampleRate: 1.0, // 100% sampling for demo
    
    // Error settings
    captureErrorLogStackTraces: 'always',
    
    // Custom settings for home automation
    addPatch: true,
    logLevel: 'info'
  });

  console.log('🔍 Elastic APM initialized for service:', apmAgent.serviceName);
  module.exports = apmAgent;
} else {
  console.log('📴 Elastic APM disabled');
  module.exports = null;
}