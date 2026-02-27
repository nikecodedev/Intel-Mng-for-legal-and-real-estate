import Queue from 'bull';
import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface JobData {
  [key: string]: unknown;
}

export interface JobOptions {
  attempts?: number; // Number of retry attempts
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number; // Delay in milliseconds
  };
  delay?: number; // Initial delay in milliseconds
  removeOnComplete?: boolean | number; // Keep completed jobs
  removeOnFail?: boolean | number; // Keep failed jobs
  priority?: number; // Job priority (higher = more important)
  timeout?: number; // Job timeout in milliseconds
}

export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  retries?: number;
}

/**
 * Background Job Queue Service
 * Uses Bull (Redis-based queue) for reliable job processing
 */
export class JobQueueService {
  private static queues: Map<string, Queue.Queue> = new Map();
  private static redisConfig: Queue.QueueOptions['redis'];

  /**
   * Initialize Redis connection for Bull
   */
  static initialize(): void {
    const redisUrl = process.env.REDIS_URL || `redis://${config.redis.host}:${config.redis.port}`;
    this.redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null, // Required for Bull
    };
  }

  /**
   * Get or create a queue
   */
  static getQueue(name: string): Queue.Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    if (!this.redisConfig) {
      this.initialize();
    }

    const queue = new Queue(name, {
      redis: this.redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
      },
      settings: {
        maxStalledCount: 1, // Prevent duplicate processing
        retryProcessDelay: 5000, // Delay before retrying failed jobs
      },
    });

    // Event handlers
    queue.on('completed', (job) => {
      logger.info('Job completed', {
        queue: name,
        jobId: job.id,
        duration: Date.now() - job.timestamp,
      });
    });

    queue.on('failed', (job, err) => {
      logger.error('Job failed', {
        queue: name,
        jobId: job?.id,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    queue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        queue: name,
        jobId: job.id,
      });
    });

    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Add job to queue
   */
  static async addJob<T extends JobData>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<Queue.Job<T>> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(data, {
      attempts: options?.attempts || 3,
      backoff: options?.backoff || {
        type: 'exponential',
        delay: 2000,
      },
      delay: options?.delay,
      removeOnComplete: options?.removeOnComplete !== undefined ? options.removeOnComplete : 100,
      removeOnFail: options?.removeOnFail !== undefined ? options.removeOnFail : 500,
      priority: options?.priority,
      timeout: options?.timeout || 30000, // 30 second default timeout
    });

    logger.info('Job added to queue', {
      queue: queueName,
      jobId: job.id,
      data: Object.keys(data),
    });

    return job;
  }

  /**
   * Process jobs in queue
   */
  static processQueue<T extends JobData>(
    queueName: string,
    processor: (job: Queue.Job<T>) => Promise<JobResult>
  ): void {
    const queue = this.getQueue(queueName);

    queue.process(async (job: Queue.Job<T>) => {
      const startTime = Date.now();
      logger.info('Processing job', {
        queue: queueName,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        data: Object.keys(job.data),
      });

      try {
        const result = await processor(job);
        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info('Job processed successfully', {
            queue: queueName,
            jobId: job.id,
            duration,
          });
          return result.data;
        } else {
          throw new Error(result.error || 'Job processing failed');
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Job processing error', {
          queue: queueName,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
        throw error;
      }
    });
  }

  /**
   * Get job status
   */
  static async getJobStatus(queueName: string, jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data: unknown;
    attemptsMade: number;
    failedReason?: string;
  } | null> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: String(job.id),
      state,
      progress: job.progress(),
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || undefined,
    };
  }

  /**
   * Clean old jobs
   */
  static async cleanQueue(
    queueName: string,
    grace: number = 1000,
    limit: number = 1000
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await (queue.clean as (grace: number, status?: unknown, limit?: number) => Promise<unknown>)(grace, undefined, limit);
  }

  /**
   * Close all queues
   */
  static async closeAll(): Promise<void> {
    const promises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(promises);
    this.queues.clear();
  }
}
