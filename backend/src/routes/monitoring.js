// Monitoring management API - monitor your monitoring systems!
const express = require('express');
const router = express.Router();
const multiVendorMetrics = require('../services/MultiVendorMetricsService');
const prometheusMetrics = require('../services/PrometheusMetricsService');
const logger = require('../utils/logger').getModuleLogger('monitoring-api');

// Get status of all monitoring providers
router.get('/status', async (req, res) => {
  try {
    const providerStatus = multiVendorMetrics.getProviderStatus();
    const isPrometheusHealthy = prometheusMetrics.isInitialized;
    
    // Test each provider with a health check metric
    const healthChecks = {};
    
    for (const [providerName, provider] of Object.entries(providerStatus)) {
      try {
        if (provider.enabled) {
          // Send a test metric to verify the provider is working
          await multiVendorMetrics.sendMetric(
            'monitoring_health_check',
            1,
            'gauge',
            { provider: providerName, timestamp: Date.now() }
          );
          healthChecks[providerName] = { status: 'healthy', lastCheck: new Date().toISOString() };
        } else {
          healthChecks[providerName] = { status: 'disabled', lastCheck: new Date().toISOString() };
        }
      } catch (error) {
        healthChecks[providerName] = { 
          status: 'error', 
          error: error.message,
          lastCheck: new Date().toISOString()
        };
      }
    }
    
    res.json({
      success: true,
      data: {
        prometheus: {
          enabled: isPrometheusHealthy,
          status: isPrometheusHealthy ? 'healthy' : 'error'
        },
        multiVendor: {
          providers: providerStatus,
          healthChecks: healthChecks,
          totalEnabled: Object.values(providerStatus).filter(p => p.enabled).length
        },
        summary: {
          totalProviders: Object.keys(providerStatus).length + 1, // +1 for Prometheus
          enabledProviders: Object.values(providerStatus).filter(p => p.enabled).length + (isPrometheusHealthy ? 1 : 0),
          healthyProviders: Object.values(healthChecks).filter(h => h.status === 'healthy').length + (isPrometheusHealthy ? 1 : 0)
        }
      }
    });
  } catch (error) {
    logger.error('Error getting monitoring status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring status',
      details: error.message
    });
  }
});

// Get metrics about metrics (meta-monitoring)
router.get('/metrics-stats', async (req, res) => {
  try {
    // This would typically come from your metrics storage
    // For now, we'll provide some example stats
    const stats = {
      last24Hours: {
        totalMetrics: 8640, // Estimated based on current setup
        httpRequests: 1440,
        weatherApiCalls: 120,
        shadeControls: 50,
        musicControls: 200,
        bluetoothEvents: 100
      },
      providerCosts: {
        estimated: {
          datadog: { metrics: 86400, estimatedCost: 8.64 }, // $0.10 per 1000
          newrelic: { dataPoints: 86400, estimatedCost: 0 }, // Free tier
          splunk: { events: 8640, estimatedCost: 0 }, // Free tier
          elasticsearch: { documents: 8640, estimatedCost: 0 } // Self-hosted
        }
      },
      performance: {
        averageLatency: '< 5ms',
        successRate: '99.9%',
        lastError: null
      }
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting metrics stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics stats',
      details: error.message
    });
  }
});

// Send test metric to all providers
router.post('/test-metric', async (req, res) => {
  try {
    const { name = 'test_metric', value = 1, type = 'gauge' } = req.body;
    
    const startTime = Date.now();
    
    // Send test metric
    await multiVendorMetrics.sendMetric(name, value, type, {
      test: true,
      timestamp: startTime,
      source: 'monitoring_api'
    });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      data: {
        metric: { name, value, type },
        duration: `${duration}ms`,
        timestamp: new Date(startTime).toISOString(),
        providers: multiVendorMetrics.getProviderStatus()
      }
    });
  } catch (error) {
    logger.error('Error sending test metric:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test metric',
      details: error.message
    });
  }
});

// Send test event to all providers
router.post('/test-event', async (req, res) => {
  try {
    const { 
      title = 'Test Event', 
      text = 'This is a test event from the monitoring API',
      level = 'info'
    } = req.body;
    
    const startTime = Date.now();
    
    // Send test event
    await multiVendorMetrics.sendEvent(title, text, {
      test: true,
      timestamp: startTime,
      source: 'monitoring_api'
    }, level);
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      data: {
        event: { title, text, level },
        duration: `${duration}ms`,
        timestamp: new Date(startTime).toISOString(),
        providers: multiVendorMetrics.getProviderStatus()
      }
    });
  } catch (error) {
    logger.error('Error sending test event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test event',
      details: error.message
    });
  }
});

// Get monitoring configuration
router.get('/config', (req, res) => {
  try {
    const config = {
      prometheus: {
        enabled: process.env.PROMETHEUS_ENABLED !== 'false',
        endpoint: '/metrics'
      },
      providers: {
        datadog: {
          enabled: !!process.env.DATADOG_API_KEY,
          configured: !!(process.env.DATADOG_API_KEY && process.env.DATADOG_AGENT_HOST)
        },
        splunk: {
          enabled: !!(process.env.SPLUNK_HEC_TOKEN && process.env.SPLUNK_HOST),
          configured: !!(process.env.SPLUNK_HEC_TOKEN && process.env.SPLUNK_HOST && process.env.SPLUNK_PORT)
        },
        newrelic: {
          enabled: !!process.env.NEW_RELIC_LICENSE_KEY,
          configured: !!(process.env.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_ACCOUNT_ID)
        },
        elasticsearch: {
          enabled: !!process.env.ELASTICSEARCH_URL,
          configured: !!process.env.ELASTICSEARCH_URL
        },
        honeycomb: {
          enabled: !!process.env.HONEYCOMB_API_KEY,
          configured: !!(process.env.HONEYCOMB_API_KEY && process.env.HONEYCOMB_DATASET)
        }
      },
      settings: {
        samplingRate: parseFloat(process.env.METRICS_SAMPLING_RATE || '1.0'),
        eventSamplingRate: parseFloat(process.env.EVENTS_SAMPLING_RATE || '1.0'),
        consoleMetrics: process.env.CONSOLE_METRICS_ENABLED === 'true',
        debugMetrics: process.env.DEBUG_METRICS === 'true'
      }
    };
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Error getting monitoring config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring config',
      details: error.message
    });
  }
});

// Record business event (for tracking important home automation events)
router.post('/business-event', async (req, res) => {
  try {
    const { 
      event_type, 
      description, 
      metadata = {},
      level = 'info'
    } = req.body;
    
    if (!event_type) {
      return res.status(400).json({
        success: false,
        error: 'event_type is required'
      });
    }
    
    const eventTitle = `Home Automation: ${event_type}`;
    const eventText = description || `${event_type} event occurred`;
    
    // Send to monitoring platforms
    await multiVendorMetrics.sendEvent(eventTitle, eventText, {
      event_type,
      service: 'monty-home-automation',
      ...metadata
    }, level);
    
    // Also record as a business metric
    await multiVendorMetrics.recordBusinessMetric(`events.${event_type}`, 1, {
      level,
      ...metadata
    });
    
    res.json({
      success: true,
      data: {
        event_type,
        description: eventText,
        level,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error recording business event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record business event',
      details: error.message
    });
  }
});

// Generate monitoring dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const providerStatus = multiVendorMetrics.getProviderStatus();
    const enabledProviders = Object.entries(providerStatus)
      .filter(([_, provider]) => provider.enabled)
      .map(([name, provider]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        type: provider.type,
        status: 'healthy', // Would be determined by health checks
        url: getDashboardUrl(name)
      }));
    
    const dashboard = {
      overview: {
        totalProviders: Object.keys(providerStatus).length + 1,
        enabledProviders: enabledProviders.length + 1, // +1 for Prometheus
        healthyProviders: enabledProviders.length + 1, // Simplified for now
        lastUpdate: new Date().toISOString()
      },
      providers: enabledProviders,
      quickLinks: {
        prometheus: process.env.PROMETHEUS_URL || 'http://localhost:9090',
        grafana: process.env.GRAFANA_URL || 'http://localhost:3000'
      },
      alerts: [], // Would be populated with active alerts
      recentEvents: [] // Would be populated with recent events
    };
    
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Error generating dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate dashboard data',
      details: error.message
    });
  }
});

// Helper function to get dashboard URLs for different providers
function getDashboardUrl(provider) {
  switch (provider) {
    case 'datadog':
      return 'https://app.datadoghq.com/dashboard/lists';
    case 'newrelic':
      return 'https://one.newrelic.com/';
    case 'splunk':
      return process.env.SPLUNK_HOST ? `https://${process.env.SPLUNK_HOST}` : null;
    case 'elasticsearch':
      return process.env.KIBANA_URL || (process.env.ELASTICSEARCH_URL ? process.env.ELASTICSEARCH_URL.replace(':9200', ':5601') : null);
    case 'honeycomb':
      return 'https://ui.honeycomb.io/';
    default:
      return null;
  }
}

module.exports = router;