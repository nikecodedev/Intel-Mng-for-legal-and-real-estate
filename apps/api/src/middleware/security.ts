import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

/**
 * Security middleware configuration
 * Applies security best practices to all requests
 * Production-hardened with strict security headers
 */
export function securityMiddleware() {
  return [
    // Helmet: Sets various HTTP headers for security
    // Production: Full CSP, strict headers
    // Development: Relaxed for development tools
    helmet({
      contentSecurityPolicy: config.app.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: config.app.isProduction,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      dnsPrefetchControl: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: config.app.isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: 'no-referrer' },
      xssFilter: true,
    }),

    // CORS: Configure cross-origin resource sharing
    cors({
      origin: config.security.corsOrigin === '*' 
        ? (config.app.isProduction ? false : true) // Disallow wildcard in production
        : config.security.corsOrigin.split(',').map(o => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      maxAge: config.app.isProduction ? 86400 : 0, // Cache preflight for 24h in production
    }),

    // Compression: Compress response bodies
    compression({
      level: 6,
      threshold: 1024, // Only compress responses > 1KB
      filter: (req: Request, res: Response) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
          return false;
        }
        // Use compression for all text-based content
        return compression.filter(req, res);
      },
    }),

    // Rate limiting: Prevent abuse (additional layer on top of Redis-based rate limiting)
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
      skip: (req: Request) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path.startsWith('/health/');
      },
    }),
  ];
}


