import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../services/redis.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from './validator.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
}

/**
 * Rate limit result
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

/**
 * Redis-based rate limiting middleware
 * Uses Redis as a supporting layer for distributed rate limiting
 */
export function rateLimitRedis(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request) => {
      // Default: use IP address or user ID
      return req.user?.id || req.ip || 'unknown';
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later',
  } = config;

  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Skip if Redis is not available (fallback to no rate limiting)
      if (!redisClient.isAvailable()) {
        logger.warn('Redis not available, skipping rate limiting');
        return next();
      }

      try {
        const key = `rate_limit:${keyGenerator(req)}`;
        const windowSeconds = Math.ceil(windowMs / 1000);
        const now = Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;

        const client = redisClient.getClient();

        // Use sliding window log algorithm
        const pipeline = client.pipeline();
        
        // Remove old entries outside the window
        pipeline.zremrangebyscore(key, 0, now - windowMs);
        
        // Count current requests in window
        pipeline.zcard(key);
        
        // Add current request
        pipeline.zadd(key, now, `${now}-${Math.random()}`);
        
        // Set expiration
        pipeline.expire(key, windowSeconds);

        const results = await pipeline.exec();

        if (!results) {
          logger.error('Rate limit pipeline execution failed');
          return next();
        }

        const count = (results[1]?.[1] as number) || 0;
        const allowed = count < maxRequests;

        // Set rate limit headers
        const remaining = Math.max(0, maxRequests - count - 1);
        const resetTime = new Date(windowStart + windowMs);

        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime.getTime() / 1000).toString());

        if (!allowed) {
          const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000);
          res.setHeader('Retry-After', retryAfter.toString());

          res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message,
              retryAfter,
              resetTime: resetTime.toISOString(),
            },
          });
          return;
        }

        // Track response status for skip options
        const originalSend = res.send;
        const originalJson = res.json;

        res.send = function (body: unknown) {
          if (skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 400) {
            // Remove the request from count if successful
            client.zrem(key, `${now}-*`).catch(() => {});
          }
          if (skipFailedRequests && res.statusCode >= 400) {
            // Remove the request from count if failed
            client.zrem(key, `${now}-*`).catch(() => {});
          }
          return originalSend.call(this, body);
        };

        res.json = function (body: unknown) {
          if (skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 400) {
            client.zrem(key, `${now}-*`).catch(() => {});
          }
          if (skipFailedRequests && res.statusCode >= 400) {
            client.zrem(key, `${now}-*`).catch(() => {});
          }
          return originalJson.call(this, body);
        };

        next();
      } catch (error) {
        logger.error('Rate limit check failed', { error });
        // On error, allow the request (fail open)
        next();
      }
    }
  );
}

/**
 * Simple rate limit helper
 * Returns rate limit status without blocking
 */
export async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<RateLimitResult> {
  if (!redisClient.isAvailable()) {
    return {
      allowed: true,
      remaining: maxRequests,
      resetTime: new Date(Date.now() + windowMs),
    };
  }

  try {
    const client = redisClient.getClient();
    const redisKey = `rate_limit:${key}`;
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    // Remove old entries
    await client.zremrangebyscore(redisKey, 0, now - windowMs);

    // Count current requests
    const count = await client.zcard(redisKey);
    const allowed = count < maxRequests;
    const remaining = Math.max(0, maxRequests - count);
    const resetTime = new Date(windowStart + windowMs);

    return {
      allowed,
      remaining,
      resetTime,
      retryAfter: allowed ? undefined : Math.ceil((resetTime.getTime() - now) / 1000),
    };
  } catch (error) {
    logger.error('Rate limit check failed', { error, key });
    // Fail open
    return {
      allowed: true,
      remaining: maxRequests,
      resetTime: new Date(Date.now() + windowMs),
    };
  }
}


