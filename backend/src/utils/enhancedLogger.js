const winston = require('winston');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load monitoring environment variables if not already loaded
const envPath = path.join(__dirname, '../../.env.monitoring');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Custom Splunk HEC Transport that sends flat JSON with dot notation
class SplunkHECTransport extends winston.transports.Http {
  constructor(options) {
    super(options);
    this.name = 'splunkHEC';
    this.splunkConfig = options.splunk;
  }

  log(info, callback) {
    
    // Create completely flat event structure for Splunk
    const flatEvent = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: info.service,
      version: info.version,
      environment: info.environment
    };

    // Function to flatten nested objects with dot notation
    const flattenObject = (obj, prefix = '') => {
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          // Recursively flatten nested objects
          flattenObject(value, newKey);
        } else {
          // Add primitive values to flat event
          flatEvent[newKey] = value;
        }
      });
    };

    // Flatten all other fields from info object
    Object.keys(info).forEach(key => {
      if (!['timestamp', 'level', 'message', 'service', 'version', 'environment', 'meta', 'splat'].includes(key) && 
          !key.startsWith('Symbol(')) {
        const value = info[key];
        
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          flattenObject(value, key);
        } else {
          flatEvent[key] = value;
        }
      }
    });

    // Remove winston internal fields
    delete flatEvent.meta;
    delete flatEvent.splat;
    delete flatEvent[Symbol.for('level')];
    delete flatEvent[Symbol.for('message')];

    // Create Splunk HEC payload
    const splunkPayload = {
      time: Math.floor(Date.now() / 1000),
      event: flatEvent,
      source: this.splunkConfig.source,
      sourcetype: this.splunkConfig.sourcetype,
      index: this.splunkConfig.index
    };

    // Send to Splunk HEC
    this.sendToSplunk(splunkPayload, callback);
  }

  sendToSplunk(payload, callback) {
    const postData = JSON.stringify(payload);
    
    
    const options = {
      hostname: this.splunkConfig.host,
      port: this.splunkConfig.port,
      path: this.splunkConfig.path,
      method: 'POST',
      headers: {
        'Authorization': `Splunk ${this.splunkConfig.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      // Handle SSL for Splunk Cloud 
      // Note: For production, ensure proper SSL certificate validation
      rejectUnauthorized: process.env.SPLUNK_VERIFY_SSL !== 'false',
      servername: this.splunkConfig.host
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          callback(null, true);
        } else {
          // Only log errors, not debug info
          console.error('Splunk HEC error:', res.statusCode, responseData);
          callback(new Error(`Splunk HEC error: ${res.statusCode} ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      // Only log actual connection errors, not debug info
      if (error.code !== 'ECONNREFUSED' && error.code !== 'SELF_SIGNED_CERT_IN_CHAIN') {
        console.error('Splunk connection error:', error.message);
      }
      // Call callback with null to prevent winston from crashing
      callback(null, false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      callback(null, false);
    });

    req.write(postData);
    req.end();
  }
}

// Standard log actions/events
const LOG_ACTIONS = {
  // System events
  SYSTEM_STARTUP: 'system:startup',
  SYSTEM_SHUTDOWN: 'system:shutdown',
  SYSTEM_ERROR: 'system:error',
  
  // API events
  API_REQUEST: 'api:request',
  API_RESPONSE: 'api:response',
  API_ERROR: 'api:error',
  
  // Database events
  DB_QUERY: 'db:query',
  DB_ERROR: 'db:error',
  
  // Cache events
  CACHE_HIT: 'cache:hit',
  CACHE_MISS: 'cache:miss',
  CACHE_ERROR: 'cache:error',
  
  // External service events
  EXTERNAL_REQUEST: 'external:request',
  EXTERNAL_RESPONSE: 'external:response',
  EXTERNAL_ERROR: 'external:error',
  
  // Authentication events
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_ERROR: 'auth:error',
  
  // Business events
  BUSINESS_OPERATION: 'business:operation',
  BUSINESS_ERROR: 'business:error'
};

// Log levels with their priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

class EnhancedLogger {
  constructor(options = {}) {
    this.serviceName = options.serviceName || process.env.SERVICE_NAME || 'monty-backend';
    this.version = options.version || process.env.SERVICE_VERSION || '1.0.0';
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.correlationId = null;
    this.context = {};
    
    // Initialize transports
    const transports = this._initializeTransports();
    
    // Create winston logger
    this.logger = winston.createLogger({
      levels: LOG_LEVELS,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: this.serviceName,
        version: this.version,
        environment: this.environment
      },
      transports
    });
  }

  _initializeTransports() {
    const transports = [];

    // Console transport for development
    if (this.environment !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, module }) => {
              return module ? `${level} [${module}]: ${message}` : `${level}: ${message}`;
            })
          )
        })
      );
    }

    // Custom Splunk HEC transport when enabled
    if (process.env.SPLUNK_ENABLED === 'true') {
      const splunkConfig = {
        token: process.env.SPLUNK_HEC_TOKEN,
        host: process.env.SPLUNK_HOST,
        port: process.env.SPLUNK_PORT || 8088,
        path: process.env.SPLUNK_HEC_PATH || '/services/collector/event',
        ssl: process.env.SPLUNK_SSL === 'true',
        index: process.env.SPLUNK_INDEX || 'monty',
        source: process.env.SPLUNK_SOURCE || 'monty:logs',
        sourcetype: process.env.SPLUNK_SOURCETYPE || 'monty:logs'
      };

      const splunkTransport = new SplunkHECTransport({
        splunk: splunkConfig,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      });
      
      transports.push(splunkTransport);
    }

    return transports;
  }

  _formatMessage(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
      correlationId: this.correlationId,
      ...this.context
    };

    // Format error objects
    if (meta.error instanceof Error) {
      logEntry.error = {
        message: meta.error.message,
        stack: meta.error.stack,
        name: meta.error.name,
        code: meta.error.code
      };
    }

    return logEntry;
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
    return this;
  }

  setCorrelationId(id = null) {
    this.correlationId = id || uuidv4();
    return this;
  }

  startTimer(operation) {
    const startTime = process.hrtime();
    return {
      end: (meta = {}) => {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds
        this.info(`${operation} completed`, {
          ...meta,
          duration,
          operation
        });
        return duration;
      }
    };
  }

  error(message, meta = {}) {
    this.logger.error(this._formatMessage('error', message, meta));
  }

  warn(message, meta = {}) {
    this.logger.warn(this._formatMessage('warn', message, meta));
  }

  info(message, meta = {}) {
    this.logger.info(this._formatMessage('info', message, meta));
  }

  debug(message, meta = {}) {
    this.logger.debug(this._formatMessage('debug', message, meta));
  }

  trace(message, meta = {}) {
    this.logger.trace(this._formatMessage('trace', message, meta));
  }

  // Convenience methods for common log actions
  logApiRequest(req, res, duration) {
    this.info('API Request', {
      action: LOG_ACTIONS.API_REQUEST,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
  }

  logApiError(req, error) {
    this.error('API Error', {
      action: LOG_ACTIONS.API_ERROR,
      method: req.method,
      url: req.url,
      error
    });
  }

  logDatabaseQuery(query, duration) {
    this.debug('Database Query', {
      action: LOG_ACTIONS.DB_QUERY,
      query,
      duration
    });
  }

  logDatabaseError(error) {
    this.error('Database Error', {
      action: LOG_ACTIONS.DB_ERROR,
      error
    });
  }

  logExternalRequest(service, request, duration) {
    this.info('External Service Request', {
      action: LOG_ACTIONS.EXTERNAL_REQUEST,
      service,
      request,
      duration
    });
  }

  logExternalError(service, error) {
    this.error('External Service Error', {
      action: LOG_ACTIONS.EXTERNAL_ERROR,
      service,
      error
    });
  }
}

// Export a singleton instance
const logger = new EnhancedLogger();
module.exports = {
  logger,
  LOG_ACTIONS,
  EnhancedLogger
}; 