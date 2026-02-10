import { Request, Response, NextFunction } from 'express';
import { AppError, formatErrorResponse } from '../utils/errors.js';
import { logger, logHelpers } from '../utils/logger.js';
import { ErrorTrackingService } from '../services/error-tracking.js';
import { config } from '../config/index.js';

/**
 * Centralized error handling middleware
 * Catches all errors and formats consistent error responses
 */
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Track error with error tracking service
  ErrorTrackingService.trackError(error, {
    request: req,
    userId: req.user?.id,
    tags: {
      errorType: error instanceof AppError ? 'operational' : 'system',
      statusCode: error instanceof AppError ? String(error.statusCode) : '500',
    },
    extra: {
      body: req.body,
      query: req.query,
      params: req.params,
    },
  });

  // Log error with context
  if (error instanceof AppError && error.isOperational) {
    logger.warn('Operational error', {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method,
    });
  } else {
    logHelpers.logError(error, {
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
    });
  }

  // Format error response
  const errorResponse = formatErrorResponse(error, req.path);

  // Send error response
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * Must be registered after all routes
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new AppError(404, `Route ${req.method} ${req.path} not found`);
  next(error);
}

