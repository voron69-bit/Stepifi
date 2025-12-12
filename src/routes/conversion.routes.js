const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');
const config = require('../config');
const logger = require('../utils/logger');
const redisService = require('../services/redis.service');
const queueService = require('../services/queue.service');
const fileService = require('../services/file.service');
const converterService = require('../services/converter.service');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.paths.uploads);
  },
  filename: (req, file, cb) => {
    const jobId = uuidv4();
    req.jobId = jobId;
    // Preserve original extension (.stl or .3mf)
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${jobId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.upload.allowedExtensions.includes(ext)) {
      return cb(new Error('Only STL and 3MF files are allowed'));
    }
    cb(null, true);
  },
});

// Error handler for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${Math.round(config.upload.maxFileSize / 1024 / 1024)}MB`,
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
};

/**
 * POST /api/convert
 * Upload and convert STL/3MF file
 */
router.post(
  '/convert',
  upload.single('meshFile'),
  handleUploadError,
  [
    body('tolerance')
      .optional()
      .isFloat({ min: config.conversion.minTolerance, max: config.conversion.maxTolerance })
      .withMessage(`Tolerance must be between ${config.conversion.minTolerance} and ${config.conversion.maxTolerance}`),
    body('repair')
      .optional()
      .isBoolean()
      .withMessage('Repair must be a boolean'),
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded file on validation error
        if (req.file) {
          await fileService.deleteFile(req.file.path);
        }
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const jobId = req.jobId;
      const inputPath = req.file.path;
      const outputPath = fileService.getConvertedPath(`${jobId}.step`);

      const options = {
        tolerance: parseFloat(req.body.tolerance) || config.conversion.defaultTolerance,
        repair: req.body.repair !== 'false',
        originalFilename: req.file.originalname,
        inputFormat: path.extname(req.file.originalname).toLowerCase().substring(1), // 'stl' or '3mf'
      };

      // Create job record
      const ttlSeconds = config.jobs.ttlHours * 60 * 60;
      const jobData = {
        id: jobId,
        status: 'queued',
        progress: 0,
        originalFilename: req.file.originalname,
        fileSize: req.file.size,
        inputFormat: options.inputFormat,
        options,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      };

      await redisService.setJob(jobId, jobData, ttlSeconds);

      // Add to queue
      await queueService.addJob(jobId, inputPath, outputPath, options);

      logger.info(`Conversion job created: ${jobId}`, {
        filename: req.file.originalname,
        size: req.file.size,
        format: options.inputFormat,
        tolerance: options.tolerance,
      });

      res.status(202).json({
        success: true,
        jobId,
        message: 'Conversion job queued',
        expiresAt: jobData.expiresAt,
      });

    } catch (err) {
      logger.error('Convert endpoint error:', err);

      // Clean up on error
      if (req.file) {
        await fileService.deleteFile(req.file.path);
      }

      res.status(500).json({ success: false, error: 'Failed to process upload' });
    }
  }
);

/**
 * GET /api/job/:jobId
 * Get job status
 */
router.get(
  '/job/:jobId',
  [
    param('jobId').isUUID(4).withMessage('Invalid job ID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { jobId } = req.params;
      const job = await redisService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or expired',
        });
      }

      // Get TTL
      const ttl = await redisService.getJobTTL(jobId);

      res.json({
        success: true,
        job: {
          ...job,
          expiresIn: ttl > 0 ? ttl : 0,
        },
      });

    } catch (err) {
      logger.error('Job status error:', err);
      res.status(500).json({ success: false, error: 'Failed to get job status' });
    }
  }
);

/**
 * GET /api/jobs
 * Get all active jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await redisService.getAllJobs();

    res.json({
      success: true,
      jobs: jobs,
      count: jobs.length,
    });

  } catch (err) {
    logger.error('Get all jobs error:', err);
    res.status(500).json({ success: false, error: 'Failed to get jobs' });
  }
});

/**
 * GET /api/download/:jobId
 * Download converted STEP file
 */
router.get(
  '/download/:jobId',
  [
    param('jobId').isUUID(4).withMessage('Invalid job ID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { jobId } = req.params;
      const job = await redisService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or expired',
        });
      }

      if (job.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: `Job is not complete. Status: ${job.status}`,
        });
      }

      const stepPath = fileService.getConvertedPath(`${jobId}.step`);

      if (!(await fileService.fileExists(stepPath))) {
        return res.status(404).json({
          success: false,
          error: 'Converted file not found',
        });
      }

      // Generate download filename
      const originalName = job.originalFilename || 'converted';
      const downloadName = originalName.replace(/\.(stl|3mf)$/i, '') + '.step';

      logger.info(`File download: ${jobId}`, { downloadName });

      res.download(stepPath, downloadName);

    } catch (err) {
      logger.error('Download error:', err);
      res.status(500).json({ success: false, error: 'Download failed' });
    }
  }
);

/**
 * POST /api/analyze
 * Analyze STL/3MF file without converting
 */
router.post(
  '/analyze',
  upload.single('meshFile'),
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const inputFormat = path.extname(req.file.originalname).toLowerCase().substring(1);
      const result = await converterService.getMeshInfo(req.file.path, inputFormat);

      // Clean up uploaded file
      await fileService.deleteFile(req.file.path);

      if (result.success) {
        res.json({
          success: true,
          filename: req.file.originalname,
          fileSize: req.file.size,
          inputFormat: inputFormat,
          meshInfo: result.mesh_info_before,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Analysis failed',
        });
      }

    } catch (err) {
      logger.error('Analyze error:', err);

      if (req.file) {
        await fileService.deleteFile(req.file.path);
      }

      res.status(500).json({ success: false, error: 'Analysis failed' });
    }
  }
);

/**
 * DELETE /api/job/:jobId
 * Cancel/delete a job
 */
router.delete(
  '/job/:jobId',
  [
    param('jobId').isUUID(4).withMessage('Invalid job ID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { jobId } = req.params;
      const job = await redisService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      // Delete files
      await fileService.deleteJobFiles(jobId);

      // Delete from Redis
      await redisService.deleteJob(jobId);

      logger.info(`Job deleted: ${jobId}`);

      res.json({
        success: true,
        message: 'Job deleted',
      });

    } catch (err) {
      logger.error('Delete job error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete job' });
    }
  }
);

module.exports = router;
