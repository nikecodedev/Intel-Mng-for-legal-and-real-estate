import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';

/**
 * Session Cache Service
 * Manages user session data in Redis
 * Used as a supporting layer, not primary storage
 */
export class SessionCacheService {
  private static readonly SESSION_PREFIX = 'session:';
  private static readonly USER_SESSION_PREFIX = 'user:session:';
  private static readonly DEFAULT_TTL = 3600; // 1 hour in seconds

  /**
   * Store session data
   */
  static async setSession(
    sessionId: string,
    data: Record<string, unknown>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    if (!redisClient.isAvailable()) {
      logger.debug('Redis not available, skipping session cache');
      return;
    }

    try {
      const client = redisClient.getClient();
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      
      await client.setex(key, ttl, JSON.stringify(data));
      
      // Also store session ID for user lookup
      if (data.userId) {
        const userKey = `${this.USER_SESSION_PREFIX}${data.userId}`;
        await client.sadd(userKey, sessionId);
        await client.expire(userKey, ttl);
      }

      logger.debug('Session cached', { sessionId, ttl });
    } catch (error) {
      logger.error('Failed to cache session', { error, sessionId });
      // Don't throw - session caching is non-critical
    }
  }

  /**
   * Get session data
   */
  static async getSession(sessionId: string): Promise<Record<string, unknown> | null> {
    if (!redisClient.isAvailable()) {
      return null;
    }

    try {
      const client = redisClient.getClient();
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      const data = await client.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as Record<string, unknown>;
    } catch (error) {
      logger.error('Failed to get session from cache', { error, sessionId });
      return null;
    }
  }

  /**
   * Delete session
   */
  static async deleteSession(sessionId: string, userId?: string): Promise<void> {
    if (!redisClient.isAvailable()) {
      return;
    }

    try {
      const client = redisClient.getClient();
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      
      await client.del(key);

      // Remove from user's session set
      if (userId) {
        const userKey = `${this.USER_SESSION_PREFIX}${userId}`;
        await client.srem(userKey, sessionId);
      }

      logger.debug('Session deleted from cache', { sessionId });
    } catch (error) {
      logger.error('Failed to delete session from cache', { error, sessionId });
    }
  }

  /**
   * Delete all sessions for a user
   */
  static async deleteUserSessions(userId: string): Promise<void> {
    if (!redisClient.isAvailable()) {
      return;
    }

    try {
      const client = redisClient.getClient();
      const userKey = `${this.USER_SESSION_PREFIX}${userId}`;
      
      // Get all session IDs for user
      const sessionIds = await client.smembers(userKey);
      
      // Delete all sessions
      if (sessionIds.length > 0) {
        const keys = sessionIds.map((id) => `${this.SESSION_PREFIX}${id}`);
        await client.del(...keys);
      }

      // Delete user session set
      await client.del(userKey);

      logger.info('All user sessions deleted from cache', { userId, count: sessionIds.length });
    } catch (error) {
      logger.error('Failed to delete user sessions from cache', { error, userId });
    }
  }

  /**
   * Refresh session TTL
   */
  static async refreshSession(sessionId: string, ttl: number = this.DEFAULT_TTL): Promise<void> {
    if (!redisClient.isAvailable()) {
      return;
    }

    try {
      const client = redisClient.getClient();
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      
      await client.expire(key, ttl);
      
      logger.debug('Session TTL refreshed', { sessionId, ttl });
    } catch (error) {
      logger.error('Failed to refresh session TTL', { error, sessionId });
    }
  }

  /**
   * Get session count for a user
   */
  static async getUserSessionCount(userId: string): Promise<number> {
    if (!redisClient.isAvailable()) {
      return 0;
    }

    try {
      const client = redisClient.getClient();
      const userKey = `${this.USER_SESSION_PREFIX}${userId}`;
      return await client.scard(userKey);
    } catch (error) {
      logger.error('Failed to get user session count', { error, userId });
      return 0;
    }
  }
}


