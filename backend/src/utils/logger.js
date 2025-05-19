const winston = require('winston');
const { format } = require('winston');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../../logs');

// Function to ensure logs directory with error handling and fallback
function ensureLogsDirectory() {
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      return logsDir;
    }
    return logsDir;
  } catch (error) {
    console.error(`Failed to create logs directory at ${logsDir}: ${error.message}`);
    console.warn('Falling back to system temp directory for logs');
    
    // Fallback to system temp directory
    const tempLogsDir = path.join(os.tmpdir(), 'monty-logs');
    try {
      if (!fs.existsSync(tempLogsDir)) {
        fs.mkdirSync(tempLogsDir, { recursive: true });
      }
      return tempLogsDir;
    } catch (fallbackError) {
      console.error(`Failed to create fallback logs directory: ${fallbackError.message}`);
      console.warn('Logging to files will be disabled, console only');
      return null;
    }
  }
}

// Get logs directory with fallback
const activeLogsDir = ensureLogsDirectory();

// Custom format to add colorization and structure to console logs
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...metadata }) => {
    let meta = '';
    if (Object.keys(metadata).length > 0 && metadata.service !== 'monty-server') {
      meta = JSON.stringify(metadata);
    }
    return `${timestamp} [${level}]: ${message} ${meta}`;
  })
);

// Create a Winston logger with fallback handling
function createLogger() {
  // Base logger configuration
  const loggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.json()
    ),
    defaultMeta: { 
      service: 'monty-server',
      hostname: os.hostname(),
      pid: process.pid,
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development'
    },
    transports: [
      // Console output always enabled
      new winston.transports.Console({ 
        format: consoleFormat
      })
    ],
    // Exit on error? Set to false for production
    exitOnError: false
  };
  
  // Add file transports only if we have a valid logs directory
  if (activeLogsDir) {
    // Add file transports
    loggerConfig.transports.push(
      // Write logs with level 'error' and below to error.log
      new winston.transports.File({ 
        filename: path.join(activeLogsDir, 'error.log'), 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      // Write all logs to combined.log
      new winston.transports.File({ 
        filename: path.join(activeLogsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      })
    );
    
    // Configure exception handling with file transport
    loggerConfig.exceptionHandlers = [
      new winston.transports.File({ 
        filename: path.join(activeLogsDir, 'exceptions.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      })
    ];
  } else {
    // Configure exception handling for console only
    loggerConfig.exceptionHandlers = [
      new winston.transports.Console({ 
        format: consoleFormat
      })
    ];
  }
  
  // Create and return the configured logger
  return winston.createLogger(loggerConfig);
}

const logger = createLogger();

// Utility function to create child loggers for different modules
logger.getModuleLogger = function(moduleName) {
  return logger.child({ module: moduleName });
};

// Log HTTP requests with error handling
logger.httpLogger = function(req, res, next) {
  const start = Date.now();
  
  // Track if we've already logged (to avoid duplicate logs)
  let logged = false;
  
  // Function to log request details
  const logRequest = (event, error = null) => {
    if (logged) return;
    logged = true;
    
    const duration = Date.now() - start;
    const logObject = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      event
    };
    
    if (error) {
      logObject.error = error.message;
      logObject.stack = error.stack;
      logger.error(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - Error`, logObject);
    } else if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode}`, logObject);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode}`, logObject);
    } else {
      logger.debug(`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode}`, logObject);
    }
  };
  
  // Log when the response is finished
  res.on('finish', () => logRequest('finish'));
  
  // Log on close event (client may have disconnected before response was sent)
  res.on('close', () => {
    if (!res.writableEnded) {
      logRequest('close-incomplete');
    }
  });
  
  // Log on error events
  res.on('error', (error) => {
    logRequest('error', error);
  });
  
  next();
};

// Function to log system health information
logger.logSystemHealth = function() {
  try {
    const memoryUsage = process.memoryUsage();
    const healthInfo = {
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      logsDirectory: activeLogsDir || 'console-only'
    };
    
    logger.info('System health check', { systemHealth: healthInfo });
  } catch (error) {
    logger.error(`Error logging system health: ${error.message}`);
  }
};

// Set up periodic system health logging
setInterval(() => {
  logger.logSystemHealth();
}, 3600000); // Log every hour

module.exports = logger;