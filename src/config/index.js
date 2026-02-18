const path = require('path');

module.exports = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  bullBoardPort: parseInt(process.env.BULL_BOARD_PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
  },

  // File paths
  paths: {
    uploads: path.join(__dirname, '../../uploads'),
    converted: path.join(__dirname, '../../converted'),
    logs: path.join(__dirname, '../../logs'),
    pythonScripts: path.join(__dirname, '../scripts'),
  },

  // Upload settings
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: [
      // STL mime types
      'application/sla',
      'application/vnd.ms-pki.stl',
      'application/x-navistyle',
      'model/stl',
      'model/x.stl-ascii',
      'model/x.stl-binary',
      // 3MF mime types
      'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
      'model/3mf',
      'application/x-3mf',
      // Generic
      'application/octet-stream', // Binary files often detected as this
    ],
    allowedExtensions: ['.stl', '.3mf'],
  },

  // Conversion settings
  conversion: {
    defaultTolerance: parseFloat(process.env.DEFAULT_TOLERANCE) || 0.01,
    minTolerance: 0.001,
    maxTolerance: 1.0,
    timeout: parseInt(process.env.CONVERSION_TIMEOUT, 10) || 1800000, // 30 minutes
    repairMesh: process.env.REPAIR_MESH !== 'false', // Default true
  },

  // Job settings
  jobs: {
    ttlHours: parseInt(process.env.JOB_TTL_HOURS, 10) || 24,
    cleanupCron: process.env.CLEANUP_CRON || '*/15 * * * *',
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_JOBS, 10) || 2,
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 2,
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000, // 1000 requests per window
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
