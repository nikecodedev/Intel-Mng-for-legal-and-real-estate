import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, validateRequest } from '../middleware/index.js';
import { authenticateInvestor, requireInvestor } from '../middleware/investor-auth.js';
import { InvestorAuthService } from '../services/investor-auth.js';
import { InvestorUserModel } from '../models/investor-user.js';
import { InvestorAssetLinkModel } from '../models/investor-asset-link.js';
import { AuctionAssetModel } from '../models/auction-asset.js';
import { AuctionAssetROIModel } from '../models/auction-asset-roi.js';
import { DocumentModel } from '../models/document.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { AuthenticationError, NotFoundError, AuthorizationError } from '../utils/errors.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Authentication Routes
// ============================================

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

/**
 * POST /investor/auth/login
 * Investor login
 */
router.post(
  '/auth/login',
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const userAgent = req.get('user-agent');
    const ipAddress = req.ip;

    const { investor, accessToken, refreshToken } = await InvestorAuthService.login(
      email,
      password,
      userAgent,
      ipAddress
    );

    // Audit login
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.login',
      eventCategory: AuditEventCategory.AUTHENTICATION,
      resourceType: 'investor_portal',
      description: 'Investor logged in',
      ipAddress,
      userAgent,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      investor: {
        id: investor.id,
        email: investor.email,
        first_name: investor.first_name,
        last_name: investor.last_name,
        company_name: investor.company_name,
      },
      accessToken,
      refreshToken,
    });
  })
);

const refreshSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1),
  }),
});

/**
 * POST /investor/auth/refresh
 * Refresh access token
 */
router.post(
  '/auth/refresh',
  validateRequest(refreshSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refresh_token } = req.body;

    const payload = await InvestorAuthService.verifyRefreshToken(refresh_token);

    const investor = await InvestorUserModel.findById(payload.investorId!, payload.tid!);
    if (!investor || !investor.is_active) {
      throw new AuthenticationError('Investor not found or inactive');
    }

    const accessToken = InvestorAuthService.generateAccessToken(investor);

    res.json({
      success: true,
      accessToken,
    });
  })
);

/**
 * POST /investor/auth/logout
 * Logout and revoke refresh token
 */
router.post(
  '/auth/logout',
  authenticateInvestor,
  requireInvestor,
  validateRequest(refreshSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refresh_token } = req.body;
    const investor = req.investor!;

    await InvestorAuthService.revokeRefreshToken(refresh_token);

    // Audit logout
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.logout',
      eventCategory: AuditEventCategory.AUTHENTICATION,
      resourceType: 'investor_portal',
      description: 'Investor logged out',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

/**
 * GET /investor/auth/me
 * Get current investor info
 */
router.get(
  '/auth/me',
  authenticateInvestor,
  requireInvestor,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const investor = req.investor!;

    res.json({
      success: true,
      investor: {
        id: investor.id,
        email: investor.email,
        first_name: investor.investor.first_name,
        last_name: investor.investor.last_name,
        company_name: investor.investor.company_name,
        last_login_at: investor.investor.last_login_at,
      },
    });
  })
);

// ============================================
// Asset Routes (Read-Only)
// ============================================

/**
 * GET /investor/assets
 * List assigned auction assets (read-only)
 */
router.get(
  '/assets',
  authenticateInvestor,
  requireInvestor,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const investor = req.investor!;
    const tenantContext = getTenantContext(req);

    // Get all asset IDs accessible to this investor
    const accessibleAssetIds = await InvestorAssetLinkModel.getAccessibleAssetIds(
      investor.id,
      investor.tenant_id
    );

    if (accessibleAssetIds.length === 0) {
      res.json({
        success: true,
        assets: [],
        total: 0,
      });
      return;
    }

    // Fetch assets (read-only, no modifications)
    const assets = await Promise.all(
      accessibleAssetIds.map(async (assetId) => {
        const asset = await AuctionAssetModel.findById(assetId, investor.tenant_id);
        if (!asset) return null;

        // Return read-only view (no sensitive operations)
        return {
          id: asset.id,
          asset_reference: asset.asset_reference,
          title: asset.title,
          current_stage: asset.current_stage,
          risk_score: asset.risk_score,
          created_at: asset.created_at,
          updated_at: asset.updated_at,
          // Due diligence summary (read-only)
          due_diligence_summary: {
            occupancy: asset.due_diligence_checklist.occupancy.status,
            debts: asset.due_diligence_checklist.debts.status,
            legal_risks: asset.due_diligence_checklist.legal_risks.status,
            zoning: asset.due_diligence_checklist.zoning.status,
          },
        };
      })
    );

    const validAssets = assets.filter((a): a is NonNullable<typeof a> => a !== null);

    // Audit access
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.assets.list',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: 'auction_asset',
      description: `Investor listed ${validAssets.length} assigned assets`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      assets: validAssets,
      total: validAssets.length,
    });
  })
);

/**
 * GET /investor/assets/:id
 * Get single assigned auction asset (read-only)
 */
router.get(
  '/assets/:id',
  authenticateInvestor,
  requireInvestor,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const investor = req.investor!;
    const { id } = req.params;

    // Verify investor has access to this asset
    const hasAccess = await InvestorAssetLinkModel.hasAccess(
      investor.id,
      id,
      investor.tenant_id
    );

    if (!hasAccess) {
      throw new AuthorizationError('Access denied to this asset');
    }

    // Fetch asset
    const asset = await AuctionAssetModel.findById(id, investor.tenant_id);
    if (!asset) {
      throw new NotFoundError('Auction asset');
    }

    // Audit access
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.asset.view',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: 'auction_asset',
      resourceId: asset.id,
      description: `Investor viewed asset ${asset.asset_reference || asset.id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    // Return read-only view
    res.json({
      success: true,
      asset: {
        id: asset.id,
        asset_reference: asset.asset_reference,
        title: asset.title,
        current_stage: asset.current_stage,
        risk_score: asset.risk_score,
        due_diligence_checklist: asset.due_diligence_checklist,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
      },
    });
  })
);

// ============================================
// ROI Reports (Read-Only)
// ============================================

/**
 * GET /investor/assets/:id/roi
 * Get ROI report for assigned asset (read-only)
 */
router.get(
  '/assets/:id/roi',
  authenticateInvestor,
  requireInvestor,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const investor = req.investor!;
    const { id } = req.params;

    // Verify investor has access to this asset
    const hasAccess = await InvestorAssetLinkModel.hasAccess(
      investor.id,
      id,
      investor.tenant_id
    );

    if (!hasAccess) {
      throw new AuthorizationError('Access denied to this asset');
    }

    // Fetch ROI data (read-only)
    const roi = await AuctionAssetROIModel.findByAssetId(id, investor.tenant_id);

    if (!roi) {
      throw new NotFoundError('ROI report');
    }

    // Audit access
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.roi.view',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: 'auction_asset_roi',
      resourceId: roi.id,
      description: `Investor viewed ROI report for asset ${id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    // Return read-only ROI data
    res.json({
      success: true,
      roi: {
        id: roi.id,
        auction_asset_id: roi.auction_asset_id,
        acquisition_price_cents: roi.acquisition_price_cents,
        taxes_itbi_cents: roi.taxes_itbi_cents,
        legal_costs_cents: roi.legal_costs_cents,
        renovation_estimate_cents: roi.renovation_estimate_cents,
        expected_resale_value_cents: roi.expected_resale_value_cents,
        expected_resale_date: roi.expected_resale_date,
        total_cost_cents: roi.total_cost_cents,
        net_profit_cents: roi.net_profit_cents,
        roi_percentage: roi.roi_percentage,
        break_even_date: roi.break_even_date,
        version_number: roi.version_number,
        updated_at: roi.updated_at,
      },
    });
  })
);

// ============================================
// Legal Status (Read-Only)
// ============================================

/**
 * GET /investor/assets/:id/legal-status
 * Get legal status for assigned asset (read-only, no downloads)
 */
router.get(
  '/assets/:id/legal-status',
  authenticateInvestor,
  requireInvestor,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const investor = req.investor!;
    const { id } = req.params;

    // Verify investor has access to this asset
    const hasAccess = await InvestorAssetLinkModel.hasAccess(
      investor.id,
      id,
      investor.tenant_id
    );

    if (!hasAccess) {
      throw new AuthorizationError('Access denied to this asset');
    }

    // Fetch asset to get linked documents
    const asset = await AuctionAssetModel.findById(id, investor.tenant_id);
    if (!asset) {
      throw new NotFoundError('Auction asset');
    }

    // Fetch linked documents (read-only metadata only, no file downloads)
    const documents = await Promise.all(
      asset.linked_document_ids.map(async (docId) => {
        const doc = await DocumentModel.findById(docId, investor.tenant_id);
        if (!doc) return null;

        // Return read-only metadata (NO file content or download URLs)
        return {
          id: doc.id,
          title: doc.title,
          document_type: doc.document_type,
          category: doc.category,
          status: doc.status,
          document_date: doc.document_date,
          confidentiality_level: doc.confidentiality_level,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          // Explicitly exclude: file_path, file_url, download capabilities
        };
      })
    );

    const validDocuments = documents.filter((d): d is NonNullable<typeof d> => d !== null);

    // Audit access
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.legal_status.view',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: 'document',
      resourceId: asset.id,
      description: `Investor viewed legal status for asset ${asset.asset_reference || asset.id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      asset_id: id,
      legal_status: {
        asset_stage: asset.current_stage,
        risk_score: asset.risk_score,
        due_diligence: {
          occupancy: asset.due_diligence_checklist.occupancy,
          debts: asset.due_diligence_checklist.debts,
          legal_risks: asset.due_diligence_checklist.legal_risks,
          zoning: asset.due_diligence_checklist.zoning,
        },
        linked_documents: validDocuments,
      },
    });
  })
);

export default router;
