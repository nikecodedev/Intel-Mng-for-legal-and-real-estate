import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware';
import { NotFoundError, ValidationError } from '../utils/errors';
import { TenantManagementModel, TenantStatus, SubscriptionPlan } from '../models/tenant-management';
import { WhiteLabelConfigModel } from '../models/white-label-config';
import { TenantStorageUsageModel } from '../models/tenant-storage-usage';
import { TenantQuotaModel } from '../models/tenant-storage-usage';
import { SuperAdminService } from '../services/super-admin';
import { QuotaEnforcementService } from '../services/quota-enforcement';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const provisionTenantSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    tenant_code: z.string().optional(),
    domain: z.string().optional(),
    subscription_plan: z.enum(['FREE', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CUSTOM']).optional(),
    contact_email: z.string().email().optional(),
    quotas: z.object({
      max_storage_bytes: z.number().int().positive().optional(),
      max_users: z.number().int().positive().optional(),
      max_documents: z.number().int().positive().optional(),
    }).optional(),
    white_label: z.object({
      company_name: z.string().optional(),
      primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }).optional(),
  }),
});

const suspendTenantSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().min(1),
  }),
});

const updateWhiteLabelSchema = z.object({
  params: z.object({
    tenant_id: z.string().uuid(),
  }),
  body: z.object({
    logo_url: z.string().url().optional(),
    logo_file_id: z.string().uuid().optional(),
    favicon_url: z.string().url().optional(),
    company_name: z.string().optional(),
    company_website: z.string().url().optional(),
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    link_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    font_family: z.string().optional(),
    heading_font: z.string().optional(),
    custom_css: z.string().optional(),
  }),
});

// ============================================
// Super Admin Dashboard Routes
// ============================================

/**
 * GET /super-admin/dashboard
 * Get super admin dashboard overview
 */
router.get(
  '/dashboard',
  authenticate,
  requirePermission('super_admin:dashboard'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dashboard = await SuperAdminService.getSuperAdminDashboard();

    res.json({
      success: true,
      dashboard,
    });
  })
);

// ============================================
// Tenant Management Routes
// ============================================

/**
 * POST /super-admin/tenants
 * Provision new tenant
 */
router.post(
  '/tenants',
  authenticate,
  requirePermission('super_admin:provision'),
  validateRequest(provisionTenantSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    const result = await SuperAdminService.provisionTenant(
      {
        name: req.body.name,
        tenant_code: req.body.tenant_code,
        domain: req.body.domain,
        subscription_plan: req.body.subscription_plan,
        contact_email: req.body.contact_email,
        quotas: req.body.quotas,
        white_label: req.body.white_label,
      },
      userId
    );

    // Audit tenant provisioning
    await AuditService.log({
      tenantId: result.tenant.id,
      userId,
      userEmail: req.user!.email,
      userRole: 'SUPER_ADMIN',
      action: AuditAction.CREATE,
      eventType: 'super_admin.tenant.provision',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'tenant',
      resourceId: result.tenant.id,
      description: `Tenant provisioned: ${result.tenant.name}`,
      details: {
        tenant_code: result.tenant.tenant_code,
        subscription_plan: result.tenant.subscription_plan,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      ...result,
    });
  })
);

/**
 * GET /super-admin/tenants
 * List all tenants
 */
router.get(
  '/tenants',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const status = req.query.status as TenantStatus | undefined;
    const subscription_plan = req.query.subscription_plan as SubscriptionPlan | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { tenants, total } = await TenantManagementModel.list({
      status,
      subscription_plan,
      limit,
      offset,
    });

    res.json({
      success: true,
      tenants,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /super-admin/tenants/:id
 * Get single tenant
 */
router.get(
  '/tenants/:id',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const tenant = await TenantManagementModel.findById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    res.json({
      success: true,
      tenant,
    });
  })
);

/**
 * GET /super-admin/tenants/:id/dashboard
 * Get tenant dashboard stats
 */
router.get(
  '/tenants/:id/dashboard',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const dashboard = await SuperAdminService.getTenantDashboard(id);

    res.json({
      success: true,
      dashboard,
    });
  })
);

/**
 * PUT /super-admin/tenants/:id
 * Update tenant
 */
router.put(
  '/tenants/:id',
  authenticate,
  requirePermission('super_admin:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.id;

    const tenant = await TenantManagementModel.update(id, req.body);

    // Audit update
    await AuditService.log({
      tenantId: id,
      userId,
      userEmail: req.user!.email,
      userRole: 'SUPER_ADMIN',
      action: AuditAction.UPDATE,
      eventType: 'super_admin.tenant.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'tenant',
      resourceId: id,
      description: `Tenant updated`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      tenant,
    });
  })
);

/**
 * POST /super-admin/tenants/:id/suspend
 * Suspend tenant
 */
router.post(
  '/tenants/:id/suspend',
  authenticate,
  requirePermission('super_admin:suspend'),
  validateRequest(suspendTenantSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.id;
    const { reason } = req.body;

    const tenant = await SuperAdminService.suspendTenant(id, userId, reason);

    res.json({
      success: true,
      tenant,
      message: 'Tenant suspended',
    });
  })
);

/**
 * POST /super-admin/tenants/:id/reactivate
 * Reactivate tenant
 */
router.post(
  '/tenants/:id/reactivate',
  authenticate,
  requirePermission('super_admin:reactivate'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.id;

    const tenant = await SuperAdminService.reactivateTenant(id, userId);

    res.json({
      success: true,
      tenant,
      message: 'Tenant reactivated',
    });
  })
);

// ============================================
// White-Label Configuration Routes
// ============================================

/**
 * GET /super-admin/tenants/:tenant_id/white-label
 * Get white-label config for tenant
 */
router.get(
  '/tenants/:tenant_id/white-label',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenant_id } = req.params;

    const config = await WhiteLabelConfigModel.findByTenantId(tenant_id);
    if (!config) {
      throw new NotFoundError('White-label configuration');
    }

    res.json({
      success: true,
      config,
    });
  })
);

/**
 * PUT /super-admin/tenants/:tenant_id/white-label
 * Update white-label config
 */
router.put(
  '/tenants/:tenant_id/white-label',
  authenticate,
  requirePermission('super_admin:update'),
  validateRequest(updateWhiteLabelSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenant_id } = req.params;
    const userId = req.user!.id;

    const config = await WhiteLabelConfigModel.createOrUpdate(
      {
        tenant_id,
        ...req.body,
      },
      userId
    );

    // Audit white-label update
    await AuditService.log({
      tenantId: tenant_id,
      userId,
      userEmail: req.user!.email,
      userRole: 'SUPER_ADMIN',
      action: AuditAction.UPDATE,
      eventType: 'super_admin.white_label.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'white_label_config',
      resourceId: config.id,
      description: 'White-label configuration updated',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      config,
    });
  })
);

// ============================================
// Storage Usage Routes
// ============================================

/**
 * GET /super-admin/tenants/:id/storage
 * Get storage usage for tenant
 */
router.get(
  '/tenants/:id/storage',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const usage = await TenantStorageUsageModel.getCurrentUsage(id);
    if (!usage) {
      // Calculate if not exists
      const calculated = await TenantStorageUsageModel.calculateUsage(id);
      res.json({
        success: true,
        usage: calculated,
      });
      return;
    }

    res.json({
      success: true,
      usage,
    });
  })
);

/**
 * POST /super-admin/tenants/:id/storage/calculate
 * Calculate and update storage usage
 */
router.post(
  '/tenants/:id/storage/calculate',
  authenticate,
  requirePermission('super_admin:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const usage = await TenantStorageUsageModel.calculateUsage(id);

    res.json({
      success: true,
      usage,
      message: 'Storage usage calculated',
    });
  })
);

// ============================================
// Quota Management Routes
// ============================================

/**
 * GET /super-admin/tenants/:id/quotas
 * Get quotas for tenant
 */
router.get(
  '/tenants/:id/quotas',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const quota = await TenantQuotaModel.findByTenantId(id);
    if (!quota) {
      throw new NotFoundError('Tenant quota');
    }

    res.json({
      success: true,
      quota,
    });
  })
);

/**
 * PUT /super-admin/tenants/:id/quotas
 * Update tenant quotas
 */
router.put(
  '/tenants/:id/quotas',
  authenticate,
  requirePermission('super_admin:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.id;

    const quota = await TenantQuotaModel.createOrUpdate(
      {
        tenant_id: id,
        ...req.body,
      },
      userId
    );

    // Audit quota update
    await AuditService.log({
      tenantId: id,
      userId,
      userEmail: req.user!.email,
      userRole: 'SUPER_ADMIN',
      action: AuditAction.UPDATE,
      eventType: 'super_admin.quota.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'tenant_quota',
      resourceId: quota.id,
      description: 'Tenant quotas updated',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      quota,
    });
  })
);

/**
 * GET /super-admin/tenants/:id/quotas/check
 * Check quota compliance
 */
router.get(
  '/tenants/:id/quotas/check',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const result = await QuotaEnforcementService.checkAllQuotas(id);

    res.json({
      success: true,
      ...result,
    });
  })
);

export default router;
