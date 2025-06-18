/**
 * Monty Home Automation System Logging Standards
 * This file defines the standard logging actions, fields, and thresholds
 * used throughout the Monty system for consistent logging.
 */

// Log Actions by Domain
const LOG_ACTIONS = {
  // Shade Control Domain
  SHADE: {
    COMMAND: 'shade:command',
    MOVE: 'shade:move',
    SCENE: 'shade:scene',
    CALIBRATION: 'shade:calibration',
    ERROR: 'shade:error',
    STATE_CHANGE: 'shade:state_change',
    GROUP_ACTION: 'shade:group_action'
  },

  // Weather Domain
  WEATHER: {
    API_CALL: 'weather:api_call',
    CACHE_HIT: 'weather:cache_hit',
    CACHE_MISS: 'weather:cache_miss',
    TRIGGER: 'weather:trigger',
    QUOTA_EXCEEDED: 'weather:quota_exceeded',
    ERROR: 'weather:error'
  },

  // Music Domain
  MUSIC: {
    PLAYBACK_START: 'music:playback_start',
    PLAYBACK_STOP: 'music:playback_stop',
    PLAYBACK_PAUSE: 'music:playback_pause',
    VOLUME_CHANGE: 'music:volume_change',
    STATE_CHANGE: 'music:state_change',
    ERROR: 'music:error'
  },

  // Bluetooth Domain
  BLUETOOTH: {
    CONNECT: 'bluetooth:connect',
    DISCONNECT: 'bluetooth:disconnect',
    STATUS_CHANGE: 'bluetooth:status_change',
    DEVICE_FOUND: 'bluetooth:device_found',
    ERROR: 'bluetooth:error'
  },

  // Scheduler Domain
  SCHEDULER: {
    JOB_START: 'scheduler:job_start',
    JOB_COMPLETE: 'scheduler:job_complete',
    JOB_FAIL: 'scheduler:job_fail',
    TRIGGER: 'scheduler:trigger',
    ERROR: 'scheduler:error'
  },

  // System Domain
  SYSTEM: {
    STARTUP: 'system:startup',
    SHUTDOWN: 'system:shutdown',
    HEALTH_CHECK: 'system:health_check',
    CONFIG_CHANGE: 'system:config_change',
    ERROR: 'system:error'
  }
};

// Standard Fields by Event Type
const EVENT_FIELDS = {
  // Shade Event Fields
  SHADE: {
    required: ['shade_id', 'action', 'trigger', 'source'],
    optional: ['environment', 'position', 'speed', 'group_id', 'scene_id']
  },

  // Weather Event Fields
  WEATHER: {
    required: ['reason', 'cache_status'],
    optional: ['quota', 'cost', 'location', 'forecast_type', 'cache_age']
  },

  // Music Event Fields
  MUSIC: {
    required: ['state', 'trigger'],
    optional: ['track_info', 'volume', 'source', 'playlist', 'duration']
  },

  // Bluetooth Event Fields
  BLUETOOTH: {
    required: ['device_id', 'status'],
    optional: ['rssi', 'battery', 'connection_type', 'error_code']
  },

  // Scheduler Event Fields
  SCHEDULER: {
    required: ['job_id', 'trigger'],
    optional: ['schedule', 'retry_count', 'next_run', 'last_run']
  },

  // System Event Fields
  SYSTEM: {
    required: ['component', 'status'],
    optional: ['metrics', 'config_version', 'uptime', 'memory_usage']
  }
};

// Trigger Types
const TRIGGER_TYPES = {
  MANUAL: 'manual',
  SCHEDULED: 'scheduled',
  WEATHER_BASED: 'weather_based',
  SCENE: 'scene',
  API: 'api',
  VOICE: 'voice',
  AUTOMATION: 'automation'
};

// Performance Thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  WARNING: 1000,  // Log warning if operation takes longer than 1 second
  ERROR: 5000,    // Log error if operation takes longer than 5 seconds
  
  // Domain-specific thresholds
  SHADE: {
    MOVE: 3000,   // Shade movement should complete within 3 seconds
    CALIBRATION: 10000  // Calibration should complete within 10 seconds
  },
  WEATHER: {
    API_CALL: 2000,  // Weather API calls should complete within 2 seconds
    CACHE_OPERATION: 100  // Cache operations should complete within 100ms
  },
  MUSIC: {
    STATE_CHANGE: 500,  // Music state changes should complete within 500ms
    VOLUME_CHANGE: 200  // Volume changes should complete within 200ms
  },
  BLUETOOTH: {
    CONNECT: 5000,  // Bluetooth connections should complete within 5 seconds
    DISCOVERY: 10000  // Device discovery should complete within 10 seconds
  }
};

// Error Context Requirements
const ERROR_CONTEXT = {
  required: [
    'error_message',
    'error_code',
    'stack_trace',
    'timestamp',
    'component',
    'operation'
  ],
  optional: [
    'system_state',
    'retry_count',
    'recovery_actions',
    'user_context',
    'environment_state'
  ]
};

// Log Level Guidelines
const LOG_LEVEL_GUIDELINES = {
  ERROR: [
    'System crashes or unrecoverable errors',
    'Security violations',
    'Data corruption',
    'Operation timeouts exceeding ERROR threshold',
    'Failed retry attempts'
  ],
  WARN: [
    'Operation timeouts exceeding WARNING threshold',
    'Degraded performance',
    'Resource constraints',
    'Non-critical errors',
    'Recoverable failures'
  ],
  INFO: [
    'State changes',
    'User actions',
    'Scheduled operations',
    'System startup/shutdown',
    'Configuration changes'
  ],
  DEBUG: [
    'Detailed operation flow',
    'Performance metrics',
    'Cache operations',
    'API request/response details',
    'State transitions'
  ],
  TRACE: [
    'Function entry/exit',
    'Variable values',
    'Loop iterations',
    'Detailed timing information',
    'Raw data dumps'
  ]
};

module.exports = {
  LOG_ACTIONS,
  EVENT_FIELDS,
  TRIGGER_TYPES,
  PERFORMANCE_THRESHOLDS,
  ERROR_CONTEXT,
  LOG_LEVEL_GUIDELINES
}; 