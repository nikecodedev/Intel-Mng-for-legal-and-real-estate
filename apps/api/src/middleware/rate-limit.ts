import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../services/redis.js';
import { logger } from '../utils/logger.js';
import { TooManyRequestsError } from '../utils/errors.js';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
};

/**
 * Rate Limiting Middleware
 * Uses Redis for distributed rate limiting across multiple instances
 */
export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const finalConfig: RateLimitConfig = { ...DEFAULT_CONFIG, ...config };
  const redis = redisClient.getClient();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate rate limit key
      const keyGenerator = finalConfig.keyGenerator || defaultKeyGenerator;
      const key = `rate_limit:${keyGenerator(req)}`;

      // Get current request count
      const current = await redis.get(key);
      const count = current ? parseInt(current, 10) : 0;

      // Check if limit exceeded
      if (count >= finalConfig.maxRequests) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : Math.ceil(finalConfig.windowMs / 1000);

        logger.warn('Rate limit exceeded', {
          key,
          count,
          maxRequests: finalConfig.maxRequests,
          retryAfter,
          ip: req.ip,
          path: req.path,
        });

        res.setHeader('Retry-After', retryAfter.toString());
        res.setHeader('X-RateLimit-Limit', finalConfig.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + retryAfter * 1000).toISOString());

        throw new TooManyRequestsError(
          finalConfig.message || `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter
        );
      }

      // Increment counter
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, Math.ceil(finalConfig.windowMs / 1000));
      await pipeline.exec();

      // Set rate limit headers
      const remaining = Math.max(0, finalConfig.maxRequests - count - 1);
      res.setHeader('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + finalConfig.windowMs).toISOString());

      // Track response for skip options
      if (finalConfig.skipSuccessfulRequests || finalConfig.skipFailedRequests) {
        const originalSend = res.send;
        res.send = function (body) {
          const statusCode = res.statusCode;
          const isSuccess = statusCode >= 200 && statusCode < 400;
          const isFailure = statusCode >= 400;

          if (
            (finalConfig.skipSuccessfulRequests && isSuccess) ||
            (finalConfig.skipFailedRequests && isFailure)
          ) {
            // Decrement counter if we should skip this request
            redis.decr(key).catch(err => {
              logger.error('Failed to decrement rate limit counter', { error: err });
            });
          }

          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      if (error instanceof TooManyRequestsError) {
        throw error;
      }
      logger.error('Rate limit middleware error', { error });
      // On error, allow request to proceed (fail open)
      next();
    }
  };
}

/**
 * Default key generator: IP + tenant + path
 */
function defaultKeyGenerator(req: Request): string {
  const tenantId = (req as any).tenant?.id || 'no-tenant';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const path = req.path || '/';
  return `${ip}:${tenantId}:${path}`;
}

/**
 * Per-user rate limiting (stricter)
 */
export function userRateLimit(maxRequests: number = 60, windowMs: number = 60 * 1000) {
  return rateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || 'anonymous';
      const tenantId = (req as any).tenant?.id || 'no-tenant';
      return `user:${tenantId}:${userId}`;
    },
  });
}

/**
 * Per-tenant rate limiting
 */
export function tenantRateLimit(maxRequests: number = 1000, windowMs: number = 60 * 1000) {
  return rateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req: Request) => {
      const tenantId = (req as any).tenant?.id || 'no-tenant';
      return `tenant:${tenantId}`;
    },
  });
}

/**
 * Strict rate limiting for authentication endpoints
 */
export function authRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return `auth:${ip}`;
    },
    message: 'Too many authentication attempts. Please try again later.',
  });
}
