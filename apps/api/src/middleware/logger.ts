import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { logger, logHelpers } from '../utils/logger.js';

/**
 * Request logging middleware
 * Logs all incoming requests with structured data
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Log request
  logHelpers.logRequest({
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.socket.remoteAddress,
  });

  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logHelpers.logResponse(
      {
        method: req.method,
        url: req.originalUrl || req.url,
      },
      res.statusCode,
      responseTime
    );
  });

  next();
}

/**
 * Request ID middleware
 * Adds unique request ID to each request for tracing
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}


