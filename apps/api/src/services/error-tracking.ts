import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { Request } from 'express';

/**
 * Error tracking service
 * Placeholder for future error tracking SaaS integration
 * Currently logs errors with structured data
 */
export class ErrorTrackingService {
  private static enabled = true;

  /**
   * Track an error
   * Placeholder for future SaaS integration (Sentry, Datadog, etc.)
   */
  static trackError(
    error: Error | AppError,
    context?: {
      request?: Request;
      userId?: string;
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Structured error data
      const errorData = {
        // Error information
        message: error.message,
        stack: error.stack,
        name: error.name,
        
        // Error classification
        isOperational: error instanceof AppError ? error.isOperational : false,
        statusCode: error instanceof AppError ? error.statusCode : 500,
        errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
        
        // Request context
        ...(context?.request && {
          method: context.request.method,
          path: context.request.path,
          url: context.request.url,
          ip: context.request.ip,
          userAgent: context.request.get('user-agent'),
          requestId: context.request.headers['x-request-id'],
        }),
        
        // User context
        ...(context?.userId && { userId: context.userId }),
        
        // Tags for filtering
        tags: {
          environment: process.env.NODE_ENV || 'unknown',
          service: 'api',
          ...context?.tags,
        },
        
        // Additional context
        extra: {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          ...context?.extra,
        },
      };

      // Log error with structured data
      if (error instanceof AppError && error.isOperational) {
        logger.warn('Operational error tracked', errorData);
      } else {
        logger.error('Error tracked', errorData);
      }

      // TODO: Integrate with error tracking SaaS
      // Example for Sentry:
      // Sentry.captureException(error, {
      //   tags: errorData.tags,
      //   extra: errorData.extra,
      //   user: context?.userId ? { id: context.userId } : undefined,
      //   request: context?.request ? {
      //     method: context.request.method,
      //     url: context.request.url,
      //     headers: context.request.headers,
      //   } : undefined,
      // });

      // Example for Datadog:
      // tracer.trace('error', () => {
      //   tracer.setTag('error.message', error.message);
      //   tracer.setTag('error.type', error.name);
      //   throw error;
      // });

    } catch (trackingError) {
      // Never let error tracking break the application
      logger.error('Error tracking failed', {
        originalError: error.message,
        trackingError: trackingError instanceof Error ? trackingError.message : 'Unknown',
      });
    }
  }

  /**
   * Track a warning
   */
  static trackWarning(
    message: string,
    context?: {
      request?: Request;
      userId?: string;
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): void {
    if (!this.enabled) {
      return;
    }

    logger.warn('Warning tracked', {
      message,
      ...(context?.request && {
        method: context.request.method,
        path: context.request.path,
        ip: context.request.ip,
      }),
      ...(context?.userId && { userId: context.userId }),
      tags: {
        environment: process.env.NODE_ENV || 'unknown',
        service: 'api',
        ...context?.tags,
      },
      extra: {
        timestamp: new Date().toISOString(),
        ...context?.extra,
      },
    });
  }

  /**
   * Set user context for error tracking
   */
  static setUserContext(userId: string, email?: string, metadata?: Record<string, unknown>): void {
    // TODO: Set user context in error tracking SaaS
    // Example for Sentry:
    // Sentry.setUser({ id: userId, email, ...metadata });
    
    logger.debug('User context set for error tracking', { userId, email });
  }

  /**
   * Add breadcrumb for error tracking
   */
  static addBreadcrumb(
    message: string,
    category: string,
    level: 'info' | 'warning' | 'error' = 'info',
    data?: Record<string, unknown>
  ): void {
    // TODO: Add breadcrumb to error tracking SaaS
    // Example for Sentry:
    // Sentry.addBreadcrumb({
    //   message,
    //   category,
    //   level,
    //   data,
    //   timestamp: Date.now() / 1000,
    // });
    
    logger.debug('Breadcrumb added', { message, category, level, data });
  }

  /**
   * Enable/disable error tracking
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Error tracking enabled status changed', { enabled });
  }
}


