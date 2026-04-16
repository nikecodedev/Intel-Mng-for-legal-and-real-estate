import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { Request } from 'express';

/**
 * Error Tracking Service
 *
 * Three-tier strategy (configured via env vars):
 *   1. SENTRY_DSN set → ships errors to Sentry (requires @sentry/node installed)
 *   2. ERROR_WEBHOOK_URL set → POSTs structured JSON to any webhook (Slack, PagerDuty, custom)
 *   3. Fallback → structured local log only (always active)
 *
 * Install Sentry: npm install @sentry/node
 * Set SENTRY_DSN=https://...@sentry.io/... to activate.
 */

// ============================================
// Sentry integration (opt-in via SENTRY_DSN)
// ============================================

let sentryInitialized = false;

async function initSentry(): Promise<void> {
  if (sentryInitialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'production',
      release: process.env.APP_VERSION || '1.0.0',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    });
    sentryInitialized = true;
    logger.info('[ErrorTracking] Sentry initialized', { dsn: dsn.replace(/:[^@]+@/, ':***@') });
  } catch {
    logger.warn('[ErrorTracking] @sentry/node not installed — Sentry disabled. Run: npm install @sentry/node');
  }
}

async function captureWithSentry(
  error: Error,
  context?: { userId?: string; tags?: Record<string, string>; extra?: Record<string, unknown>; request?: Request }
): Promise<void> {
  if (!sentryInitialized) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.withScope((scope) => {
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.tags) Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v));
      if (context?.extra) Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v as string));
      if (context?.request) {
        scope.setExtra('method', context.request.method);
        scope.setExtra('path', context.request.path);
        scope.setExtra('ip', context.request.ip);
      }
      Sentry.captureException(error);
    });
  } catch { /* never let tracking break the app */ }
}

// ============================================
// Webhook integration (opt-in via ERROR_WEBHOOK_URL)
// ============================================

async function postToWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // Webhook failure must never crash the app
  }
}

// Initialize Sentry eagerly (async, non-blocking)
initSentry().catch(() => {});

// ============================================
// Public API
// ============================================

export class ErrorTrackingService {
  private static enabled = true;

  static trackError(
    error: Error | AppError,
    context?: {
      request?: Request;
      userId?: string;
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): void {
    if (!this.enabled) return;

    try {
      const isOperational = error instanceof AppError && error.isOperational;
      const statusCode    = error instanceof AppError ? error.statusCode : 500;
      const errorCode     = error instanceof AppError ? error.code : 'UNKNOWN_ERROR';

      const errorData = {
        message:     error.message,
        name:        error.name,
        stack:       error.stack,
        isOperational,
        statusCode,
        errorCode,
        ...(context?.request && {
          method:    context.request.method,
          path:      context.request.path,
          url:       context.request.url,
          ip:        context.request.ip,
          userAgent: context.request.get('user-agent'),
          requestId: context.request.headers['x-request-id'],
        }),
        ...(context?.userId && { userId: context.userId }),
        tags: {
          environment: process.env.NODE_ENV || 'unknown',
          service: 'api',
          ...context?.tags,
        },
        extra: {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          ...context?.extra,
        },
      };

      // 1. Structured local log (always)
      if (isOperational) {
        logger.warn('Operational error tracked', errorData);
      } else {
        logger.error('Error tracked', errorData);
      }

      // 2. Sentry (async, non-blocking)
      captureWithSentry(error, context).catch(() => {});

      // 3. Webhook (async, non-blocking — only for non-operational 5xx errors)
      if (!isOperational && statusCode >= 500) {
        postToWebhook({
          text: `🚨 *${error.name}*: ${error.message}`,
          error: errorData,
        }).catch(() => {});
      }
    } catch (trackingError) {
      logger.error('Error tracking failed', {
        originalError: error.message,
        trackingError: trackingError instanceof Error ? trackingError.message : 'Unknown',
      });
    }
  }

  static trackWarning(
    message: string,
    context?: {
      request?: Request;
      userId?: string;
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): void {
    if (!this.enabled) return;
    logger.warn('Warning tracked', {
      message,
      ...(context?.request && { method: context.request.method, path: context.request.path }),
      ...(context?.userId && { userId: context.userId }),
      tags:  { environment: process.env.NODE_ENV || 'unknown', service: 'api', ...context?.tags },
      extra: { timestamp: new Date().toISOString(), ...context?.extra },
    });
  }

  static setUserContext(userId: string, email?: string, metadata?: Record<string, unknown>): void {
    logger.debug('User context set for error tracking', { userId, email });
    if (sentryInitialized) {
      import('@sentry/node').then((Sentry) => {
        Sentry.setUser({ id: userId, email, ...metadata });
      }).catch(() => {});
    }
  }

  static addBreadcrumb(
    message: string,
    category: string,
    level: 'info' | 'warning' | 'error' = 'info',
    data?: Record<string, unknown>
  ): void {
    logger.debug('Breadcrumb', { message, category, level, data });
    if (sentryInitialized) {
      import('@sentry/node').then((Sentry) => {
        Sentry.addBreadcrumb({ message, category, level, data, timestamp: Date.now() / 1000 });
      }).catch(() => {});
    }
  }

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Error tracking enabled status changed', { enabled });
  }
}
