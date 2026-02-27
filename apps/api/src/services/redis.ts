import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Redis client singleton
 * Manages connection to Redis server
 */
class RedisClient {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;

  /**
   * Initialize Redis connection
   */
  initialize(): void {
    if (!config.redis.enabled) {
      logger.warn('Redis is disabled in configuration');
      return;
    }

    if (this.client) {
      logger.warn('Redis client already initialized');
      return;
    }

    // Load-safe defaults for production
    const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '3', 10);
    const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '10000', 10);
    const commandTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || '5000', 10);
    const keepAlive = parseInt(process.env.REDIS_KEEPALIVE_MS || '30000', 10);

    const options: RedisOptions = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: maxRetries,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      lazyConnect: false,
      connectTimeout,
      commandTimeout,
      keepAlive,
      // Connection pool settings
      family: 4, // Use IPv4
      enableAutoPipelining: true, // Auto-pipeline commands
    };

    // Use URL if provided, otherwise use individual options
    if (config.redis.url) {
      this.client = new Redis(config.redis.url, options);
    } else {
      this.client = new Redis(options);
    }

    // Create separate connections for pub/sub if needed
    this.subscriber = this.client.duplicate();
    this.publisher = this.client.duplicate();

    // Event handlers
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error });
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    logger.info('Redis client initialized', {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
    });
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    if (!config.redis.enabled) {
      throw new Error('Redis is disabled in configuration');
    }

    if (!this.client) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }

    return this.client;
  }

  /**
   * Get Redis subscriber instance
   */
  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized. Call initialize() first.');
    }
    return this.subscriber;
  }

  /**
   * Get Redis publisher instance
   */
  getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized. Call initialize() first.');
    }
    return this.publisher;
  }

  /**
   * Test Redis connection
   */
  async testConnection(): Promise<boolean> {
    if (!config.redis.enabled) {
      return false;
    }

    try {
      const client = this.getClient();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis connection test failed', { error });
      return false;
    }
  }

  /**
   * Close Redis connections
   */
  async close(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.client) {
      promises.push(this.client.quit().then(() => { logger.info('Redis client closed'); }));
    }

    if (this.subscriber) {
      promises.push(this.subscriber.quit().then(() => { logger.info('Redis subscriber closed'); }));
    }

    if (this.publisher) {
      promises.push(this.publisher.quit().then(() => { logger.info('Redis publisher closed'); }));
    }

    await Promise.all(promises);

    this.client = null;
    this.subscriber = null;
    this.publisher = null;
  }

  /**
   * Check if Redis is enabled and connected
   */
  isAvailable(): boolean {
    return config.redis.enabled && this.client !== null && this.client.status === 'ready';
  }
}

// Export singleton instance
export const redisClient = new RedisClient();


