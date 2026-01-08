import { Request, Response, NextFunction } from 'express';
import { StructuredLogger } from '../utils/logger-enhanced';
import { asyncHandler } from './validator';

/**
 * Enhanced request logging middleware
 * Provides structured logging compatible with Kubernetes and log aggregation
 */
export function enhancedRequestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Log request
  StructuredLogger.logRequest(req);

  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    StructuredLogger.logResponse(req, res.statusCode, responseTime, {
      contentLength: res.get('content-length'),
    });
  });

  next();
}

/**
 * Performance logging middleware
 * Logs slow requests
 */
export function performanceLogger(thresholdMs: number = 1000) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        if (responseTime > thresholdMs) {
          StructuredLogger.logMetric(
            'slow_request',
            responseTime,
            'ms',
            {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              threshold: thresholdMs,
            }
          );
        }
      });

      next();
    }
  );
}

