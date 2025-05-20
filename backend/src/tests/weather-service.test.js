/**
 * Weather Service Test - Example test using the DI container and mocks
 * 
 * This demonstrates how to test the WeatherService using the TestContainer
 * to provide mocked dependencies.
 */

// Assuming we're using Jest or a similar testing framework
// The actual test runner isn't important for this example

const { testContainer } = require('../utils/TestContainer');
const IWeatherService = require('../interfaces/IWeatherService');
const WeatherService = require('../services/weatherService.di');

describe('WeatherService', () => {
  // Mock dependencies
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  
  const mockConfigManager = {
    get: jest.fn((key, defaultValue) => defaultValue)
  };
  
  // Setup before each test
  beforeEach(() => {
    // Register mocks in the test container
    testContainer.registerMock('logger', mockLogger);
    testContainer.registerMock('configManager', mockConfigManager);
    
    // Reset mocks
    jest.clearAllMocks();
    mockConfigManager.get.mockImplementation((key, defaultValue) => {
      // Simulate config values
      if (key === 'location.zipCode') return '80498';
      if (key === 'weather.refreshIntervalMin') return 60;
      if (key === 'weather.cacheExpirationMin') return 180;
      return defaultValue;
    });
  });
  
  // Cleanup after each test
  afterEach(() => {
    testContainer.restoreAllMocks();
  });
  
  describe('constructor', () => {
    it('should initialize with dependencies from container', () => {
      // Create service with DI
      const weatherService = new WeatherService(
        testContainer.resolve('logger'),
        testContainer.resolve('configManager')
      );
      
      // Verify service implements interface
      expect(IWeatherService.isImplementedBy(weatherService)).toBe(true);
      
      // Verify initialization logged
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
  
  describe('getCurrentWeather', () => {
    it('should return cached weather when available and not expired', async () => {
      // Create service with DI
      const weatherService = new WeatherService(
        testContainer.resolve('logger'),
        testContainer.resolve('configManager')
      );
      
      // Mock cache data
      const mockWeatherData = {
        location: { name: 'Silverthorne' },
        temperature: { current: 72 }
      };
      
      // Set up cached data
      weatherService.weatherCache = {
        timestamp: Date.now(), // Fresh timestamp
        data: mockWeatherData
      };
      
      // Call method under test
      const result = await weatherService.getCurrentWeather();
      
      // Verify results
      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.data).toBe(mockWeatherData);
      expect(mockLogger.debug).toHaveBeenCalledWith('Returning cached current weather data');
    });
    
    it('should return error when API key is not configured', async () => {
      // Create service with DI
      const weatherService = new WeatherService(
        testContainer.resolve('logger'),
        testContainer.resolve('configManager')
      );
      
      // Ensure API key is not set
      weatherService.apiKey = null;
      
      // Call method under test
      const result = await weatherService.getCurrentWeather();
      
      // Verify results
      expect(result.success).toBe(false);
      expect(result.error).toBe('Weather service not configured');
      expect(mockLogger.error).toHaveBeenCalledWith('OpenWeatherMap API key not configured');
    });
  });
  
  describe('with mock interface', () => {
    it('should create mock from interface', () => {
      // Create a mock from the IWeatherService interface
      const mockWeatherService = testContainer.mockFromInterface('weatherService', IWeatherService, {
        isConfigured: () => true
      });
      
      // Configure mock behaviors
      mockWeatherService.mockResolvedValue('getCurrentWeather', {
        success: true,
        data: { temperature: { current: 75 } },
        cached: false
      });
      
      // Test the mock
      expect(mockWeatherService.isConfigured()).toBe(true);
      
      // Use async/await to test the promise
      return mockWeatherService.getCurrentWeather().then(result => {
        expect(result.success).toBe(true);
        expect(result.data.temperature.current).toBe(75);
        expect(mockWeatherService.mockCalls('getCurrentWeather').length).toBe(1);
      });
    });
  });
});

// Note: These tests are for demonstration only and would need a proper testing framework to run