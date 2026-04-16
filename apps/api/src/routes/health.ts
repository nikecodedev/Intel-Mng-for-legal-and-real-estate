import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/index.js';
import { db } from '../models/database.js';
import { redisClient } from '../services/redis.js';
import { logger } from '../utils/logger.js';
import { MonitoringService } from '../services/monitoring.js';

const router = Router();

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  services: {
    api: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    database: {
      status: 'healthy' | 'unhealthy';
      response_time_ms?: number;
      message?: string;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      response_time_ms?: number;
      message?: string;
    };
  };
  version: string;
}

const startTime = Date.now();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    });
  })
);

/**
 * GET /health/live
 * Liveness probe (Kubernetes)
 */
router.get(
  '/live',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /health/ready
 * Readiness probe (Kubernetes)
 */
router.get(
  '/ready',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const checks: Record<string, boolean | number> = {};

    // Check database
    try {
      const dbStart = Date.now();
      await db.query('SELECT 1');
      checks.database = true;
      checks.database_response_time_ms = Date.now() - dbStart;
    } catch (error) {
      checks.database = false;
      logger.error('Database health check failed', { error });
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const redis = redisClient.getClient();
      await redis.ping();
      checks.redis = true;
      checks.redis_response_time_ms = Date.now() - redisStart;
    } catch (error) {
      checks.redis = false;
      logger.error('Redis health check failed', { error });
    }

    const isReady = checks.database && checks.redis;
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    });
  })
);

/**
 * GET /health/detailed
 * Detailed health check with all services
 */
router.get(
  '/detailed',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      services: {
        api: {
          status: 'healthy',
        },
        database: {
          status: 'unhealthy',
        },
        redis: {
          status: 'unhealthy',
        },
      },
      version: process.env.APP_VERSION || '1.0.0',
    };

    // Check database
    try {
      const dbStart = Date.now();
      await db.query('SELECT 1');
      result.services.database = {
        status: 'healthy',
        response_time_ms: Date.now() - dbStart,
      };
    } catch (error) {
      result.services.database = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
      };
      result.status = 'unhealthy';
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const redis = redisClient.getClient();
      await redis.ping();
      result.services.redis = {
        status: 'healthy',
        response_time_ms: Date.now() - redisStart,
      };
    } catch (error) {
      result.services.redis = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
      };
      if (result.status === 'healthy') {
        result.status = 'degraded'; // Redis failure is degraded, not unhealthy
      }
    }

    const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(result);
  })
);

/**
 * GET /health/api
 * API service health check
 */
router.get(
  '/api',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    const status = heapUsagePercent > 90 ? 'unhealthy' : heapUsagePercent > 75 ? 'degraded' : 'healthy';
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      status,
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      memory: {
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heap_usage_percent: Math.round(heapUsagePercent),
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      version: process.env.APP_VERSION || '1.0.0',
    });
  })
);

/**
 * GET /health/db
 * Database health check
 */
router.get(
  '/db',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    let status: 'healthy' | 'unhealthy' = 'healthy';
    let message = 'Database connection successful';
    let responseTime: number | undefined;

    try {
      await db.query('SELECT 1');
      responseTime = Date.now() - startTime;
    } catch (error) {
      status = 'unhealthy';
      message = error instanceof Error ? error.message : 'Database connection failed';
      responseTime = Date.now() - startTime;
      logger.error('Database health check failed', { error, responseTime });
    }

    const statusCode = status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      status,
      service: 'database',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      message,
    });
  })
);

/**
 * GET /health/redis
 * Redis health check
 */
router.get(
  '/redis',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Redis connection successful';
    let responseTime: number | undefined;

    try {
      if (!redisClient.isAvailable()) {
        status = 'degraded';
        message = 'Redis is disabled or unavailable';
        responseTime = Date.now() - startTime;
      } else {
        const redis = redisClient.getClient();
        await redis.ping();
        responseTime = Date.now() - startTime;
      }
    } catch (error) {
      status = 'unhealthy';
      message = error instanceof Error ? error.message : 'Redis connection failed';
      responseTime = Date.now() - startTime;
      logger.error('Redis health check failed', { error, responseTime });
    }

    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    res.status(statusCode).json({
      status,
      service: 'redis',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      message,
    });
  })
);

/**
 * GET /health/metrics
 * Prometheus-compatible metrics endpoint — wired to MonitoringService live data.
 */
router.get(
  '/metrics',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const m = await MonitoringService.getMetrics();
    const mem = process.memoryUsage();

    const lines: string[] = [
      `# HELP nodejs_heap_size_total_bytes Process heap total`,
      `# TYPE nodejs_heap_size_total_bytes gauge`,
      `nodejs_heap_size_total_bytes ${mem.heapTotal}`,
      '',
      `# HELP nodejs_heap_size_used_bytes Process heap used`,
      `# TYPE nodejs_heap_size_used_bytes gauge`,
      `nodejs_heap_size_used_bytes ${mem.heapUsed}`,
      '',
      `# HELP nodejs_external_memory_bytes Node.js external memory`,
      `# TYPE nodejs_external_memory_bytes gauge`,
      `nodejs_external_memory_bytes ${mem.external}`,
      '',
      `# HELP nodejs_process_uptime_seconds Process uptime`,
      `# TYPE nodejs_process_uptime_seconds gauge`,
      `nodejs_process_uptime_seconds ${process.uptime()}`,
      '',
      `# HELP http_requests_total Total HTTP requests`,
      `# TYPE http_requests_total counter`,
      `http_requests_total ${m.requests.total}`,
      '',
      `# HELP http_requests_successful_total Successful HTTP requests`,
      `# TYPE http_requests_successful_total counter`,
      `http_requests_successful_total ${m.requests.successful}`,
      '',
      `# HELP http_requests_failed_total Failed HTTP requests`,
      `# TYPE http_requests_failed_total counter`,
      `http_requests_failed_total ${m.requests.failed}`,
      '',
      `# HELP http_response_time_avg_ms Average HTTP response time`,
      `# TYPE http_response_time_avg_ms gauge`,
      `http_response_time_avg_ms ${m.performance.average_response_time_ms}`,
      '',
      `# HELP http_response_time_p95_ms 95th percentile response time`,
      `# TYPE http_response_time_p95_ms gauge`,
      `http_response_time_p95_ms ${m.performance.p95_response_time_ms}`,
      '',
      `# HELP http_response_time_p99_ms 99th percentile response time`,
      `# TYPE http_response_time_p99_ms gauge`,
      `http_response_time_p99_ms ${m.performance.p99_response_time_ms}`,
      '',
      `# HELP app_errors_total Total application errors`,
      `# TYPE app_errors_total counter`,
      `app_errors_total ${m.errors.total}`,
      '',
      `# HELP cache_hits_total Cache hit count`,
      `# TYPE cache_hits_total counter`,
      `cache_hits_total ${m.cache.hits}`,
      '',
      `# HELP cache_misses_total Cache miss count`,
      `# TYPE cache_misses_total counter`,
      `cache_misses_total ${m.cache.misses}`,
      '',
      `# HELP cache_hit_rate Cache hit rate percentage`,
      `# TYPE cache_hit_rate gauge`,
      `cache_hit_rate ${m.cache.hit_rate}`,
      '',
      `# HELP db_pool_size Database connection pool size`,
      `# TYPE db_pool_size gauge`,
      `db_pool_size ${m.database.connection_pool_size}`,
      '',
      `# HELP db_active_connections Active database connections`,
      `# TYPE db_active_connections gauge`,
      `db_active_connections ${m.database.active_connections}`,
      '',
    ];

    // Per-status-code breakdown
    lines.push(`# HELP http_requests_by_status_total Requests broken down by HTTP status code`);
    lines.push(`# TYPE http_requests_by_status_total counter`);
    for (const [code, count] of Object.entries(m.requests.by_status)) {
      lines.push(`http_requests_by_status_total{status="${code}"} ${count}`);
    }
    lines.push('');

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(lines.join('\n'));
  })
);

export default router;
