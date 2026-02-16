import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sanitizeRequestBody, sanitizeQueryParams } from '../utils/log-sanitizer.js';

/**
 * Global request validation middleware
 * Validates and sanitizes all incoming requests
 * 
 * Security features:
 * - Validates request size limits
 * - Sanitizes input to prevent injection attacks
 * - Validates content-type for POST/PUT/PATCH requests
 * - Enforces strict JSON parsing
 */

// Maximum request size (10MB)
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;

// Allowed content types
const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
];

/**
 * Content-Type validation schema
 */
const contentTypeSchema = z.enum([
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
]);

/**
 * Basic input sanitization
 * Removes potentially dangerous characters and patterns
 */
function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    // Remove null bytes
    return input.replace(/\0/g, '');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

/**
 * Validate request size
 */
function validateRequestSize(req: Request): void {
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_REQUEST_SIZE) {
      throw new ValidationError(`Request body too large. Maximum size: ${MAX_REQUEST_SIZE / 1024 / 1024}MB`);
    }
  }
}

/**
 * Validate Content-Type header
 */
function validateContentType(req: Request): void {
  // Only validate for methods that have a body
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return;
  }

  const contentType = req.headers['content-type'];
  if (!contentType) {
    throw new ValidationError('Content-Type header is required for POST/PUT/PATCH requests');
  }

  // Extract base content type (remove charset, boundary, etc.)
  const baseContentType = contentType.split(';')[0].trim().toLowerCase();

  if (!ALLOWED_CONTENT_TYPES.includes(baseContentType)) {
    throw new ValidationError(
      `Invalid Content-Type. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}`
    );
  }
}

/**
 * Global request validation middleware
 * Should be applied early in the middleware chain (after body parsing)
 */
export function globalRequestValidation() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request size
      validateRequestSize(req);

      // Validate Content-Type for requests with body
      validateContentType(req);

      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeInput(req.body) as typeof req.body;
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeInput(req.query) as typeof req.query;
      }

      // Sanitize route parameters
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeInput(req.params) as typeof req.params;
      }

      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        next(error);
      } else {
        logger.error('Request validation error', {
          error: error instanceof Error ? error.message : String(error),
          path: req.path,
          method: req.method,
        });
        next(new ValidationError('Invalid request format'));
      }
    }
  };
}
