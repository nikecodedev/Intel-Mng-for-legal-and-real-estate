import { db } from '../models/database.js';
import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latency?: number;
  details?: Record<string, unknown>;
}

/**
 * Health Check Service
 * Performs comprehensive health checks for dependencies
 */
export class HealthCheckService {
  /**
   * Check database connectivity
   */
  static async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const isConnected = await db.testConnection();
      const latency = Date.now() - startTime;

      if (isConnected) {
        return {
          name: 'database',
          status: 'healthy',
          message: 'Database connection successful',
          latency,
        };
      } else {
        return {
          name: 'database',
          status: 'unhealthy',
          message: 'Database connection failed',
          latency,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('Database health check failed', { error, latency });
      return {
        name: 'database',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency,
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  static async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      if (!redisClient.isAvailable()) {
        return {
          name: 'redis',
          status: 'degraded',
          message: 'Redis is disabled or unavailable',
          latency: Date.now() - startTime,
        };
      }

      const isConnected = await redisClient.testConnection();
      const latency = Date.now() - startTime;

      if (isConnected) {
        return {
          name: 'redis',
          status: 'healthy',
          message: 'Redis connection successful',
          latency,
        };
      } else {
        return {
          name: 'redis',
          status: 'unhealthy',
          message: 'Redis connection failed',
          latency,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('Redis health check failed', { error, latency });
      return {
        name: 'redis',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency,
      };
    }
  }

  /**
   * Check memory usage
   */
  static checkMemory(): HealthCheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    // Consider unhealthy if heap usage > 90%
    const status = heapUsagePercent > 90 ? 'unhealthy' : heapUsagePercent > 75 ? 'degraded' : 'healthy';

    return {
      name: 'memory',
      status,
      message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${Math.round(heapUsagePercent)}%)`,
      details: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        rss: rssMB,
        heapUsagePercent: Math.round(heapUsagePercent),
        external: Math.round(usage.external / 1024 / 1024),
      },
    };
  }

  /**
   * Check disk space (if applicable)
   */
  static checkDisk(): HealthCheckResult {
    // In Kubernetes, disk space is typically managed by the cluster
    // This is a placeholder for custom disk checks
    return {
      name: 'disk',
      status: 'healthy',
      message: 'Disk check not implemented (managed by Kubernetes)',
    };
  }

  /**
   * Perform all health checks
   */
  static async performAllChecks(): Promise<{
    overall: 'healthy' | 'unhealthy' | 'degraded';
    checks: HealthCheckResult[];
    timestamp: string;
    uptime: number;
  }> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      Promise.resolve(this.checkMemory()),
      Promise.resolve(this.checkDisk()),
    ]);

    // Determine overall status
    const hasUnhealthy = checks.some((check) => check.status === 'unhealthy');
    const hasDegraded = checks.some((check) => check.status === 'degraded');

    let overall: 'healthy' | 'unhealthy' | 'degraded';
    if (hasUnhealthy) {
      overall = 'unhealthy';
    } else if (hasDegraded) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return {
      overall,
      checks,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Check if service is ready (all critical dependencies healthy)
   */
  static async isReady(): Promise<boolean> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    // Service is ready if all critical dependencies are healthy
    return checks.every((check) => check.status === 'healthy');
  }

  /**
   * Check if service is alive (basic liveness check)
   */
  static isAlive(): boolean {
    // Basic check: process is running and not out of memory
    const memoryCheck = this.checkMemory();
    return memoryCheck.status !== 'unhealthy';
  }
}


