const { Queue, Worker } = require('bullmq');
const config = require('../config');
const logger = require('../utils/logger');
const redisService = require('./redis.service');
const converterService = require('./converter.service');
const fileService = require('./file.service');

class QueueService {
  constructor() {
    this.queue = null;
    this.worker = null;
    this.activeProcesses = new Map(); // Track running processes by jobId
  }

  initialize() {
    const redisConfig = config.redis;
    
    const connection = {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
    };

    // Create queue for adding jobs
    this.queue = new Queue('conversion', { connection });

    // Create worker for processing jobs
    this.worker = new Worker('conversion', async (job) => {
      const { jobId, inputPath, outputPath, options } = job.data;
      
      logger.info(`Processing job ${jobId}`, { inputPath, options });

      try {
        // Check if job still exists in Redis (might have been canceled)
        const jobData = await redisService.getJob(jobId);
        if (!jobData) {
          logger.info(`Job ${jobId} was canceled, skipping processing`);
          return { success: false, error: 'Job was canceled' };
        }

        // Update status to processing
        await redisService.updateJobStatus(jobId, 'processing', 0);

        // Convert - this returns the child process
        const conversionProcess = await converterService.convertWithProcess(
          inputPath,
          outputPath,
          options
        );

        // Store the process so we can kill it if canceled
        this.activeProcesses.set(jobId, conversionProcess.process);

        // Wait for conversion to complete
        const result = await conversionProcess.promise;

        // Clean up process tracking
        this.activeProcesses.delete(jobId);

        if (result.success) {
          await redisService.updateJobStatus(jobId, 'completed', 100);
          logger.info(`Job ${jobId} conversion successful`, {
            facets: result.mesh_info_before?.facets,
            outputSize: result.output_size,
          });
        } else {
          await redisService.updateJobStatus(jobId, 'failed', 0, result.error);
          logger.error(`Job ${jobId} failed:`, result.error);
        }

        return result;

      } catch (error) {
        this.activeProcesses.delete(jobId);
        
        // Only update Redis if job still exists
        const jobData = await redisService.getJob(jobId);
        if (jobData) {
          await redisService.updateJobStatus(jobId, 'failed', 0, error.message);
        }
        
        logger.error(`Job ${jobId} error:`, error);
        throw error;
      }
    }, { 
      connection,
      concurrency: config.jobs.maxConcurrent,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 10 }
    });

    // Worker event handlers
    this.worker.on('completed', (job) => {
      logger.info(`Job convert-${job.data.jobId} completed`, { jobId: job.data.jobId });
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job convert-${job.data.jobId} failed`, { 
        jobId: job?.data?.jobId, 
        error: err.message 
      });
    });

    logger.info('Queue service initialized');
    return this.queue;
  }

  async addJob(jobId, inputPath, outputPath, options) {
    if (!this.queue) {
      throw new Error('Queue not initialized');
    }

    await this.queue.add(
      'convert',
      {
        jobId,
        inputPath,
        outputPath,
        options,
      },
      {
        jobId: `convert-${jobId}`,
      }
    );

    logger.info(`Job ${jobId} added to queue`, { queueJobId: `convert-${jobId}` });
  }

  async cancelJob(jobId) {
    logger.info(`[cancelJob] START - Job ${jobId}`);
    
    if (!this.queue) {
      logger.error(`[cancelJob] Queue not initialized!`);
      throw new Error('Queue not initialized');
    }

    logger.info(`[cancelJob] Canceling job ${jobId}`);

    // 1. Kill the tracked process if it exists
    const process = this.activeProcesses.get(jobId);
    logger.info(`[cancelJob] Tracked process for ${jobId}: ${process ? `PID ${process.pid}` : 'none'}`);
    
    if (process && !process.killed) {
      logger.info(`[cancelJob] Killing tracked FreeCAD process for job ${jobId}`, { pid: process.pid });
      try {
        process.kill('SIGKILL');
        this.activeProcesses.delete(jobId);
        logger.info(`[cancelJob] Tracked process killed for job ${jobId}`);
      } catch (error) {
        logger.error(`[cancelJob] Failed to kill tracked process for job ${jobId}:`, error);
      }
    }

	// 2. AGGRESSIVE: Kill ALL FreeCAD processes (in case tracking failed)
	logger.info(`[cancelJob] Killing all FreeCAD processes as fallback`);
	const { exec } = require('child_process');
	exec('ps aux | grep freecadcmd | grep -v grep | awk \'{print $2}\' | xargs -r kill -9', (error, stdout, stderr) => {
	  if (error) {
		logger.error(`[cancelJob] kill error:`, error);
	  } else {
		logger.info(`[cancelJob] All FreeCAD processes killed via kill command`);
	  }
	});

    // 3. Remove from BullMQ queue
    logger.info(`[cancelJob] Removing from BullMQ queue: convert-${jobId}`);
    try {
      const job = await this.queue.getJob(`convert-${jobId}`);
      if (job) {
        await job.remove();
        logger.info(`[cancelJob] Job ${jobId} removed from queue`);
      } else {
        logger.info(`[cancelJob] Job ${jobId} not found in queue`);
      }
    } catch (error) {
      logger.error(`[cancelJob] Failed to remove job ${jobId} from queue:`, error);
    }
    
    logger.info(`[cancelJob] END - Job ${jobId}`);
  }

  async getQueueStats() {
    if (!this.queue) {
      return null;
    }

    const waiting = await this.queue.getWaitingCount();
    const active = await this.queue.getActiveCount();
    const completed = await this.queue.getCompletedCount();
    const failed = await this.queue.getFailedCount();

    return {
      waiting,
      active,
      completed,
      failed,
      activeProcesses: this.activeProcesses.size,
    };
  }
}

module.exports = new QueueService();
