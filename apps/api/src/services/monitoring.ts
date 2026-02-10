import { Request, Response } from 'express';
import { db } from '../models/database.js';
import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';

export interface Metrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    by_status: Record<number, number>;
    by_endpoint: Record<string, number>;
  };
  performance: {
    average_response_time_ms: number;
    p95_response_time_ms: number;
    p99_response_time_ms: number;
    max_response_time_ms: number;
  };
  errors: {
    total: number;
    by_type: Record<string, number>;
    recent: Array<{
      timestamp: string;
      type: string;
      message: string;
      endpoint: string;
    }>;
  };
  system: {
    memory_usage_mb: number;
    cpu_usage_percent: number;
    active_connections: number;
    uptime_seconds: number;
  };
  database: {
    total_queries: number;
    slow_queries: number;
    connection_pool_size: number;
    active_connections: number;
  };
  cache: {
    hits: number;
    misses: number;
    hit_rate: number;
    total_keys: number;
  };
}

/**
 * Monitoring Service
 * Collects metrics and provides monitoring hooks
 */
export class MonitoringService {
  private static metrics: Partial<Metrics> = {
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      by_status: {},
      by_endpoint: {},
    },
    performance: {
      average_response_time_ms: 0,
      p95_response_time_ms: 0,
      p99_response_time_ms: 0,
      max_response_time_ms: 0,
    },
    errors: {
      total: 0,
      by_type: {},
      recent: [],
    },
    system: {
      memory_usage_mb: 0,
      cpu_usage_percent: 0,
      active_connections: 0,
      uptime_seconds: 0,
    },
    database: {
      total_queries: 0,
      slow_queries: 0,
      connection_pool_size: 0,
      active_connections: 0,
    },
    cache: {
      hits: 0,
      misses: 0,
      hit_rate: 0,
      total_keys: 0,
    },
  };

  private static responseTimes: number[] = [];
  private static startTime = Date.now();

  /**
   * Middleware to track request metrics
   */
  static requestMetricsMiddleware() {
    return (req: Request, res: Response, next: () => void): void => {
      const startTime = Date.now();
      const endpoint = `${req.method} ${req.path}`;

      // Track request
      this.metrics.requests!.total++;
      this.metrics.requests!.by_endpoint[endpoint] =
        (this.metrics.requests!.by_endpoint[endpoint] || 0) + 1;

      // Track response
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Track status
        this.metrics.requests!.by_status[statusCode] =
          (this.metrics.requests!.by_status[statusCode] || 0) + 1;

        if (statusCode >= 200 && statusCode < 400) {
          this.metrics.requests!.successful++;
        } else {
          this.metrics.requests!.failed++;
        }

        // Track response time
        this.responseTimes.push(duration);
        if (this.responseTimes.length > 1000) {
          this.responseTimes.shift(); // Keep last 1000
        }

        this.updatePerformanceMetrics();
      });

      next();
    };
  }

  /**
   * Track error
   */
  static trackError(error: Error, endpoint: string): void {
    this.metrics.errors!.total++;
    const errorType = error.constructor.name;
    this.metrics.errors!.by_type[errorType] =
      (this.metrics.errors!.by_type[errorType] || 0) + 1;

    // Keep last 100 errors
    this.metrics.errors!.recent.push({
      timestamp: new Date().toISOString(),
      type: errorType,
      message: error.message.substring(0, 200),
      endpoint,
    });
    if (this.metrics.errors!.recent.length > 100) {
      this.metrics.errors!.recent.shift();
    }
  }

  /**
   * Track cache hit
   */
  static trackCacheHit(): void {
    this.metrics.cache!.hits++;
    this.updateCacheMetrics();
  }

  /**
   * Track cache miss
   */
  static trackCacheMiss(): void {
    this.metrics.cache!.misses++;
    this.updateCacheMetrics();
  }

  /**
   * Get current metrics
   */
  static async getMetrics(): Promise<Metrics> {
    // Update system metrics
    await this.updateSystemMetrics();

    // Update database metrics
    await this.updateDatabaseMetrics();

    // Update cache metrics
    await this.updateCacheMetrics();

    return this.metrics as Metrics;
  }

  /**
   * Update performance metrics
   */
  private static updatePerformanceMetrics(): void {
    if (this.responseTimes.length === 0) return;

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    this.metrics.performance!.average_response_time_ms = Math.round(avg);
    this.metrics.performance!.p95_response_time_ms = sorted[p95Index] || 0;
    this.metrics.performance!.p99_response_time_ms = sorted[p99Index] || 0;
    this.metrics.performance!.max_response_time_ms = sorted[sorted.length - 1] || 0;
  }

  /**
   * Update system metrics
   */
  private static async updateSystemMetrics(): Promise<void> {
    const usage = process.memoryUsage();
    this.metrics.system!.memory_usage_mb = Math.round(usage.heapUsed / 1024 / 1024);
    this.metrics.system!.uptime_seconds = Math.floor((Date.now() - this.startTime) / 1000);

    // CPU usage would require external library or OS-level monitoring
    // For now, we'll use a placeholder
    this.metrics.system!.cpu_usage_percent = 0;
  }

  /**
   * Update database metrics
   */
  private static async updateDatabaseMetrics(): Promise<void> {
    try {
      const pool = (db as any).pool;
      if (pool) {
        this.metrics.database!.connection_pool_size = pool.totalCount || 0;
        this.metrics.database!.active_connections = pool.idleCount || 0;
      }
    } catch (error) {
      logger.error('Failed to get database metrics', { error });
    }
  }

  /**
   * Update cache metrics
   */
  private static async updateCacheMetrics(): Promise<void> {
    const total = this.metrics.cache!.hits + this.metrics.cache!.misses;
    this.metrics.cache!.hit_rate = total > 0
      ? Math.round((this.metrics.cache!.hits / total) * 100 * 100) / 100
      : 0;

    try {
      const redis = redisClient.getClient();
      const keys = await redis.dbsize();
      this.metrics.cache!.total_keys = keys;
    } catch (error) {
      logger.error('Failed to get cache metrics', { error });
    }
  }

  /**
   * Reset metrics (for testing)
   */
  static resetMetrics(): void {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        by_status: {},
        by_endpoint: {},
      },
      performance: {
        average_response_time_ms: 0,
        p95_response_time_ms: 0,
        p99_response_time_ms: 0,
        max_response_time_ms: 0,
      },
      errors: {
        total: 0,
        by_type: {},
        recent: [],
      },
      system: {
        memory_usage_mb: 0,
        cpu_usage_percent: 0,
        active_connections: 0,
        uptime_seconds: 0,
      },
      database: {
        total_queries: 0,
        slow_queries: 0,
        connection_pool_size: 0,
        active_connections: 0,
      },
      cache: {
        hits: 0,
        misses: 0,
        hit_rate: 0,
        total_keys: 0,
      },
    };
    this.responseTimes = [];
    this.startTime = Date.now();
  }
}
