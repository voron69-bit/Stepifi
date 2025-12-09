const { Queue, Worker } = require('bullmq');
const config = require('../config');
const logger = require('../utils/logger');
const converterService = require('./converter.service');
const redisService = require('./redis.service');

class QueueService {
  constructor() {
    this.queue = null;
    this.worker = null;
  }

  initialize() {
    const connection = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    };

    // Create queue
    this.queue = new Queue('stl-conversion', {
      connection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 24 * 3600, // Keep failed jobs for 24 hours
        },
        attempts: config.jobs.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    // Create worker
    this.worker = new Worker(
      'stl-conversion',
      async (job) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: config.jobs.maxConcurrent,
        limiter: {
          max: 5,
          duration: 1000,
        },
      }
    );

    // Worker events
    this.worker.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed`, { jobId: job.data.jobId });
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed: ${err.message}`, { 
        jobId: job?.data?.jobId,
        error: err.message 
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Worker error:', err);
    });

    logger.info('Queue service initialized');
    return this.queue;
  }

  async processJob(job) {
    const { jobId, inputPath, outputPath, options } = job.data;
    
    logger.info(`Processing job ${jobId}`, { inputPath, options });
    
    try {
      // Update job status to processing
      await redisService.updateJob(jobId, { 
        status: 'processing',
        progress: 10,
        message: 'Starting conversion...'
      });
      
      // Run conversion
      const result = await converterService.convert(inputPath, outputPath, options);
      
      if (result.success) {
        // Update job with success
        await redisService.updateJob(jobId, {
          status: 'completed',
          progress: 100,
          message: 'Conversion complete',
          result: {
            outputPath,
            meshInfo: result.mesh_info_before,
            meshInfoAfter: result.mesh_info_after,
            repairs: result.repairs,
            isSolid: result.is_solid,
            outputSize: result.output_size,
          },
        });
        
        logger.info(`Job ${jobId} conversion successful`, { 
          facets: result.mesh_info_before?.facets,
          outputSize: result.output_size 
        });
        
        return result;
      } else {
        throw new Error(result.error || 'Conversion failed');
      }
    } catch (err) {
      // Update job with failure
      await redisService.updateJob(jobId, {
        status: 'failed',
        progress: 0,
        message: err.message,
        error: err.message,
      });
      
      throw err;
    }
  }

  async addJob(jobId, inputPath, outputPath, options = {}) {
    if (!this.queue) {
      throw new Error('Queue not initialized');
    }
    
    const job = await this.queue.add(
      'convert',
      {
        jobId,
        inputPath,
        outputPath,
        options,
      },
      {
        jobId: `convert-${jobId}`,
        priority: options.priority || 0,
      }
    );
    
    logger.info(`Job ${jobId} added to queue`, { queueJobId: job.id });
    return job;
  }

  getQueue() {
    return this.queue;
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    logger.info('Queue service closed');
  }
}

module.exports = new QueueService();
