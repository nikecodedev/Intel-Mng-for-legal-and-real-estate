import { logger } from './logger';

/**
 * Custom error classes for different error types
 * Enables centralized error handling and proper HTTP status codes
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
    public code?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(400, message, true, 'VALIDATION_ERROR');
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, true, 'AUTHENTICATION_ERROR');
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, true, 'AUTHORIZATION_ERROR');
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/** 402 Payment Required - Tenant suspended (Fonte 5, TenantMiddleware spec) */
export class PaymentRequiredError extends AppError {
  constructor(message = 'Payment required') {
    super(402, message, true, 'PAYMENT_REQUIRED');
    Object.setPrototypeOf(this, PaymentRequiredError.prototype);
  }
}

/**
 * Tenant blocked/suspended - 403 with ACCOUNT_SUSPENDED body (Fonte 5, TenantMiddleware spec).
 * Security by obscurity: same response for blocked/suspended when returning 403.
 */
export class TenantAccountSuspendedError extends AppError {
  constructor(message = 'Entre em contato com o financeiro.') {
    super(403, message, true, 'ACCOUNT_SUSPENDED');
    Object.setPrototypeOf(this, TenantAccountSuspendedError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, true, 'NOT_FOUND');
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, true, 'CONFLICT');
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(500, message, false, 'INTERNAL_SERVER_ERROR');
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * Error response formatter
 * Ensures consistent error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    path?: string;
  };
}

/**
 * Format error for API response
 */
export function formatErrorResponse(
  error: Error | AppError,
  path?: string
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message,
        details: error instanceof ValidationError ? error.details : undefined,
        timestamp: new Date().toISOString(),
        path,
      },
    };
  }

  // Unknown/unexpected errors
  logger.error('Unexpected error', { error, path });
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path,
    },
  };
}


