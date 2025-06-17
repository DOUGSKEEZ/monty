'use strict'
/**
 * New Relic agent configuration for Monty Home Automation
 */
exports.config = {
  app_name: ['monty-home-automation'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'trace', // Changed to 'trace' for debugging
    filepath: 'stdout'
  },
  // Add this to help debug
  startup_timeout: 10000, // Give 10 seconds to start
  
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true
    }
  },
  
  allow_all_headers: true,
  distributed_tracing: {
    enabled: true
  },
  slow_sql: {
    enabled: false
  },
  attributes: {
    include: [
      'request.headers.user-agent',
      'response.headers.content-type'
    ],
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.x*'
    ]
  },
  rules: {
    ignore: [
      //'^/api/health$',
      '^/metrics$',
      '^/ping$'
    ]
  },
  error_collector: {
    ignore_status_codes: [404, 401]
  },
  transaction_tracer: {
    record_sql: 'off',
    explain_threshold: 1000
  }
}
