import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

/**
 * Security middleware configuration
 * Applies security best practices to all requests
 */
export function securityMiddleware() {
  return [
    // Helmet: Sets various HTTP headers for security
    helmet({
      contentSecurityPolicy: config.app.isProduction,
      crossOriginEmbedderPolicy: config.app.isProduction,
    }),

    // CORS: Configure cross-origin resource sharing
    cors({
      origin: config.security.corsOrigin === '*' 
        ? true 
        : config.security.corsOrigin.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }),

    // Compression: Compress response bodies
    compression(),

    // Rate limiting: Prevent abuse
    rateLimit({
      windowMs: config.security.rateLimit.windowMs,
      max: config.security.rateLimit.maxRequests,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later',
          timestamp: new Date().toISOString(),
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  ];
}


