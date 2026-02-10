import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';
import { randomBytes } from 'crypto';

/**
 * Distributed Lock Service
 * Implements distributed locks using Redis
 * Locks auto-expire to prevent deadlocks
 */
export class DistributedLockService {
  private static readonly LOCK_PREFIX = 'lock:';
  private static readonly DEFAULT_TTL = 30; // 30 seconds default

  /**
   * Acquire a distributed lock
   * @param resource - Resource identifier (e.g., "process:123", "user:456")
   * @param ttl - Time to live in seconds (default: 30)
   * @param retryAttempts - Number of retry attempts (default: 0)
   * @param retryDelay - Delay between retries in milliseconds (default: 100)
   * @returns Lock token if acquired, null if failed
   */
  static async acquireLock(
    resource: string,
    ttl: number = this.DEFAULT_TTL,
    retryAttempts: number = 0,
    retryDelay: number = 100
  ): Promise<string | null> {
    if (!redisClient.isAvailable()) {
      logger.warn('Redis not available, lock acquisition will fail');
      return null;
    }

    const lockKey = `${this.LOCK_PREFIX}${resource}`;
    const lockToken = randomBytes(16).toString('hex');

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const client = redisClient.getClient();
        
        // Try to acquire lock using SET with NX (only if not exists) and EX (expiration)
        const result = await client.set(lockKey, lockToken, 'EX', ttl, 'NX');

        if (result === 'OK') {
          logger.debug('Lock acquired', { resource, lockToken, ttl });
          return lockToken;
        }

        // Lock already exists, wait and retry if attempts remaining
        if (attempt < retryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        logger.debug('Failed to acquire lock', { resource, attempt });
        return null;
      } catch (error) {
        logger.error('Error acquiring lock', { error, resource, attempt });
        if (attempt === retryAttempts) {
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    return null;
  }

  /**
   * Release a distributed lock
   * Uses Lua script to ensure atomicity (only release if token matches)
   * @param resource - Resource identifier
   * @param lockToken - Lock token returned from acquireLock
   * @returns true if released, false if failed or token mismatch
   */
  static async releaseLock(resource: string, lockToken: string): Promise<boolean> {
    if (!redisClient.isAvailable()) {
      logger.warn('Redis not available, lock release will fail');
      return false;
    }

    const lockKey = `${this.LOCK_PREFIX}${resource}`;

    try {
      const client = redisClient.getClient();
      
      // Lua script to atomically check and delete lock
      // Only deletes if the token matches (prevents releasing someone else's lock)
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await client.eval(luaScript, 1, lockKey, lockToken);

      if (result === 1) {
        logger.debug('Lock released', { resource, lockToken });
        return true;
      } else {
        logger.warn('Lock release failed - token mismatch or lock expired', { resource, lockToken });
        return false;
      }
    } catch (error) {
      logger.error('Error releasing lock', { error, resource, lockToken });
      return false;
    }
  }

  /**
   * Extend lock TTL (refresh)
   * @param resource - Resource identifier
   * @param lockToken - Lock token
   * @param ttl - New TTL in seconds
   * @returns true if extended, false if failed
   */
  static async extendLock(
    resource: string,
    lockToken: string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<boolean> {
    if (!redisClient.isAvailable()) {
      return false;
    }

    const lockKey = `${this.LOCK_PREFIX}${resource}`;

    try {
      const client = redisClient.getClient();
      
      // Lua script to atomically check and extend lock
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await client.eval(luaScript, 1, lockKey, lockToken, ttl.toString());

      if (result === 1) {
        logger.debug('Lock extended', { resource, lockToken, ttl });
        return true;
      } else {
        logger.warn('Lock extension failed - token mismatch or lock expired', { resource, lockToken });
        return false;
      }
    } catch (error) {
      logger.error('Error extending lock', { error, resource, lockToken });
      return false;
    }
  }

  /**
   * Check if a lock exists
   * @param resource - Resource identifier
   * @returns true if locked, false if not
   */
  static async isLocked(resource: string): Promise<boolean> {
    if (!redisClient.isAvailable()) {
      return false;
    }

    try {
      const client = redisClient.getClient();
      const lockKey = `${this.LOCK_PREFIX}${resource}`;
      const exists = await client.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking lock status', { error, resource });
      return false;
    }
  }

  /**
   * Get lock TTL (time remaining)
   * @param resource - Resource identifier
   * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
   */
  static async getLockTTL(resource: string): Promise<number> {
    if (!redisClient.isAvailable()) {
      return -2;
    }

    try {
      const client = redisClient.getClient();
      const lockKey = `${this.LOCK_PREFIX}${resource}`;
      return await client.ttl(lockKey);
    } catch (error) {
      logger.error('Error getting lock TTL', { error, resource });
      return -2;
    }
  }

  /**
   * Execute a function with a distributed lock
   * Automatically acquires lock, executes function, and releases lock
   * @param resource - Resource identifier
   * @param fn - Function to execute
   * @param ttl - Lock TTL in seconds
   * @param retryAttempts - Number of retry attempts
   * @returns Result of function execution
   */
  static async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL,
    retryAttempts: number = 0
  ): Promise<T> {
    const lockToken = await this.acquireLock(resource, ttl, retryAttempts);

    if (!lockToken) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(resource, lockToken);
    }
  }
}


