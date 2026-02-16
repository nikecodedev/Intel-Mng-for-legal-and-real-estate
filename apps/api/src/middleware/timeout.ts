import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { InternalServerError } from '../utils/errors.js';

/**
 * Request timeout configuration
 */
const DEFAULT_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10); // 30 seconds default
const MAX_TIMEOUT_MS = 300000; // 5 minutes maximum

/**
 * Timeout middleware
 * Prevents hanging requests by enforcing a maximum request duration
 * 
 * @param timeoutMs - Timeout in milliseconds (default: 30s, max: 5min)
 */
export function requestTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const timeout = Math.min(timeoutMs, MAX_TIMEOUT_MS);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout for the request
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          path: req.path,
          method: req.method,
          timeout,
          requestId: req.headers['x-request-id'],
        });

        // Clear any pending response
        res.status(504).json({
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: `Request exceeded maximum duration of ${timeout}ms`,
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }
    }, timeout);

    // Clear timeout when response is sent
    const originalEnd = res.end;
    res.end = function (chunk?: unknown, encoding?: unknown, cb?: () => void) {
      clearTimeout(timeoutId);
      return originalEnd.call(this, chunk, encoding, cb);
    };

    next();
  };
}

/**
 * Global timeout middleware
 * Applied to all requests
 */
export function globalTimeout() {
  return requestTimeout(DEFAULT_TIMEOUT_MS);
}

/**
 * Extended timeout middleware
 * For long-running operations (e.g., file uploads, exports)
 */
export function extendedTimeout(timeoutMs: number = 120000) {
  return requestTimeout(timeoutMs);
}
