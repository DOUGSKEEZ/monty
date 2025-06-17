// Multi-vendor monitoring service for evaluating different monitoring platforms
// Supports DataDog, Splunk, New Relic, ELK Stack, and more

const logger = require('../utils/logger');

class MultiVendorMetricsService {
  constructor() {
    this.logger = logger.getModuleLogger('multi-vendor-metrics');
    this.isInitialized = false;
    this.providers = {};
    
    // DON'T initialize providers in constructor - wait for lazy init
  }

  // Lazy initialization to ensure env vars are loaded
  ensureInitialized() {
    if (!this.isInitialized) {
      // Load monitoring environment variables if not already loaded
      if (!process.env.NEW_RELIC_LICENSE_KEY && !process.env.DATADOG_API_KEY) {
        const dotenv = require('dotenv');
        const path = require('path');
        dotenv.config({ path: path.join(__dirname, '../../.env.monitoring') });
      }
      
      this.initializeProviders();
      this.isInitialized = true;
      this.logger.info('MultiVendorMetricsService initialized with providers:', Object.keys(this.providers));
    }
  }
  initializeProviders() {
    // DataDog - Only if ACTUALLY configured with a real key
    if (process.env.DATADOG_API_KEY && process.env.DATADOG_API_KEY !== 'your_datadog_api_key_here') {
      this.providers.datadog = this.initializeDataDog();
    }
  
    // Splunk - Only if ACTUALLY configured
    if (process.env.SPLUNK_HEC_TOKEN && process.env.SPLUNK_HEC_TOKEN !== 'your_splunk_hec_token_here' && 
        process.env.SPLUNK_HOST && process.env.SPLUNK_HOST !== 'your_splunk_host_here') {
      this.providers.splunk = this.initializeSplunk();
    }
  
    // New Relic - Only if ACTUALLY configured (you have this one!)
    if (process.env.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_LICENSE_KEY.startsWith('NRAK-')) {
      this.providers.newrelic = this.initializeNewRelic();
    }
  
    // Elastic/ELK Stack - Only if ACTUALLY configured
    if (process.env.ELASTICSEARCH_URL && process.env.ELASTICSEARCH_URL !== 'your_elasticsearch_url_here') {
      this.providers.elasticsearch = this.initializeElasticsearch();
    }
  
    // Honeycomb - Only if ACTUALLY configured
    if (process.env.HONEYCOMB_API_KEY && process.env.HONEYCOMB_API_KEY !== 'your_honeycomb_api_key_here') {
      this.providers.honeycomb = this.initializeHoneycomb();
    }
  
    // Console provider (always available for development)
    this.providers.console = this.initializeConsole();
  }
  
  initializeDataDog() {
    try {
      const StatsD = require('node-statsd');
      const client = new StatsD({
        host: process.env.DATADOG_AGENT_HOST || 'localhost',
        port: process.env.DATADOG_AGENT_PORT || 8125,
        prefix: 'monty.homeautomation.',
        tags: {
          environment: process.env.NODE_ENV || 'development',
          service: 'monty-backend'
        }
      });
      
      this.logger.info('DataDog StatsD client initialized');
      return {
        type: 'datadog',
        client: client,
        sendMetric: this.sendDataDogMetric.bind(this, client),
        sendEvent: this.sendDataDogEvent.bind(this, client)
      };
    } catch (error) {
      this.logger.error('Failed to initialize DataDog:', error.message);
      return null;
    }
  }
  
  initializeSplunk() {
    try {
      const https = require('https');
      const config = {
        host: process.env.SPLUNK_HOST,
        port: process.env.SPLUNK_PORT || 8088,
        token: process.env.SPLUNK_HEC_TOKEN,
        index: process.env.SPLUNK_INDEX || 'monty_metrics'
      };
      
      this.logger.info('Splunk HEC client initialized');
      return {
        type: 'splunk',
        config: config,
        sendMetric: this.sendSplunkMetric.bind(this, config),
        sendEvent: this.sendSplunkEvent.bind(this, config)
      };
    } catch (error) {
      this.logger.error('Failed to initialize Splunk:', error.message);
      return null;
    }
  }
  
  initializeNewRelic() {
    try {
      // New Relic will be initialized via their agent, we just need the API
      const config = {
        licenseKey: process.env.NEW_RELIC_LICENSE_KEY,
        endpoint: process.env.NEW_RELIC_METRIC_API_URL || 'https://metric-api.newrelic.com/metric/v1'
      };
      
      this.logger.info('New Relic client initialized');
      return {
        type: 'newrelic',
        config: config,
        sendMetric: this.sendNewRelicMetric.bind(this, config),
        sendEvent: this.sendNewRelicEvent.bind(this, config)
      };
    } catch (error) {
      this.logger.error('Failed to initialize New Relic:', error.message);
      return null;
    }
  }
  
  initializeElasticsearch() {
    try {
      const { Client } = require('@elastic/elasticsearch');
      const client = new Client({
        node: process.env.ELASTICSEARCH_URL,
        auth: process.env.ELASTICSEARCH_USERNAME ? {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD
        } : undefined
      });
      
      this.logger.info('Elasticsearch client initialized');
      return {
        type: 'elasticsearch',
        client: client,
        sendMetric: this.sendElasticsearchMetric.bind(this, client),
        sendEvent: this.sendElasticsearchEvent.bind(this, client)
      };
    } catch (error) {
      this.logger.error('Failed to initialize Elasticsearch:', error.message);
      return null;
    }
  }
  
  initializeHoneycomb() {
    try {
      const config = {
        apiKey: process.env.HONEYCOMB_API_KEY,
        dataset: process.env.HONEYCOMB_DATASET || 'monty-metrics',
        endpoint: 'https://api.honeycomb.io/1/events/'
      };
      
      this.logger.info('Honeycomb client initialized');
      return {
        type: 'honeycomb',
        config: config,
        sendMetric: this.sendHoneycombMetric.bind(this, config),
        sendEvent: this.sendHoneycombEvent.bind(this, config)
      };
    } catch (error) {
      this.logger.error('Failed to initialize Honeycomb:', error.message);
      return null;
    }
  }
  
  initializeConsole() {
    return {
      type: 'console',
      sendMetric: this.sendConsoleMetric.bind(this),
      sendEvent: this.sendConsoleEvent.bind(this)
    };
  }
  
  // Unified API to send metrics to all configured providers
  async sendMetric(name, value, type = 'gauge', tags = {}) {
    this.ensureInitialized(); // Lazy init here!
    
    const promises = [];
    
    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (provider && provider.sendMetric) {
        promises.push(
          provider.sendMetric(name, value, type, tags)
            .catch(error => {
              this.logger.error(`Error sending metric to ${providerName}:`, error.message);
            })
        );
      }
    }
    
    await Promise.allSettled(promises);
  }
  
  // Unified API to send events to all configured providers
  async sendEvent(title, text, tags = {}, level = 'info') {
    this.ensureInitialized(); // Lazy init here!
    
    const promises = [];
    
    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (provider && provider.sendEvent) {
        promises.push(
          provider.sendEvent(title, text, tags, level)
            .catch(error => {
              this.logger.error(`Error sending event to ${providerName}:`, error.message);
            })
        );
      }
    }
    
    await Promise.allSettled(promises);
  }
  
  // DataDog implementations
  async sendDataDogMetric(client, name, value, type, tags) {
    return new Promise((resolve, reject) => {
      const tagArray = Object.entries(tags).map(([key, val]) => `${key}:${val}`);
      
      switch (type) {
        case 'counter':
          client.increment(name, value, tagArray);
          break;
        case 'gauge':
          client.gauge(name, value, tagArray);
          break;
        case 'histogram':
          client.histogram(name, value, tagArray);
          break;
        default:
          client.gauge(name, value, tagArray);
      }
      resolve();
    });
  }
  
  async sendDataDogEvent(client, title, text, tags, level) {
    return new Promise((resolve, reject) => {
      const tagArray = Object.entries(tags).map(([key, val]) => `${key}:${val}`);
      client.event(title, text, {
        alert_type: level,
        tags: tagArray
      });
      resolve();
    });
  }
  
  // Splunk implementations
  async sendSplunkMetric(config, name, value, type, tags) {
    const https = require('https');
    
    const event = {
      event: 'metric',
      source: 'monty-backend',
      sourcetype: 'monty:metrics',
      index: config.index,
      fields: {
        metric_name: name,
        metric_value: value,
        metric_type: type,
        timestamp: new Date().toISOString(),
        ...tags
      }
    };
    
    return this.sendToSplunk(config, event);
  }
  
  async sendSplunkEvent(config, title, text, tags, level) {
    const event = {
      event: {
        title: title,
        description: text,
        level: level,
        timestamp: new Date().toISOString(),
        ...tags
      },
      source: 'monty-backend',
      sourcetype: 'monty:events',
      index: config.index
    };
    
    return this.sendToSplunk(config, event);
  }
  
  async sendToSplunk(config, event) {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(event);
      
      const options = {
        hostname: config.host,
        port: config.port,
        path: '/services/collector',
        method: 'POST',
        headers: {
          'Authorization': `Splunk ${config.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Splunk returned status ${res.statusCode}`));
        }
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
  
  // New Relic implementations
  async sendNewRelicMetric(config, name, value, type, tags) {
    const https = require('https');
    
    const metric = {
      metrics: [{
        name: name,
        type: type,
        value: value,
        timestamp: Date.now(),
        attributes: {
          service: 'monty-backend',
          ...tags
        }
      }]
    };
    
    return this.sendToNewRelic(config, metric);
  }
  
  async sendNewRelicEvent(config, title, text, tags, level) {
    // New Relic events go through their Events API
    const event = {
      eventType: 'MontyEvent',
      title: title,
      description: text,
      level: level,
      timestamp: Date.now(),
      service: 'monty-backend',
      ...tags
    };
    
    return this.sendToNewRelicEvents(config, event);
  }
  
  async sendToNewRelic(config, data) {
    const https = require('https');
    const url = require('url');
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const parsedUrl = url.parse(config.endpoint);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
          'Api-Key': config.licenseKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        if (res.statusCode === 202) {
          resolve();
        } else {
          reject(new Error(`New Relic returned status ${res.statusCode}`));
        }
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
  
  async sendToNewRelicEvents(config, event) {
    // Similar to metrics but different endpoint
    const eventsEndpoint = 'https://insights-collector.newrelic.com/v1/accounts/' + 
                          (process.env.NEW_RELIC_ACCOUNT_ID || 'unknown') + '/events';
    
    const modifiedConfig = { ...config, endpoint: eventsEndpoint };
    return this.sendToNewRelic(modifiedConfig, event);
  }
  
  // Elasticsearch implementations
  async sendElasticsearchMetric(client, name, value, type, tags) {
    const doc = {
      '@timestamp': new Date().toISOString(),
      metric_name: name,
      metric_value: value,
      metric_type: type,
      service: 'monty-backend',
      ...tags
    };
    
    try {
      await client.index({
        index: `monty-metrics-${new Date().toISOString().slice(0, 7)}`, // monthly indices
        body: doc
      });
    } catch (error) {
      throw new Error(`Elasticsearch indexing failed: ${error.message}`);
    }
  }
  
  async sendElasticsearchEvent(client, title, text, tags, level) {
    const doc = {
      '@timestamp': new Date().toISOString(),
      event_title: title,
      event_description: text,
      event_level: level,
      service: 'monty-backend',
      ...tags
    };
    
    try {
      await client.index({
        index: `monty-events-${new Date().toISOString().slice(0, 7)}`, // monthly indices
        body: doc
      });
    } catch (error) {
      throw new Error(`Elasticsearch indexing failed: ${error.message}`);
    }
  }
  
  // Honeycomb implementations
  async sendHoneycombMetric(config, name, value, type, tags) {
    const https = require('https');
    
    const event = {
      data: {
        metric_name: name,
        metric_value: value,
        metric_type: type,
        service: 'monty-backend',
        timestamp: new Date().toISOString(),
        ...tags
      }
    };
    
    return this.sendToHoneycomb(config, event);
  }
  
  async sendHoneycombEvent(config, title, text, tags, level) {
    const event = {
      data: {
        event_title: title,
        event_description: text,
        event_level: level,
        service: 'monty-backend',
        timestamp: new Date().toISOString(),
        ...tags
      }
    };
    
    return this.sendToHoneycomb(config, event);
  }
  
  async sendToHoneycomb(config, event) {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(event);
      
      const options = {
        hostname: 'api.honeycomb.io',
        port: 443,
        path: `/1/events/${config.dataset}`,
        method: 'POST',
        headers: {
          'X-Honeycomb-Team': config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Honeycomb returned status ${res.statusCode}`));
        }
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
  
  // Console implementations (for development/debugging)
  async sendConsoleMetric(name, value, type, tags) {
    // Filter out noisy HTTP metrics
    const quietMetrics = [
      'http_requests_total',
      'http_request_duration',
    ];
    
    if (quietMetrics.includes(name)) {
      return; // Skip these
    }
    
    this.logger.info(`[METRIC] ${name}: ${value} (${type})`, tags);
  }
  
  async sendConsoleEvent(title, text, tags, level) {
    this.logger.info(`[EVENT:${level.toUpperCase()}] ${title}: ${text}`, tags);
  }
  
  // Convenience methods for common metrics
  async recordHttpRequest(method, route, statusCode, duration, tags = {}) {
    await this.sendMetric('http_requests_total', 1, 'counter', {
      method,
      route,
      status_code: statusCode,
      ...tags
    });
    
    await this.sendMetric('http_request_duration', duration, 'histogram', {
      method,
      route,
      status_code: statusCode,
      ...tags
    });
  }
  
  async recordServiceHealth(service, status, tags = {}) {
    const value = status === 'ok' ? 1 : status === 'degraded' ? 0.5 : 0;
    await this.sendMetric('service_health', value, 'gauge', {
      service,
      status,
      ...tags
    });
  }
  
  async recordBusinessMetric(metric, value, tags = {}) {
    await this.sendMetric(`business.${metric}`, value, 'gauge', tags);
  }
  
  // Get status of all providers
  getProviderStatus() {
    this.ensureInitialized();
    
    const status = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      status[name] = {
        enabled: !!provider,
        type: provider?.type || 'unknown'
      };
    }
    return status;
  }
}

// Export singleton instance
const multiVendorMetrics = new MultiVendorMetricsService();
module.exports = multiVendorMetrics;
