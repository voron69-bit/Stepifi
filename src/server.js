const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const config = require('./config');
const logger = require('./utils/logger');
const redisService = require('./services/redis.service');
const queueService = require('./services/queue.service');
const fileService = require('./services/file.service');
const cleanupService = require('./services/cleanup.service');
const converterService = require('./services/converter.service');
const conversionRoutes = require('./routes/conversion.routes');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],

        // Allow local scripts + required CDNs
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "cdnjs.cloudflare.com",
          "cdn.jsdelivr.net",
        ],

        // Allow local styles + Google Fonts + CDN styles
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "cdnjs.cloudflare.com",
          "fonts.googleapis.com",
        ],

        // Allow required font sources
        fontSrc: [
          "'self'",
          "fonts.gstatic.com",
          "cdnjs.cloudflare.com"
        ],

        imgSrc: ["'self'", "data:", "blob:"],

        // API calls
        connectSrc: ["'self'"],

        // Allow loading WASM or workers if needed later
        workerSrc: ["'self'", "blob:"],
      },
    },
  })
);


app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', conversionRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const redisHealthy = await redisService.healthCheck();
  const freecadCheck = await converterService.checkFreecad();
  
  const healthy = redisHealthy && freecadCheck.available;
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      redis: redisHealthy ? 'connected' : 'disconnected',
      freecad: freecadCheck.available ? 'available' : 'not found',
      freecadVersion: freecadCheck.version || null,
    },
    config: {
      maxFileSize: `${Math.round(config.upload.maxFileSize / 1024 / 1024)}MB`,
      jobTTL: `${config.jobs.ttlHours} hours`,
      defaultTolerance: config.conversion.defaultTolerance,
    },
  });
});

// System stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const cleanupStats = await cleanupService.getStats();
    res.json({
      success: true,
      stats: cleanupStats,
    });
  } catch (err) {
    logger.error('Stats error:', err);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Initialize and start server
async function start() {
  try {
    // Ensure directories exist
    await fileService.ensureDirectories();
    
    // Connect to Redis
    redisService.connect();
    
    // Initialize queue
    const queue = queueService.initialize();
    
    // Setup Bull Board for queue monitoring
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
    });
    
    // Create separate express app for Bull Board (different port for security)
    const bullBoardApp = express();
    bullBoardApp.use('/admin/queues', serverAdapter.getRouter());
    
    // Start cleanup service
    cleanupService.start();
    
    // Check FreeCAD availability
    const freecadCheck = await converterService.checkFreecad();
    if (!freecadCheck.available) {
      logger.warn('FreeCAD (freecadcmd) not found. Conversions will fail.');
    } else {
      logger.info(`FreeCAD available: ${freecadCheck.version}`);
    }
    
    // Start main server
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });
    
    // Start Bull Board server
    bullBoardApp.listen(config.bullBoardPort, () => {
      logger.info(`Bull Board running on port ${config.bullBoardPort}/admin/queues`);
    });
    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      cleanupService.stop();
      await queueService.close();
      await redisService.disconnect();
      
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
