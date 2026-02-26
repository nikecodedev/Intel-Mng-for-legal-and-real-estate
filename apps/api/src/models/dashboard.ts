import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type DashboardType = 'EXECUTIVE' | 'OPERATIONAL' | 'FINANCIAL' | 'LEGAL' | 'CUSTOM';
export type KPIType = 'CASH_FLOW' | 'DEADLINES' | 'ROI' | 'RISK_EXPOSURE' | 'CUSTOM';
export type PeriodType = 'REALTIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

export interface DashboardConfig {
  id: string;
  tenant_id: string;
  dashboard_name: string;
  dashboard_type: DashboardType;
  visible_to_roles: string[];
  visible_to_permissions: string[];
  layout_config: Record<string, unknown>;
  kpi_widgets: unknown[];
  auto_refresh_interval_seconds: number;
  cache_ttl_seconds: number;
  is_active: boolean;
  is_default: boolean;
  created_by: string | null;
  updated_by: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface DashboardKPICache {
  id: string;
  tenant_id: string;
  kpi_type: KPIType;
  kpi_name: string;
  kpi_value: Record<string, unknown>;
  kpi_metadata: Record<string, unknown>;
  period_type: PeriodType;
  period_start: Date | null;
  period_end: Date | null;
  calculated_at: Date;
  expires_at: Date;
  cache_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDashboardConfigInput {
  tenant_id: string;
  dashboard_name: string;
  dashboard_type: DashboardType;
  visible_to_roles: string[];
  visible_to_permissions?: string[];
  layout_config?: Record<string, unknown>;
  kpi_widgets?: unknown[];
  auto_refresh_interval_seconds?: number;
  cache_ttl_seconds?: number;
  is_default?: boolean;
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapDashboardConfigRow(row: any): DashboardConfig {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    dashboard_name: row.dashboard_name as string,
    dashboard_type: row.dashboard_type as DashboardType,
    visible_to_roles: Array.isArray(row.visible_to_roles) ? (row.visible_to_roles as string[]) : [],
    visible_to_permissions: Array.isArray(row.visible_to_permissions) ? (row.visible_to_permissions as string[]) : [],
    layout_config: (row.layout_config as Record<string, unknown>) || {},
    kpi_widgets: Array.isArray(row.kpi_widgets) ? row.kpi_widgets : [],
    auto_refresh_interval_seconds: Number(row.auto_refresh_interval_seconds) || 60,
    cache_ttl_seconds: Number(row.cache_ttl_seconds) || 300,
    is_active: Boolean(row.is_active),
    is_default: Boolean(row.is_default),
    created_by: (row.created_by as string) ?? null,
    updated_by: (row.updated_by as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

function mapKPICacheRow(row: any): DashboardKPICache {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    kpi_type: row.kpi_type as KPIType,
    kpi_name: row.kpi_name as string,
    kpi_value: (row.kpi_value as Record<string, unknown>) || {},
    kpi_metadata: (row.kpi_metadata as Record<string, unknown>) || {},
    period_type: row.period_type as PeriodType,
    period_start: row.period_start ? new Date(row.period_start as string) : null,
    period_end: row.period_end ? new Date(row.period_end as string) : null,
    calculated_at: new Date(row.calculated_at as string),
    expires_at: new Date(row.expires_at as string),
    cache_version: Number(row.cache_version) || 1,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

/**
 * Dashboard Config Model
 * Manages dashboard configurations with role-based visibility
 */
export class DashboardConfigModel {
  /**
   * Find dashboard by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<DashboardConfig | null> {
    requireTenantId(tenantId, 'DashboardConfigModel.findById');
    
    const result: QueryResult<DashboardConfig> = await db.query<DashboardConfig>(
      `SELECT * FROM dashboard_configs 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapDashboardConfigRow(result.rows[0]) : null;
  }

  /**
   * Get dashboards visible to user role
   */
  static async getVisibleDashboards(
    tenantId: string,
    userRole: string,
    userPermissions: string[] = []
  ): Promise<DashboardConfig[]> {
    requireTenantId(tenantId, 'DashboardConfigModel.getVisibleDashboards');
    
    const result: QueryResult<DashboardConfig> = await db.query<DashboardConfig>(
      `SELECT * FROM dashboard_configs 
       WHERE tenant_id = $1 
         AND deleted_at IS NULL 
         AND is_active = true
         AND (
           $2 = ANY(visible_to_roles) OR
           visible_to_roles = '{}' OR
           (array_length(visible_to_permissions, 1) IS NOT NULL AND 
            visible_to_permissions && $3::text[])
         )
       ORDER BY is_default DESC, dashboard_name ASC`,
      [tenantId, userRole, userPermissions]
    );
    return result.rows.map(mapDashboardConfigRow);
  }

  /**
   * Create dashboard config
   */
  static async create(input: CreateDashboardConfigInput, userId: string): Promise<DashboardConfig> {
    requireTenantId(input.tenant_id, 'DashboardConfigModel.create');
    
    const result: QueryResult<DashboardConfig> = await db.query<DashboardConfig>(
      `INSERT INTO dashboard_configs 
       (tenant_id, dashboard_name, dashboard_type, visible_to_roles, visible_to_permissions,
        layout_config, kpi_widgets, auto_refresh_interval_seconds, cache_ttl_seconds,
        is_default, created_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.tenant_id,
        input.dashboard_name,
        input.dashboard_type,
        input.visible_to_roles,
        input.visible_to_permissions || [],
        JSON.stringify(input.layout_config || {}),
        JSON.stringify(input.kpi_widgets || []),
        input.auto_refresh_interval_seconds || 60,
        input.cache_ttl_seconds || 300,
        input.is_default || false,
        userId,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return mapDashboardConfigRow(result.rows[0]);
  }
}

/**
 * Dashboard KPI Cache Model
 * Manages cached KPI values
 */
export class DashboardKPICacheModel {
  /**
   * Get cached KPI value
   */
  static async getCachedKPI(
    tenantId: string,
    kpiType: KPIType,
    kpiName: string,
    periodType: PeriodType = 'REALTIME',
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<DashboardKPICache | null> {
    requireTenantId(tenantId, 'DashboardKPICacheModel.getCachedKPI');
    
    const conditions: string[] = [
      'tenant_id = $1',
      'kpi_type = $2',
      'kpi_name = $3',
      'period_type = $4',
      'expires_at > CURRENT_TIMESTAMP',
    ];
    const values: unknown[] = [tenantId, kpiType, kpiName, periodType];
    let paramCount = 5;

    if (periodStart) {
      conditions.push(`period_start = $${paramCount++}`);
      values.push(periodStart);
    }
    if (periodEnd) {
      conditions.push(`period_end = $${paramCount++}`);
      values.push(periodEnd);
    }

    const result: QueryResult<DashboardKPICache> = await db.query<DashboardKPICache>(
      `SELECT * FROM dashboard_kpi_cache 
       WHERE ${conditions.join(' AND ')}
       ORDER BY calculated_at DESC
       LIMIT 1`,
      values
    );
    return result.rows[0] ? mapKPICacheRow(result.rows[0]) : null;
  }

  /**
   * Cache KPI value
   */
  static async cacheKPI(
    tenantId: string,
    kpiType: KPIType,
    kpiName: string,
    kpiValue: Record<string, unknown>,
    periodType: PeriodType = 'REALTIME',
    ttlSeconds: number = 300,
    periodStart?: Date,
    periodEnd?: Date,
    metadata?: Record<string, unknown>
  ): Promise<DashboardKPICache> {
    requireTenantId(tenantId, 'DashboardKPICacheModel.cacheKPI');
    
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + ttlSeconds);

    const result: QueryResult<DashboardKPICache> = await db.query<DashboardKPICache>(
      `INSERT INTO dashboard_kpi_cache 
       (tenant_id, kpi_type, kpi_name, kpi_value, kpi_metadata, period_type,
        period_start, period_end, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, kpi_type, kpi_name, period_type, period_start, period_end) 
       DO UPDATE SET
         kpi_value = EXCLUDED.kpi_value,
         kpi_metadata = EXCLUDED.kpi_metadata,
         calculated_at = CURRENT_TIMESTAMP,
         expires_at = EXCLUDED.expires_at,
         cache_version = dashboard_kpi_cache.cache_version + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        tenantId,
        kpiType,
        kpiName,
        JSON.stringify(kpiValue),
        JSON.stringify(metadata || {}),
        periodType,
        periodStart || null,
        periodEnd || null,
        expiresAt,
      ]
    );
    return mapKPICacheRow(result.rows[0]);
  }
}
