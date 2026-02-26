import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { KYCDataModel, KYCStatus } from '../models/kyc-data.js';
import { InvestorPreferenceProfileModel } from '../models/investor-preference-profile.js';
import { InvestorUserModel } from '../models/investor-user.js';
import { InvestorAssetLinkModel } from '../models/investor-asset-link.js';
import { AuctionAssetModel } from '../models/auction-asset.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const createKYCSchema = z.object({
  body: z.object({
    investor_user_id: z.string().uuid(),
    full_name: z.string().min(1),
    date_of_birth: z.string().date().optional(),
    nationality: z.string().optional(),
    tax_id: z.string().optional(),
    tax_id_type: z.string().optional(),
    address_line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
    phone_number: z.string().optional(),
    identity_document_type: z.string().optional(),
    identity_document_number: z.string().optional(),
    identity_document_front_id: z.string().uuid().optional(),
    identity_document_back_id: z.string().uuid().optional(),
    proof_of_address_document_id: z.string().uuid().optional(),
    source_of_funds: z.string().optional(),
    annual_income_range: z.string().optional(),
    net_worth_range: z.string().optional(),
    pep_status: z.enum(['NO', 'YES', 'UNKNOWN']).optional(),
  }),
});

const updateKYCStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    kyc_status: z.enum(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']),
    review_notes: z.string().optional(),
    rejection_reason: z.string().optional(),
  }),
});

const createPreferenceProfileSchema = z.object({
  body: z.object({
    investor_user_id: z.string().uuid(),
    min_budget_cents: z.number().int().positive().optional(),
    max_budget_cents: z.number().int().positive(),
    preferred_budget_cents: z.number().int().positive().optional(),
    risk_tolerance_score: z.number().int().min(0).max(100).optional(),
    preferred_asset_types: z.array(z.string()).optional(),
    excluded_asset_types: z.array(z.string()).optional(),
    preferred_locations: z.array(z.string()).optional(),
    excluded_locations: z.array(z.string()).optional(),
    min_property_size_sqm: z.number().positive().optional(),
    max_property_size_sqm: z.number().positive().optional(),
    preferred_number_of_rooms: z.number().int().positive().optional(),
    preferred_number_of_bathrooms: z.number().int().positive().optional(),
    min_expected_roi_percentage: z.number().positive().optional(),
    max_acceptable_risk_score: z.number().int().min(0).max(100).optional(),
    auto_notify_enabled: z.boolean().optional(),
    notification_threshold: z.number().int().min(0).max(100).optional(),
    notification_channels: z.array(z.string()).optional(),
  }),
});

// ============================================
// KYC Routes
// ============================================

/**
 * POST /crm/kyc
 * Submit KYC data for investor onboarding
 */
router.post(
  '/kyc',
  authenticate,
  requirePermission('crm:create'),
  validateRequest(createKYCSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const kycData = await KYCDataModel.create({
      tenant_id: tenantContext.tenantId,
      ...req.body,
    });

    // Audit KYC submission
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'crm.kyc.submit',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'kyc_data',
      resourceId: kycData.id,
      description: `KYC data submitted for investor ${req.body.investor_user_id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      kyc_data: kycData,
    });
  })
);

/**
 * GET /crm/kyc/:investor_id
 * Get KYC data for investor
 */
router.get(
  '/kyc/:investor_id',
  authenticate,
  requirePermission('crm:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { investor_id } = req.params;

    const kycData = await KYCDataModel.findByInvestorId(investor_id, tenantContext.tenantId);
    if (!kycData) {
      throw new NotFoundError('KYC data');
    }

    res.json({
      success: true,
      kyc_data: kycData,
    });
  })
);

/**
 * PUT /crm/kyc/:id/status
 * Update KYC status (approve/reject)
 */
router.put(
  '/kyc/:id/status',
  authenticate,
  requirePermission('crm:update'),
  validateRequest(updateKYCStatusSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    const kycData = await KYCDataModel.updateStatus(
      id,
      tenantContext.tenantId,
      userId,
      req.body
    );

    // Audit KYC status update
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'crm.kyc.status_update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'kyc_data',
      resourceId: kycData.id,
      description: `KYC status updated to ${req.body.kyc_status}`,
      details: {
        previous_status: kycData.kyc_status,
        new_status: req.body.kyc_status,
        review_notes: req.body.review_notes,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      kyc_data: kycData,
    });
  })
);

// ============================================
// Investor List & Detail (Admin)
// ============================================

/**
 * GET /crm/investors
 * List investors for tenant (admin)
 */
router.get(
  '/investors',
  authenticate,
  requirePermission('crm:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const investors = await InvestorUserModel.listByTenant(tenantContext.tenantId, { limit, offset });

    const list = investors.map((inv) => ({
      id: inv.id,
      email: inv.email,
      first_name: inv.first_name,
      last_name: inv.last_name,
      company_name: inv.company_name,
      is_active: inv.is_active,
      last_login_at: inv.last_login_at,
      created_at: inv.created_at,
    }));

    res.json({
      success: true,
      investors: list,
      total: list.length,
      limit,
      offset,
    });
  })
);

/**
 * GET /crm/investors/:id
 * Get single investor (admin)
 */
router.get(
  '/investors/:id',
  authenticate,
  requirePermission('crm:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const investor = await InvestorUserModel.findById(id, tenantContext.tenantId);
    if (!investor) {
      throw new NotFoundError('Investor');
    }

    res.json({
      success: true,
      investor: {
        id: investor.id,
        email: investor.email,
        first_name: investor.first_name,
        last_name: investor.last_name,
        company_name: investor.company_name,
        is_active: investor.is_active,
        is_email_verified: investor.is_email_verified,
        last_login_at: investor.last_login_at,
        last_activity_at: investor.last_activity_at,
        created_at: investor.created_at,
        updated_at: investor.updated_at,
      },
    });
  })
);

/**
 * GET /crm/investors/:id/assigned-assets
 * List assigned auction assets for investor (admin view)
 */
router.get(
  '/investors/:id/assigned-assets',
  authenticate,
  requirePermission('crm:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const investor = await InvestorUserModel.findById(id, tenantContext.tenantId);
    if (!investor) {
      throw new NotFoundError('Investor');
    }

    const links = await InvestorAssetLinkModel.findByInvestor(id, tenantContext.tenantId);
    const assets = await Promise.all(
      links.map(async (link) => {
        const asset = await AuctionAssetModel.findById(link.auction_asset_id, tenantContext.tenantId);
        if (!asset) return null;
        return {
          link_id: link.id,
          granted_at: link.granted_at,
          access_notes: link.access_notes,
          asset: {
            id: asset.id,
            asset_reference: asset.asset_reference,
            title: asset.title,
            current_stage: asset.current_stage,
            risk_score: asset.risk_score,
          },
        };
      })
    );

    const valid = assets.filter((a): a is NonNullable<typeof a> => a !== null);

    res.json({
      success: true,
      assigned_assets: valid,
      total: valid.length,
    });
  })
);

// ============================================
// Investor Preference Profile Routes
// ============================================

/**
 * POST /crm/preference-profiles
 * Create or update investor preference profile
 */
router.post(
  '/preference-profiles',
  authenticate,
  requirePermission('crm:create'),
  validateRequest(createPreferenceProfileSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    // Verify investor has approved KYC
    const hasApprovedKYC = await KYCDataModel.hasApprovedKYC(
      req.body.investor_user_id,
      tenantContext.tenantId
    );

    if (!hasApprovedKYC) {
      throw new ValidationError('Investor must have approved KYC before creating preference profile');
    }

    const profile = await InvestorPreferenceProfileModel.createOrUpdate({
      tenant_id: tenantContext.tenantId,
      ...req.body,
    });

    // Audit profile creation/update
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'crm.preference_profile.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'investor_preference_profile',
      resourceId: profile.id,
      description: `Preference profile ${profile.id ? 'updated' : 'created'} for investor ${req.body.investor_user_id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      profile,
    });
  })
);

/**
 * GET /crm/preference-profiles/:investor_id
 * Get preference profile for investor
 */
router.get(
  '/preference-profiles/:investor_id',
  authenticate,
  requirePermission('crm:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { investor_id } = req.params;

    const profile = await InvestorPreferenceProfileModel.findByInvestorId(
      investor_id,
      tenantContext.tenantId
    );
    if (!profile) {
      throw new NotFoundError('Investor preference profile');
    }

    res.json({
      success: true,
      profile,
    });
  })
);

export default router;
