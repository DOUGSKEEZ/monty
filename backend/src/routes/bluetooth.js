/**
 * Bluetooth Routes - Dedicated API endpoints for Bluetooth speaker connectivity
 * Separates Bluetooth concerns from music playback
 */

const express = require('express');
const router = express.Router();
const { createBluetoothService } = require('../utils/ServiceFactory');
const logger = require('../utils/logger').getModuleLogger('bluetooth-routes');
const prometheusMetrics = require('../services/PrometheusMetricsService');

// Lazy-load bluetooth service to avoid initialization timing issues
let bluetoothService = null;
const getBluetoothService = () => {
  if (!bluetoothService) {
    bluetoothService = createBluetoothService();
  }
  return bluetoothService;
};

// Initialize Bluetooth subsystems
router.post('/init', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/bluetooth/init');
    
    const result = await getBluetoothService().initialize();
    
    // Always return a 200 with status information
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/init', 200, responseTime);
  } catch (error) {
    logger.error(`Error initializing Bluetooth: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize Bluetooth subsystems',
      error: error.message
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/bluetooth/init', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/init', 500, responseTime);
  }
});

// Connect to Bluetooth speakers
router.post('/connect', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/bluetooth/connect');
    
    // Check if force wakeup was requested
    const forceWakeup = req.body.forceWakeup === true;
    
    const result = await getBluetoothService().connect(forceWakeup);
    
    // Use appropriate status code based on result
    if (result.success) {
      res.json(result);
    } else {
      // Still use 200 for known error conditions
      if (result.error === 'CONNECTION_IN_PROGRESS' || result.error === 'TOO_SOON') {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    }
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/connect', res.statusCode, responseTime);
  } catch (error) {
    logger.error(`Error connecting to Bluetooth: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to connect to Bluetooth speakers',
      error: error.message
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/bluetooth/connect', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/connect', 500, responseTime);
  }
});

// Disconnect from Bluetooth speakers
router.post('/disconnect', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/bluetooth/disconnect');
    
    const result = await getBluetoothService().disconnect();
    
    // Use appropriate status code based on result
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/disconnect', res.statusCode, responseTime);
  } catch (error) {
    logger.error(`Error disconnecting from Bluetooth: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect from Bluetooth speakers',
      error: error.message
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/bluetooth/disconnect', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/disconnect', 500, responseTime);
  }
});

// Get Bluetooth status
router.get('/status', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('GET', '/api/bluetooth/status');
    
    // Check if this is a background poll request
    const isSilent = req.query.silent === 'true' || req.query.background === 'true';
    
    if (!isSilent) {
      logger.debug('Bluetooth status requested');
    }
    
    const result = await getBluetoothService().getStatus();
    
    // Always return a 200 with status information
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/bluetooth/status', 200, responseTime);
  } catch (error) {
    logger.error(`Error getting Bluetooth status: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get Bluetooth status',
      error: error.message
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('GET', '/api/bluetooth/status', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/bluetooth/status', 500, responseTime);
  }
});

// Wake up Bluetooth speakers
router.post('/wakeup', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('POST', '/api/bluetooth/wakeup');
    
    const result = await getBluetoothService().wakeup();
    
    // Use appropriate status code based on result
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/wakeup', res.statusCode, responseTime);
  } catch (error) {
    logger.error(`Error waking up Bluetooth: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to wake up Bluetooth speakers',
      error: error.message
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('POST', '/api/bluetooth/wakeup', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('POST', '/api/bluetooth/wakeup', 500, responseTime);
  }
});

// Get Bluetooth diagnostics
router.get('/diagnostics', async (req, res) => {
  const routeStartTime = Date.now();
  try {
    // Record request metric
    prometheusMetrics.incrementHttpRequestCount('GET', '/api/bluetooth/diagnostics');
    
    logger.info('Bluetooth diagnostics requested');
    
    const result = await getBluetoothService().getDiagnostics();
    
    // Always return a 200 with diagnostic information
    res.json(result);
    
    // Record response time
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/bluetooth/diagnostics', 200, responseTime);
  } catch (error) {
    logger.error(`Error getting Bluetooth diagnostics: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get Bluetooth diagnostics',
      error: error.message
    });
    
    // Record error
    prometheusMetrics.incrementErrorCount('GET', '/api/bluetooth/diagnostics', error.message);
    const responseTime = Date.now() - routeStartTime;
    prometheusMetrics.recordResponseTime('GET', '/api/bluetooth/diagnostics', 500, responseTime);
  }
});

module.exports = router;