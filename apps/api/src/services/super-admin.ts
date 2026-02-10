import { db } from '../models/database.js';
import { TenantManagementModel, Tenant } from '../models/tenant-management.js';
import { WhiteLabelConfigModel } from '../models/white-label-config.js';
import { TenantStorageUsageModel } from '../models/tenant-storage-usage.js';
import { TenantQuotaModel, TenantQuota } from '../models/tenant-storage-usage.js';
import { logger } from '../utils/logger.js';
import { AuditService, AuditAction, AuditEventCategory } from './audit.js';

export interface TenantDashboardStats {
  tenant: Tenant;
  storage_usage: {
    total_bytes: number;
    document_bytes: number;
    usage_percentage: number;
    quota_bytes: number | null;
  };
  user_count: number;
  active_user_count: number;
  document_count: number;
  process_count: number;
  asset_count: number;
  investor_count: number;
  quota: TenantQuota | null;
  white_label_config: any | null;
}

export interface TenantProvisioningResult {
  tenant: Tenant;
  quota: TenantQuota;
  white_label_config: any | null;
}

/**
 * Super Admin Service
 * Manages tenant provisioning, suspension, and super admin operations
 */
export class SuperAdminService {
  /**
   * Provision new tenant
   */
  static async provisionTenant(
    input: {
      name: string;
      tenant_code?: string;
      domain?: string;
      subscription_plan?: string;
      contact_email?: string;
      quotas?: {
        max_storage_bytes?: number;
        max_users?: number;
        max_documents?: number;
      };
      white_label?: {
        company_name?: string;
        primary_color?: string;
      };
    },
    userId: string
  ): Promise<TenantProvisioningResult> {
    // Create tenant
    const tenant = await TenantManagementModel.create({
      name: input.name,
      tenant_code: input.tenant_code,
      domain: input.domain,
      subscription_plan: input.subscription_plan as any,
      contact_email: input.contact_email,
    });

    // Create default quotas
    const quota = await TenantQuotaModel.createOrUpdate(
      {
        tenant_id: tenant.id,
        ...input.quotas,
      },
      userId
    );

    // Create white-label config if provided
    let whiteLabelConfig = null;
    if (input.white_label) {
      whiteLabelConfig = await WhiteLabelConfigModel.createOrUpdate(
        {
          tenant_id: tenant.id,
          ...input.white_label,
        },
        userId
      );
    }

    logger.info('Tenant provisioned', {
      tenantId: tenant.id,
      tenantCode: tenant.tenant_code,
      userId,
    });

    return {
      tenant,
      quota,
      white_label_config: whiteLabelConfig,
    };
  }

  /**
   * Suspend tenant
   */
  static async suspendTenant(
    tenantId: string,
    userId: string,
    reason: string
  ): Promise<Tenant> {
    const tenant = await TenantManagementModel.suspend(tenantId, userId, reason);

    // Audit suspension
    await AuditService.log({
      tenantId,
      userId,
      userEmail: 'super_admin',
      userRole: 'SUPER_ADMIN',
      action: AuditAction.UPDATE,
      eventType: 'super_admin.tenant.suspend',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'tenant',
      resourceId: tenantId,
      description: `Tenant suspended: ${reason}`,
      details: {
        reason,
        suspended_at: tenant.suspended_at,
      },
    });

    logger.warn('Tenant suspended', {
      tenantId,
      reason,
      userId,
    });

    return tenant;
  }

  /**
   * Reactivate tenant
   */
  static async reactivateTenant(tenantId: string, userId: string): Promise<Tenant> {
    const tenant = await TenantManagementModel.reactivate(tenantId, userId);

    // Audit reactivation
    await AuditService.log({
      tenantId,
      userId,
      userEmail: 'super_admin',
      userRole: 'SUPER_ADMIN',
      action: AuditAction.UPDATE,
      eventType: 'super_admin.tenant.reactivate',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'tenant',
      resourceId: tenantId,
      description: 'Tenant reactivated',
    });

    logger.info('Tenant reactivated', {
      tenantId,
      userId,
    });

    return tenant;
  }

  /**
   * Get tenant dashboard stats
   */
  static async getTenantDashboard(tenantId: string): Promise<TenantDashboardStats> {
    const tenant = await TenantManagementModel.findById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Get storage usage
    let storageUsage = await TenantStorageUsageModel.getCurrentUsage(tenantId);
    if (!storageUsage) {
      storageUsage = await TenantStorageUsageModel.calculateUsage(tenantId);
    }

    // Get quota
    const quota = await TenantQuotaModel.findByTenantId(tenantId);

    // Get counts
    const userCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const activeUserCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL`,
      [tenantId]
    );
    const docCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const processCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM processes WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const assetCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM real_estate_assets WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const investorCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM investor_users WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    // Get white-label config
    const whiteLabelConfig = await WhiteLabelConfigModel.findByTenantId(tenantId);

    const quotaBytes = quota?.max_storage_bytes || null;
    const usagePercentage = quotaBytes 
      ? Math.round((storageUsage.total_storage_bytes / quotaBytes) * 100)
      : 0;

    return {
      tenant,
      storage_usage: {
        total_bytes: storageUsage.total_storage_bytes,
        document_bytes: storageUsage.document_storage_bytes,
        usage_percentage: usagePercentage,
        quota_bytes: quotaBytes,
      },
      user_count: parseInt(userCount.rows[0].count, 10),
      active_user_count: parseInt(activeUserCount.rows[0].count, 10),
      document_count: parseInt(docCount.rows[0].count, 10),
      process_count: parseInt(processCount.rows[0].count, 10),
      asset_count: parseInt(assetCount.rows[0].count, 10),
      investor_count: parseInt(investorCount.rows[0].count, 10),
      quota,
      white_label_config: whiteLabelConfig,
    };
  }

  /**
   * Get super admin dashboard (all tenants overview)
   */
  static async getSuperAdminDashboard(): Promise<{
    total_tenants: number;
    active_tenants: number;
    suspended_tenants: number;
    total_storage_bytes: number;
    tenants: Array<{
      id: string;
      name: string;
      status: string;
      storage_bytes: number;
      user_count: number;
    }>;
  }> {
    // Get tenant counts
    const totalResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenants`
    );
    const activeResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenants WHERE status = 'ACTIVE'`
    );
    const suspendedResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenants WHERE status = 'SUSPENDED'`
    );

    // Get storage totals
    const storageResult = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(total_storage_bytes), 0) as total
       FROM (
         SELECT DISTINCT ON (tenant_id) total_storage_bytes
         FROM tenant_storage_usage
         ORDER BY tenant_id, measurement_date DESC
       ) t`
    );

    // Get tenant list with stats
    const tenantsResult = await db.query<{
      id: string;
      name: string;
      status: string;
      storage_bytes: string;
      user_count: string;
    }>(
      `SELECT 
         t.id,
         t.name,
         t.status,
         COALESCE(tsu.total_storage_bytes, 0) as storage_bytes,
         COALESCE(u.user_count, 0) as user_count
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT total_storage_bytes
         FROM tenant_storage_usage
         WHERE tenant_id = t.id
         ORDER BY measurement_date DESC
         LIMIT 1
       ) tsu ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as user_count
         FROM users
         WHERE tenant_id = t.id AND deleted_at IS NULL
       ) u ON true
       ORDER BY t.created_at DESC
       LIMIT 50`
    );

    return {
      total_tenants: parseInt(totalResult.rows[0].count, 10),
      active_tenants: parseInt(activeResult.rows[0].count, 10),
      suspended_tenants: parseInt(suspendedResult.rows[0].count, 10),
      total_storage_bytes: parseInt(storageResult.rows[0].total, 10),
      tenants: tenantsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        storage_bytes: parseInt(row.storage_bytes, 10),
        user_count: parseInt(row.user_count, 10),
      })),
    };
  }
}
