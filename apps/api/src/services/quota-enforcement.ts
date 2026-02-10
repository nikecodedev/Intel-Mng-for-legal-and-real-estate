import { db } from '../models/database.js';
import { TenantQuotaModel, TenantQuota } from '../models/tenant-storage-usage.js';
import { TenantStorageUsageModel } from '../models/tenant-storage-usage.js';
import { logger } from '../utils/logger.js';

export interface QuotaCheckResult {
  within_quota: boolean;
  quota_type: string;
  current_value: number;
  quota_limit: number | null;
  usage_percentage: number;
  exceeded_by?: number;
}

export interface QuotaViolation {
  quota_type: string;
  current_value: number;
  quota_limit: number;
  exceeded_by: number;
  message: string;
}

/**
 * Quota Enforcement Service
 * Enforces tenant quotas and isolation
 */
export class QuotaEnforcementService {
  /**
   * Check storage quota
   */
  static async checkStorageQuota(tenantId: string): Promise<QuotaCheckResult> {
    const quota = await TenantQuotaModel.findByTenantId(tenantId);
    if (!quota || !quota.enforce_storage_quota) {
      return {
        within_quota: true,
        quota_type: 'storage',
        current_value: 0,
        quota_limit: null,
        usage_percentage: 0,
      };
    }

    const usage = await TenantStorageUsageModel.getCurrentUsage(tenantId);
    const currentBytes = usage?.total_storage_bytes || 0;
    const limit = quota.max_storage_bytes;

    if (limit === null) {
      return {
        within_quota: true,
        quota_type: 'storage',
        current_value: currentBytes,
        quota_limit: null,
        usage_percentage: 0,
      };
    }

    const withinQuota = currentBytes < limit;
    const usagePercentage = Math.round((currentBytes / limit) * 100);
    const exceededBy = withinQuota ? 0 : currentBytes - limit;

    return {
      within_quota: withinQuota,
      quota_type: 'storage',
      current_value: currentBytes,
      quota_limit: limit,
      usage_percentage: usagePercentage,
      exceeded_by: exceededBy > 0 ? exceededBy : undefined,
    };
  }

  /**
   * Check user quota
   */
  static async checkUserQuota(tenantId: string): Promise<QuotaCheckResult> {
    const quota = await TenantQuotaModel.findByTenantId(tenantId);
    if (!quota || !quota.enforce_user_quota) {
      return {
        within_quota: true,
        quota_type: 'users',
        current_value: 0,
        quota_limit: null,
        usage_percentage: 0,
      };
    }

    const userCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users 
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const current = parseInt(userCount.rows[0].count, 10);
    const limit = quota.max_users;

    if (limit === null) {
      return {
        within_quota: true,
        quota_type: 'users',
        current_value: current,
        quota_limit: null,
        usage_percentage: 0,
      };
    }

    const withinQuota = current < limit;
    const usagePercentage = Math.round((current / limit) * 100);
    const exceededBy = withinQuota ? 0 : current - limit;

    return {
      within_quota: withinQuota,
      quota_type: 'users',
      current_value: current,
      quota_limit: limit,
      usage_percentage: usagePercentage,
      exceeded_by: exceededBy > 0 ? exceededBy : undefined,
    };
  }

  /**
   * Check document quota
   */
  static async checkDocumentQuota(tenantId: string): Promise<QuotaCheckResult> {
    const quota = await TenantQuotaModel.findByTenantId(tenantId);
    if (!quota) {
      return {
        within_quota: true,
        quota_type: 'documents',
        current_value: 0,
        quota_limit: null,
        usage_percentage: 0,
      };
    }

    const docCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM documents 
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const current = parseInt(docCount.rows[0].count, 10);
    const limit = quota.max_documents;

    if (limit === null) {
      return {
        within_quota: true,
        quota_type: 'documents',
        current_value: current,
        quota_limit: null,
        usage_percentage: 0,
      };
    }

    const withinQuota = current < limit;
    const usagePercentage = Math.round((current / limit) * 100);
    const exceededBy = withinQuota ? 0 : current - limit;

    return {
      within_quota: withinQuota,
      quota_type: 'documents',
      current_value: current,
      quota_limit: limit,
      usage_percentage: usagePercentage,
      exceeded_by: exceededBy > 0 ? exceededBy : undefined,
    };
  }

  /**
   * Check all quotas for tenant
   */
  static async checkAllQuotas(tenantId: string): Promise<{
    all_within_quota: boolean;
    violations: QuotaViolation[];
    checks: QuotaCheckResult[];
  }> {
    const [storageCheck, userCheck, documentCheck] = await Promise.all([
      this.checkStorageQuota(tenantId),
      this.checkUserQuota(tenantId),
      this.checkDocumentQuota(tenantId),
    ]);

    const checks = [storageCheck, userCheck, documentCheck];
    const violations: QuotaViolation[] = [];

    for (const check of checks) {
      if (!check.within_quota && check.quota_limit !== null) {
        violations.push({
          quota_type: check.quota_type,
          current_value: check.current_value,
          quota_limit: check.quota_limit,
          exceeded_by: check.exceeded_by || 0,
          message: `${check.quota_type} quota exceeded: ${check.current_value} / ${check.quota_limit}`,
        });
      }
    }

    return {
      all_within_quota: violations.length === 0,
      violations,
      checks,
    };
  }

  /**
   * Enforce quota before operation (throws error if quota exceeded)
   */
  static async enforceQuota(
    tenantId: string,
    quotaType: 'storage' | 'users' | 'documents',
    operationValue?: number
  ): Promise<void> {
    let check: QuotaCheckResult;

    switch (quotaType) {
      case 'storage':
        check = await this.checkStorageQuota(tenantId);
        if (operationValue) {
          // Check if adding operationValue would exceed quota
          const quota = await TenantQuotaModel.findByTenantId(tenantId);
          if (quota?.max_storage_bytes && quota.enforce_storage_quota) {
            const newTotal = check.current_value + operationValue;
            if (newTotal > quota.max_storage_bytes) {
              throw new Error(
                `Storage quota exceeded. Current: ${check.current_value} bytes, ` +
                `Limit: ${quota.max_storage_bytes} bytes, ` +
                `Operation would add: ${operationValue} bytes`
              );
            }
          }
        }
        break;
      case 'users':
        check = await this.checkUserQuota(tenantId);
        break;
      case 'documents':
        check = await this.checkDocumentQuota(tenantId);
        break;
    }

    if (!check.within_quota && check.quota_limit !== null) {
      throw new Error(
        `${quotaType} quota exceeded: ${check.current_value} / ${check.quota_limit}`
      );
    }
  }
}
