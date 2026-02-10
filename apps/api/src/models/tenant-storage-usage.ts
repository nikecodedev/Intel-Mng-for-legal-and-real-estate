import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

export interface TenantStorageUsage {
  id: string;
  tenant_id: string;
  total_storage_bytes: number;
  document_storage_bytes: number;
  database_storage_bytes: number;
  backup_storage_bytes: number;
  total_files: number;
  document_count: number;
  usage_breakdown: Record<string, unknown>;
  measurement_date: Date;
  last_calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TenantQuota {
  id: string;
  tenant_id: string;
  max_storage_bytes: number | null;
  max_document_storage_bytes: number | null;
  max_database_storage_bytes: number | null;
  max_users: number | null;
  max_active_users: number | null;
  max_processes: number | null;
  max_documents: number | null;
  max_assets: number | null;
  max_investors: number | null;
  max_api_requests_per_day: number | null;
  max_api_requests_per_month: number | null;
  features_enabled: string[];
  features_disabled: string[];
  enforce_storage_quota: boolean;
  enforce_user_quota: boolean;
  enforce_api_quota: boolean;
  storage_quota_overridden: boolean;
  user_quota_overridden: boolean;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

export interface CreateTenantQuotaInput {
  tenant_id: string;
  max_storage_bytes?: number;
  max_document_storage_bytes?: number;
  max_database_storage_bytes?: number;
  max_users?: number;
  max_active_users?: number;
  max_processes?: number;
  max_documents?: number;
  max_assets?: number;
  max_investors?: number;
  max_api_requests_per_day?: number;
  max_api_requests_per_month?: number;
  features_enabled?: string[];
  features_disabled?: string[];
  enforce_storage_quota?: boolean;
  enforce_user_quota?: boolean;
  enforce_api_quota?: boolean;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapStorageUsageRow(row: Record<string, unknown>): TenantStorageUsage {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    total_storage_bytes: Number(row.total_storage_bytes) || 0,
    document_storage_bytes: Number(row.document_storage_bytes) || 0,
    database_storage_bytes: Number(row.database_storage_bytes) || 0,
    backup_storage_bytes: Number(row.backup_storage_bytes) || 0,
    total_files: Number(row.total_files) || 0,
    document_count: Number(row.document_count) || 0,
    usage_breakdown: (row.usage_breakdown as Record<string, unknown>) || {},
    measurement_date: new Date(row.measurement_date as string),
    last_calculated_at: new Date(row.last_calculated_at as string),
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

function mapQuotaRow(row: Record<string, unknown>): TenantQuota {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    max_storage_bytes: row.max_storage_bytes ? Number(row.max_storage_bytes) : null,
    max_document_storage_bytes: row.max_document_storage_bytes ? Number(row.max_document_storage_bytes) : null,
    max_database_storage_bytes: row.max_database_storage_bytes ? Number(row.max_database_storage_bytes) : null,
    max_users: row.max_users ? Number(row.max_users) : null,
    max_active_users: row.max_active_users ? Number(row.max_active_users) : null,
    max_processes: row.max_processes ? Number(row.max_processes) : null,
    max_documents: row.max_documents ? Number(row.max_documents) : null,
    max_assets: row.max_assets ? Number(row.max_assets) : null,
    max_investors: row.max_investors ? Number(row.max_investors) : null,
    max_api_requests_per_day: row.max_api_requests_per_day ? Number(row.max_api_requests_per_day) : null,
    max_api_requests_per_month: row.max_api_requests_per_month ? Number(row.max_api_requests_per_month) : null,
    features_enabled: Array.isArray(row.features_enabled) ? (row.features_enabled as string[]) : [],
    features_disabled: Array.isArray(row.features_disabled) ? (row.features_disabled as string[]) : [],
    enforce_storage_quota: Boolean(row.enforce_storage_quota),
    enforce_user_quota: Boolean(row.enforce_user_quota),
    enforce_api_quota: Boolean(row.enforce_api_quota),
    storage_quota_overridden: Boolean(row.storage_quota_overridden),
    user_quota_overridden: Boolean(row.user_quota_overridden),
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    updated_by: (row.updated_by as string) ?? null,
  };
}

/**
 * Tenant Storage Usage Model
 * Tracks storage usage per tenant
 */
export class TenantStorageUsageModel {
  /**
   * Get current storage usage for tenant
   */
  static async getCurrentUsage(tenantId: string): Promise<TenantStorageUsage | null> {
    requireTenantId(tenantId, 'TenantStorageUsageModel.getCurrentUsage');
    
    const result: QueryResult<TenantStorageUsage> = await db.query<TenantStorageUsage>(
      `SELECT * FROM tenant_storage_usage 
       WHERE tenant_id = $1
       ORDER BY measurement_date DESC, created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    return result.rows[0] ? mapStorageUsageRow(result.rows[0]) : null;
  }

  /**
   * Calculate and update storage usage
   */
  static async calculateUsage(tenantId: string): Promise<TenantStorageUsage> {
    requireTenantId(tenantId, 'TenantStorageUsageModel.calculateUsage');
    
    // Calculate document storage
    const docResult = await db.query<{
      total_bytes: string;
      file_count: string;
    }>(
      `SELECT 
         COALESCE(SUM(LENGTH(storage_path) + 1000), 0) as total_bytes,
         COUNT(*) as file_count
       FROM documents
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    const documentBytes = parseInt(docResult.rows[0]?.total_bytes || '0', 10);
    const documentCount = parseInt(docResult.rows[0]?.file_count || '0', 10);

    // Estimate database storage (simplified)
    const dbBytes = 0; // Would calculate from actual table sizes
    const backupBytes = 0; // Would calculate from backup sizes

    const totalBytes = documentBytes + dbBytes + backupBytes;

    // Upsert usage record
    const result: QueryResult<TenantStorageUsage> = await db.query<TenantStorageUsage>(
      `INSERT INTO tenant_storage_usage 
       (tenant_id, total_storage_bytes, document_storage_bytes, database_storage_bytes,
        backup_storage_bytes, total_files, document_count, usage_breakdown, measurement_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
       ON CONFLICT (tenant_id, measurement_date) DO UPDATE SET
         total_storage_bytes = EXCLUDED.total_storage_bytes,
         document_storage_bytes = EXCLUDED.document_storage_bytes,
         database_storage_bytes = EXCLUDED.database_storage_bytes,
         backup_storage_bytes = EXCLUDED.backup_storage_bytes,
         total_files = EXCLUDED.total_files,
         document_count = EXCLUDED.document_count,
         usage_breakdown = EXCLUDED.usage_breakdown,
         last_calculated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        tenantId,
        totalBytes,
        documentBytes,
        dbBytes,
        backupBytes,
        documentCount,
        documentCount,
        JSON.stringify({
          documents: documentBytes,
          database: dbBytes,
          backups: backupBytes,
        }),
      ]
    );

    return mapStorageUsageRow(result.rows[0]);
  }
}

/**
 * Tenant Quota Model
 * Manages quota limits per tenant
 */
export class TenantQuotaModel {
  /**
   * Find quota by tenant ID
   */
  static async findByTenantId(tenantId: string): Promise<TenantQuota | null> {
    requireTenantId(tenantId, 'TenantQuotaModel.findByTenantId');
    
    const result: QueryResult<TenantQuota> = await db.query<TenantQuota>(
      `SELECT * FROM tenant_quotas WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0] ? mapQuotaRow(result.rows[0]) : null;
  }

  /**
   * Create or update quota
   */
  static async createOrUpdate(input: CreateTenantQuotaInput, userId: string): Promise<TenantQuota> {
    requireTenantId(input.tenant_id, 'TenantQuotaModel.createOrUpdate');
    
    const existing = await this.findByTenantId(input.tenant_id);
    
    if (existing) {
      // Update existing quota
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (input.max_storage_bytes !== undefined) {
        updates.push(`max_storage_bytes = $${paramCount++}`);
        values.push(input.max_storage_bytes);
      }
      if (input.max_document_storage_bytes !== undefined) {
        updates.push(`max_document_storage_bytes = $${paramCount++}`);
        values.push(input.max_document_storage_bytes);
      }
      if (input.max_users !== undefined) {
        updates.push(`max_users = $${paramCount++}`);
        values.push(input.max_users);
      }
      if (input.max_processes !== undefined) {
        updates.push(`max_processes = $${paramCount++}`);
        values.push(input.max_processes);
      }
      if (input.max_documents !== undefined) {
        updates.push(`max_documents = $${paramCount++}`);
        values.push(input.max_documents);
      }
      if (input.features_enabled !== undefined) {
        updates.push(`features_enabled = $${paramCount++}`);
        values.push(input.features_enabled);
      }
      if (input.features_disabled !== undefined) {
        updates.push(`features_disabled = $${paramCount++}`);
        values.push(input.features_disabled);
      }
      if (input.enforce_storage_quota !== undefined) {
        updates.push(`enforce_storage_quota = $${paramCount++}`);
        values.push(input.enforce_storage_quota);
      }
      if (input.enforce_user_quota !== undefined) {
        updates.push(`enforce_user_quota = $${paramCount++}`);
        values.push(input.enforce_user_quota);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_by = $${paramCount++}`);
      values.push(userId, existing.id, input.tenant_id);

      const result: QueryResult<TenantQuota> = await db.query<TenantQuota>(
        `UPDATE tenant_quotas 
         SET ${updates.join(', ')}
         WHERE id = $${paramCount - 2} AND tenant_id = $${paramCount - 1}
         RETURNING *`,
        values
      );

      return mapQuotaRow(result.rows[0]);
    } else {
      // Create new quota
      const result: QueryResult<TenantQuota> = await db.query<TenantQuota>(
        `INSERT INTO tenant_quotas 
         (tenant_id, max_storage_bytes, max_document_storage_bytes, max_database_storage_bytes,
          max_users, max_active_users, max_processes, max_documents, max_assets, max_investors,
          max_api_requests_per_day, max_api_requests_per_month, features_enabled, features_disabled,
          enforce_storage_quota, enforce_user_quota, enforce_api_quota, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          input.tenant_id,
          input.max_storage_bytes || null,
          input.max_document_storage_bytes || null,
          null, // database_storage_bytes
          input.max_users || null,
          null, // max_active_users
          input.max_processes || null,
          input.max_documents || null,
          null, // max_assets
          null, // max_investors
          input.max_api_requests_per_day || null,
          input.max_api_requests_per_month || null,
          input.features_enabled || [],
          input.features_disabled || [],
          input.enforce_storage_quota !== false,
          input.enforce_user_quota !== false,
          input.enforce_api_quota !== false,
          userId,
        ]
      );
      return mapQuotaRow(result.rows[0]);
    }
  }
}
