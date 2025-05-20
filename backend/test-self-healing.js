/**
 * Test script for self-healing capabilities
 * 
 * This script demonstrates the self-healing capabilities added to the scheduler service.
 * It simulates various failure conditions and shows how the system recovers.
 */

const express = require('express');
const logger = require('./src/utils/logger');
const serviceRegistry = require('./src/utils/ServiceRegistry');
const CircuitBreaker = require('./src/utils/CircuitBreaker');
const ServiceWatchdog = require('./src/utils/ServiceWatchdog');

// Create a simple Express app for testing
const app = express();
const PORT = 3001;

// Mock services that will be used for testing
const mockShadeService = {
  status: 'ready',
  triggerShadeScene: async (sceneName) => {
    logger.info(`Mock shade service triggering scene: ${sceneName}`);
    
    // Simulate failures based on a trigger
    if (global.shouldFailShadeService) {
      logger.error('Mock shade service failure (simulated)');
      throw new Error('Simulated shade service failure');
    }
    
    return { success: true, message: `Scene ${sceneName} triggered successfully` };
  }
};

const mockWeatherService = {
  status: 'ready',
  getSunriseSunsetTimes: async () => {
    logger.info('Mock weather service getting sun times');
    
    // Simulate failures based on a trigger
    if (global.shouldFailWeatherService) {
      logger.error('Mock weather service failure (simulated)');
      throw new Error('Simulated weather service failure');
    }
    
    const now = new Date();
    const sunriseDate = new Date(now);
    sunriseDate.setHours(6, 30, 0, 0);
    
    const sunsetDate = new Date(now);
    sunsetDate.setHours(20, 0, 0, 0);
    
    return {
      success: true,
      data: {
        sunrise: sunriseDate,
        sunset: sunsetDate
      }
    };
  }
};

// Register mock services with the registry
serviceRegistry.register('weather-service', mockWeatherService, true);
serviceRegistry.register('shade-service', mockShadeService, true);

// Create circuit breakers for testing
const testCircuit = new CircuitBreaker('test-circuit', {
  failureThreshold: 3,
  resetTimeout: 10000, // Short timeout for testing
  fallbackFunction: async () => ({ success: false, fromFallback: true })
});

// Setup API routes
app.get('/', (req, res) => {
  res.send('Self-healing test server running');
});

// Endpoint to view service registry status
app.get('/api/service-registry', (req, res) => {
  res.json(serviceRegistry.getAllServices());
});

// Endpoint to view watchdog status
app.get('/api/watchdog-status', (req, res) => {
  res.json(ServiceWatchdog.getStatus());
});

// Endpoint to test circuit breaker
app.get('/api/test-circuit', async (req, res) => {
  try {
    const result = await testCircuit.execute(async () => {
      // Simulate success or failure based on query parameter
      if (req.query.fail === 'true') {
        throw new Error('Simulated failure for testing');
      }
      return { success: true, message: 'Circuit execution successful' };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to toggle service failures for testing
app.get('/api/toggle-failure', (req, res) => {
  if (req.query.service === 'shade') {
    global.shouldFailShadeService = req.query.enable === 'true';
    res.json({ service: 'shade', failing: global.shouldFailShadeService });
  } else if (req.query.service === 'weather') {
    global.shouldFailWeatherService = req.query.enable === 'true';
    res.json({ service: 'weather', failing: global.shouldFailWeatherService });
  } else {
    res.status(400).json({ error: 'Invalid service specified' });
  }
});

// Endpoint to manually update service health
app.get('/api/update-health', (req, res) => {
  const serviceName = req.query.service;
  const isHealthy = req.query.healthy === 'true';
  
  if (!serviceName) {
    return res.status(400).json({ error: 'Service name is required' });
  }
  
  const updated = serviceRegistry.updateHealth(serviceName, isHealthy);
  res.json({ service: serviceName, healthy: isHealthy, updated });
});

// Endpoint to manually trigger watchdog recovery
app.get('/api/trigger-recovery', async (req, res) => {
  const serviceName = req.query.service;
  
  if (!serviceName) {
    return res.status(400).json({ error: 'Service name is required' });
  }
  
  try {
    const result = await ServiceWatchdog.triggerRecovery(serviceName, 'Manual recovery test');
    res.json({ service: serviceName, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard route
app.get('/api/dashboard', (req, res) => {
  res.json({
    services: serviceRegistry.getAllServices(),
    watchdog: ServiceWatchdog.getStatus(),
    circuits: {
      test: testCircuit.getStatus()
    }
  });
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Self-healing test server running on http://localhost:${PORT}`);
  logger.info('Available routes:');
  logger.info('  GET /api/service-registry - View service registry status');
  logger.info('  GET /api/watchdog-status - View watchdog status');
  logger.info('  GET /api/test-circuit?fail=true|false - Test circuit breaker');
  logger.info('  GET /api/toggle-failure?service=shade|weather&enable=true|false - Toggle service failures');
  logger.info('  GET /api/update-health?service=name&healthy=true|false - Update service health');
  logger.info('  GET /api/trigger-recovery?service=name - Trigger watchdog recovery');
  logger.info('  GET /api/dashboard - View system dashboard');
});