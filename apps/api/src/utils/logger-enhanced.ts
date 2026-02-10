import { logger } from './logger.js';
import { Request } from 'express';

/**
 * Enhanced structured logging utilities
 * Provides consistent logging patterns for Kubernetes compatibility
 */

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * Structured log entry interface
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Enhanced logging utilities
 */
export class StructuredLogger {
  /**
   * Log with structured format
   */
  static log(
    level: LogLevel,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'api',
      environment: process.env.NODE_ENV || 'unknown',
      ...metadata,
    };

    switch (level) {
      case LogLevel.ERROR:
        logger.error(message, entry);
        break;
      case LogLevel.WARN:
        logger.warn(message, entry);
        break;
      case LogLevel.INFO:
        logger.info(message, entry);
        break;
      case LogLevel.DEBUG:
        logger.debug(message, entry);
        break;
    }
  }

  /**
   * Log HTTP request with full context
   */
  static logRequest(req: Request, additionalContext?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, 'HTTP Request', {
      requestId: req.headers['x-request-id'],
      method: req.method,
      path: req.path,
      url: req.url,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      ...additionalContext,
    });
  }

  /**
   * Log HTTP response with metrics
   */
  static logResponse(
    req: Request,
    statusCode: number,
    responseTime: number,
    additionalContext?: Record<string, unknown>
  ): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : 
                  statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;

    this.log(level, 'HTTP Response', {
      requestId: req.headers['x-request-id'],
      method: req.method,
      path: req.path,
      statusCode,
      responseTime,
      responseTimeMs: responseTime,
      userId: req.user?.id,
      ...additionalContext,
    });
  }

  /**
   * Log database operation
   */
  static logDatabase(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    this.log(
      success ? LogLevel.DEBUG : LogLevel.ERROR,
      'Database Operation',
      {
        operation,
        table,
        duration,
        durationMs: duration,
        success,
        ...metadata,
      }
    );
  }

  /**
   * Log cache operation
   */
  static logCache(
    operation: string,
    key: string,
    hit: boolean,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    this.log(LogLevel.DEBUG, 'Cache Operation', {
      operation,
      key,
      hit,
      duration,
      durationMs: duration,
      ...metadata,
    });
  }

  /**
   * Log business event
   */
  static logEvent(
    event: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log(LogLevel.INFO, 'Business Event', {
      event,
      userId,
      ...metadata,
    });
  }

  /**
   * Log performance metric
   */
  static logMetric(
    metric: string,
    value: number,
    unit: string = 'ms',
    metadata?: Record<string, unknown>
  ): void {
    this.log(LogLevel.INFO, 'Performance Metric', {
      metric,
      value,
      unit,
      ...metadata,
    });
  }

  /**
   * Log security event
   */
  static logSecurity(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    req?: Request,
    metadata?: Record<string, unknown>
  ): void {
    const level = severity === 'critical' || severity === 'high' 
      ? LogLevel.ERROR 
      : LogLevel.WARN;

    this.log(level, 'Security Event', {
      event,
      severity,
      ...(req && {
        requestId: req.headers['x-request-id'],
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.user?.id,
      }),
      ...metadata,
    });
  }
}


