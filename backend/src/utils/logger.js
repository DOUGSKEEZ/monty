const winston = require('winston');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

// Custom Splunk HEC Transport that sends flat JSON
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
    
    // Log what we're sending to Splunk for debugging (only in development)
    if (process.env.NODE_ENV === 'development' && process.env.SPLUNK_DEBUG === 'true') {
      console.log('🔹 Splunk HEC Payload:', JSON.stringify(payload, null, 2));
    }
    
    const options = {
      hostname: this.splunkConfig.host,
      port: this.splunkConfig.port,
      path: this.splunkConfig.path,
      method: 'POST',
      headers: {
        'Authorization': `Splunk ${this.splunkConfig.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          if (process.env.SPLUNK_DEBUG === 'true') {
            console.log('✅ Splunk HEC success:', res.statusCode);
          }
          callback(null, true);
        } else {
          callback(new Error(`Splunk HEC error: ${res.statusCode} ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      // Don't crash the application if Splunk is unreachable
      if (process.env.SPLUNK_DEBUG === 'true') {
        console.log('❌ Splunk HEC connection failed:', error.message);
      }
      // Call callback with null to prevent winston from crashing
      callback(null, false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      if (process.env.SPLUNK_DEBUG === 'true') {
        console.log('⏱️ Splunk HEC request timeout');
      }
      callback(null, false);
    });

    req.write(postData);
    req.end();
  }
}

// Standard log actions/events
const LOG_ACTIONS = {
  // System events
  SYSTEM: {
    STARTUP: 'system:startup',
    SHUTDOWN: 'system:shutdown',
    ERROR: 'system:error',
    API_REQUEST: 'api:request',
    API_RESPONSE: 'api:response'
  },
  // Database events
  DATABASE: {
    QUERY: 'db:query',
    ERROR: 'db:error'
  },
  // Cache events
  CACHE: {
    HIT: 'cache:hit',
    MISS: 'cache:miss',
    ERROR: 'cache:error'
  },
  // External service events
  EXTERNAL: {
    REQUEST: 'external:request',
    RESPONSE: 'external:response',
    ERROR: 'external:error'
  }
};

// Log levels with their priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

class Logger {
  constructor() {
    this.serviceName = process.env.SERVICE_NAME || 'monty-backend';
    this.version = process.env.SERVICE_VERSION || '1.0.0';
    this.environment = process.env.NODE_ENV || 'development';
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

    // Console transport - always enabled for journalctl visibility
    // Production: simpler format without colors (systemd captures plain text)
    // Development: colorized output for terminal readability
    const consoleFormat = this.environment === 'production'
      ? winston.format.combine(
          winston.format.printf(({ level, message, module, correlationId }) => {
            const prefix = module ? `[${module}]` : '';
            const corr = correlationId ? ` (${correlationId.substring(0, 8)})` : '';
            return `${level.toUpperCase()} ${prefix}: ${message}${corr}`;
          })
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, module, correlationId }) => {
            const prefix = module ? `[${module}]` : '';
            const corr = correlationId ? ` (${correlationId.substring(0, 8)})` : '';
            return `${level} ${prefix}: ${message}${corr}`;
          })
        );

    transports.push(new winston.transports.Console({ format: consoleFormat }));

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

      transports.push(
        new SplunkHECTransport({
          splunk: splunkConfig,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
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

  // Get a logger instance with module context
  getModuleLogger(moduleName) {
    const moduleLogger = Object.create(this);
    moduleLogger.context = { ...this.context, module: moduleName };
    return moduleLogger;
  }
}

// Create singleton instance
const logger = new Logger();

// Express middleware for request logging
const httpLogger = (req, res, next) => {
  // Generate or use existing correlation ID
  const correlationId = req.headers['x-correlation-id'] || logger.setCorrelationId().correlationId;
  
  // Set correlation ID in response headers
  res.setHeader('x-correlation-id', correlationId);
  
  // Add request context to logger
  logger.setContext({
    correlationId,
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Track response time
  const startTime = process.hrtime();

  // Log response when finished (simplified for console, detailed for JSON)
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;

    // Create clean message for console display
    const statusText = res.statusCode < 400 ? 'OK' : 'ERROR';
    const cleanMessage = `${req.method} ${req.url} ${res.statusCode} ${statusText} ${Math.round(duration)}ms`;

    logger.info(cleanMessage, {
      action: LOG_ACTIONS.SYSTEM.API_RESPONSE,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  });

  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    action: LOG_ACTIONS.SYSTEM.ERROR,
    error: err,
    method: req.method,
    url: req.url,
    statusCode: err.status || 500
  });

  next(err);
};

// Export both legacy and enhanced interfaces
module.exports = {
  logger,
  LOG_LEVELS,
  LOG_ACTIONS,
  httpLogger,
  errorLogger,
  setCorrelationId: (id) => logger.setCorrelationId(id),
  setContext: (context) => logger.setContext(context),
  startTimer: (operation) => logger.startTimer(operation),
  getModuleLogger: (moduleName) => logger.getModuleLogger(moduleName)
};