import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Database connection pool
 * Singleton pattern for connection management
 */
class Database {
  private pool: Pool | null = null;

  /**
   * Initialize database connection pool
   */
  initialize(): void {
    if (this.pool) {
      logger.warn('Database pool already initialized');
      return;
    }

    // Load-safe defaults for production
    const maxConnections = parseInt(process.env.DB_POOL_MAX || '20', 10);
    const minConnections = parseInt(process.env.DB_POOL_MIN || '5', 10);
    const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10);
    const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
    const statementTimeout = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10);

    this.pool = new Pool({
      connectionString: config.database.url,
      max: maxConnections, // Maximum number of clients in the pool
      min: minConnections, // Minimum number of clients in the pool
      idleTimeoutMillis: idleTimeout, // Close idle clients after 30s
      connectionTimeoutMillis: connectionTimeout, // Timeout when acquiring connection
      statement_timeout: statementTimeout, // Query timeout
      query_timeout: statementTimeout, // Query timeout (alternative)
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err });
    });

    logger.info('Database connection pool initialized');
  }

  /**
   * Get database connection pool
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call initialize() first.');
    }
    return this.pool;
  }

  /**
   * Execute a query
   */
  async query<T = unknown>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    const start = Date.now();
    
    try {
      const result = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text.substring(0, 100),
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query error', {
        query: text.substring(0, 100),
        duration: `${duration}ms`,
        error,
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return pool.connect();
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection pool closed');
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT NOW()');
      return true;
    } catch (error) {
      logger.error('Database connection test failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const db = new Database();


