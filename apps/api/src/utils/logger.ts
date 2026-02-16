import winston from 'winston';
import { config } from '../config/index.js';
import { sanitizeLogData } from './log-sanitizer.js';

/**
 * Structured logging configuration using Winston
 * Supports different log levels and formats based on environment
 * Production: Sanitizes sensitive data from logs
 */
const sanitizeFormat = winston.format((info) => {
  // Sanitize metadata in production
  if (config.app.isProduction && info.meta) {
    info.meta = sanitizeLogData(info.meta) as Record<string, unknown>;
  }
  // Sanitize any additional fields
  if (config.app.isProduction) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(info)) {
      if (key === 'password' || key === 'token' || key === 'secret' || key.includes('password') || key.includes('token') || key.includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    Object.assign(info, sanitized);
  }
  return info;
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  sanitizeFormat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

/**
 * Winston logger instance
 * - Development: Console output with colors
 * - Production: JSON structured logs
 */
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'api',
    environment: config.app.env,
  },
  transports: [
    // Console transport (all environments)
    new winston.transports.Console({
      format: config.app.isDevelopment ? consoleFormat : logFormat,
    }),
    // File transports for production
    ...(config.app.isProduction
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
        ]
      : []),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

/**
 * Logger helper functions for structured logging
 */
export const logHelpers = {
  /**
   * Log HTTP request
   */
  logRequest: (req: { method: string; url: string; ip?: string }) => {
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Log HTTP response
   */
  logResponse: (
    req: { method: string; url: string },
    statusCode: number,
    responseTime: number
  ) => {
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Log error with context (sanitized)
   */
  logError: (error: Error, context?: Record<string, unknown>) => {
    const sanitizedContext = config.app.isProduction && context
      ? sanitizeLogData(context) as Record<string, unknown>
      : context;
    logger.error('Error occurred', {
      message: error.message,
      stack: error.stack,
      ...sanitizedContext,
      timestamp: new Date().toISOString(),
    });
  },
};


