/**
 * TenantService - SaaSEngine / Hard Gate (Fonte 5, TenantMiddleware spec)
 * Validates tenant existence and status. Supports Redis cache (5 min TTL).
 */

import { db } from '../models/database.js';
import { redisClient } from './redis.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const CACHE_KEY_PREFIX = 'tenant:';
const CACHE_TTL_SEC = 5 * 60; // 5 minutes

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'INACTIVE' | 'TRIAL' | 'EXPIRED';

export interface Tenant {
  tenant_id: string;
  name: string;
  status: TenantStatus;
  config_hard_gates: Record<string, unknown>;
}

/**
 * Fetch tenant by tenant_id (isolation key). Uses Redis cache when available.
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `${CACHE_KEY_PREFIX}${tenantId}`;

  if (config.redis.enabled && redisClient.isAvailable()) {
    try {
      const client = redisClient.getClient();
      const cached = await client.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Tenant;
      }
    } catch (e) {
      logger.warn('Tenant cache get failed, falling back to DB', { tenantId, error: e });
    }
  }

  const result = await db.query<{
    tenant_id: string;
    name: string;
    status: string;
    config_hard_gates: Record<string, unknown>;
  }>(
    `SELECT tenant_id, name, status, config_hard_gates
     FROM tenants
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const tenant: Tenant = {
    tenant_id: row.tenant_id,
    name: row.name,
    status: row.status as TenantStatus,
    config_hard_gates: row.config_hard_gates ?? {},
  };

  if (config.redis.enabled && redisClient.isAvailable()) {
    try {
      const client = redisClient.getClient();
      await client.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(tenant));
    } catch (e) {
      logger.warn('Tenant cache set failed', { tenantId, error: e });
    }
  }

  return tenant;
}

/**
 * Invalidate tenant cache (e.g. when status or config changes).
 */
export async function invalidateTenantCache(tenantId: string): Promise<void> {
  if (!config.redis.enabled || !redisClient.isAvailable()) return;
  try {
    await redisClient.getClient().del(`${CACHE_KEY_PREFIX}${tenantId}`);
  } catch (e) {
    logger.warn('Tenant cache invalidate failed', { tenantId, error: e });
  }
}
