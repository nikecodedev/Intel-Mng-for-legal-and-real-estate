import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { config } from '../config';
import { HealthCheckService } from '../services/health';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Comprehensive health check endpoint
 * Returns detailed system health information
 * 
 * GET /health
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const healthData = await HealthCheckService.performAllChecks();

    const statusCode = healthData.overall === 'healthy' ? 200 : 
                      healthData.overall === 'degraded' ? 200 : 503;

    logger.info('Health check performed', {
      overall: healthData.overall,
      checks: healthData.checks.map((c) => ({ name: c.name, status: c.status })),
    });

    res.status(statusCode).json({
      success: healthData.overall === 'healthy',
      status: healthData.overall,
      timestamp: healthData.timestamp,
      uptime: healthData.uptime,
      environment: config.app.env,
      version: config.app.apiVersion,
      service: 'api',
      checks: healthData.checks,
    });
  })
);

/**
 * Readiness probe endpoint
 * Used by Kubernetes to check if service is ready to accept traffic
 * Returns 200 if ready, 503 if not ready
 * 
 * GET /health/ready
 */
router.get(
  '/ready',
  asyncHandler(async (req: Request, res: Response) => {
    const isReady = await HealthCheckService.isReady();

    if (isReady) {
      logger.debug('Readiness check passed');
      res.status(200).json({
        success: true,
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn('Readiness check failed - service not ready');
      res.status(503).json({
        success: false,
        status: 'not ready',
        timestamp: new Date().toISOString(),
        message: 'Service dependencies are not healthy',
      });
    }
  })
);

/**
 * Liveness probe endpoint
 * Used by Kubernetes to check if service is alive
 * Returns 200 if alive, 500 if dead
 * 
 * GET /health/live
 */
router.get(
  '/live',
  asyncHandler(async (req: Request, res: Response) => {
    const isAlive = HealthCheckService.isAlive();

    if (isAlive) {
      res.status(200).json({
        success: true,
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } else {
      logger.error('Liveness check failed - service is dead');
      res.status(500).json({
        success: false,
        status: 'dead',
        timestamp: new Date().toISOString(),
        message: 'Service is not responding',
      });
    }
  })
);

/**
 * Startup probe endpoint
 * Used by Kubernetes to check if service has started
 * Similar to readiness but for initial startup
 * 
 * GET /health/startup
 */
router.get(
  '/startup',
  asyncHandler(async (req: Request, res: Response) => {
    // Startup check is similar to readiness but may have different thresholds
    const isReady = await HealthCheckService.isReady();

    if (isReady) {
      res.status(200).json({
        success: true,
        status: 'started',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        success: false,
        status: 'starting',
        timestamp: new Date().toISOString(),
      });
    }
  })
);

export default router;
