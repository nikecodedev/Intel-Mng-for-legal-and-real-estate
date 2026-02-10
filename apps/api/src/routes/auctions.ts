import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import {
  AuctionAssetModel,
  AuctionBidModel,
  AUCTION_STAGES,
  type DueDiligenceItem,
  isRiskHigh,
} from '../models/auction-asset.js';
import { AuctionAssetROIModel } from '../models/auction-asset-roi.js';
import { validate as validateIntelligence } from '../services/intelligence.js';

const router = Router();

const createAssetSchema = z.object({
  body: z.object({
    linked_document_ids: z.array(z.string().uuid()).optional(),
    asset_reference: z.string().max(255).optional(),
    title: z.string().max(500).optional(),
  }),
});

const transitionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ to_stage: z.enum([...AUCTION_STAGES] as [string, ...string[]]) }),
});

const dueDiligenceItemSchema = z.object({
  status: z.enum(['ok', 'risk', 'pending']),
  notes: z.string().nullable().optional(),
});
const updateDueDiligenceSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    occupancy: dueDiligenceItemSchema.optional(),
    debts: dueDiligenceItemSchema.optional(),
    legal_risks: dueDiligenceItemSchema.optional(),
    zoning: dueDiligenceItemSchema.optional(),
  }),
});

const placeBidSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ amount_cents: z.number().int().positive() }),
});

const listSchema = z.object({
  query: z.object({
    stage: z.enum([...AUCTION_STAGES] as [string, ...string[]]).optional(),
    limit: z.string().transform(Number).optional(),
    offset: z.string().transform(Number).optional(),
  }),
});

const roiInputsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    acquisition_price_cents: z.number().int().min(0).optional(),
    taxes_itbi_cents: z.number().int().min(0).optional(),
    legal_costs_cents: z.number().int().min(0).optional(),
    renovation_estimate_cents: z.number().int().min(0).optional(),
    expected_resale_value_cents: z.number().int().min(0).optional(),
    expected_resale_date: z.string().nullable().optional(),
  }),
});

const roiVersionsQuerySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    limit: z.string().transform(Number).optional(),
    offset: z.string().transform(Number).optional(),
  }),
});

/**
 * POST /auctions/assets
 * Create auction asset (tenant-scoped). Stage starts at F0.
 */
router.post(
  '/assets',
  authenticate,
  requirePermission('auctions:create'),
  validateRequest(createAssetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { linked_document_ids, asset_reference, title } = req.body;

    const asset = await AuctionAssetModel.create({
      tenant_id: tenantId,
      linked_document_ids,
      asset_reference,
      title,
    });

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'auction_asset.create',
      event_category: AuditEventCategory.DATA_MODIFICATION,
      action: AuditAction.CREATE,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'auction_asset',
      resource_id: asset.id,
      description: 'Auction asset created',
      details: { initial_stage: 'F0' },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['legal'],
      retention_category: 'legal',
    });

    res.status(201).json({
      success: true,
      data: formatAsset(asset),
    });
  })
);

/**
 * GET /auctions/assets
 * List auction assets for tenant. Optional filter by stage.
 */
router.get(
  '/assets',
  authenticate,
  requirePermission('auctions:read'),
  validateRequest(listSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { stage, limit, offset } = req.query as { stage?: string; limit?: number; offset?: number };

    const assets = await AuctionAssetModel.listByTenant(tenantId, {
      stage: stage as typeof AUCTION_STAGES[number] | undefined,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: { assets: assets.map(formatAsset), pagination: { limit: limit ?? 50, offset: offset ?? 0 } },
    });
  })
);

/**
 * GET /auctions/assets/:id
 * Get single asset (tenant-scoped).
 */
router.get(
  '/assets/:id',
  authenticate,
  requirePermission('auctions:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    res.json({ success: true, data: formatAsset(asset) });
  })
);

/**
 * POST /auctions/assets/:id/transition
 * Move to next stage only (F0->F1->...->F9). Invalid transitions throw 400.
 * Audit every stage transition.
 */
router.post(
  '/assets/:id/transition',
  authenticate,
  requirePermission('auctions:update'),
  validateRequest(transitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;
    const { to_stage } = req.body;

    const { asset, previous_stage } = await AuctionAssetModel.transitionStage(id, tenantId, to_stage);

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'auction_asset.stage_transition',
      event_category: AuditEventCategory.DATA_MODIFICATION,
      action: AuditAction.UPDATE,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'auction_asset',
      resource_id: id,
      description: `Auction asset stage transition ${previous_stage} -> ${to_stage}`,
      details: { from_stage: previous_stage, to_stage },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['legal'],
      retention_category: 'legal',
    });

    res.json({
      success: true,
      data: { asset: formatAsset(asset), previous_stage, to_stage },
    });
  })
);

/**
 * PUT /auctions/assets/:id/due-diligence
 * Update due diligence checklist (occupancy, debts, legal_risks, zoning). Risk score recalculated.
 */
router.put(
  '/assets/:id/due-diligence',
  authenticate,
  requirePermission('auctions:update'),
  validateRequest(updateDueDiligenceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;
    const { occupancy, debts, legal_risks, zoning } = req.body;

    const input: {
      occupancy?: DueDiligenceItem;
      debts?: DueDiligenceItem;
      legal_risks?: DueDiligenceItem;
      zoning?: DueDiligenceItem;
    } = {};
    if (occupancy) input.occupancy = occupancy as DueDiligenceItem;
    if (debts) input.debts = debts as DueDiligenceItem;
    if (legal_risks) input.legal_risks = legal_risks as DueDiligenceItem;
    if (zoning) input.zoning = zoning as DueDiligenceItem;

    const asset = await AuctionAssetModel.updateDueDiligence(id, tenantId, input);

    res.json({
      success: true,
      data: {
        asset: formatAsset(asset),
        risk_score: asset.risk_score,
        risk_level: isRiskHigh(asset.risk_score) ? 'HIGH' : asset.risk_score >= 40 ? 'MEDIUM' : 'LOW',
      },
    });
  })
);

/**
 * GET /auctions/assets/:id/risk
 * Get risk score and level (LOW/MEDIUM/HIGH). HIGH disables bidding at API.
 */
router.get(
  '/assets/:id/risk',
  authenticate,
  requirePermission('auctions:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    const high = isRiskHigh(asset.risk_score);
    res.json({
      success: true,
      data: {
        risk_score: asset.risk_score,
        risk_level: high ? 'HIGH' : asset.risk_score >= 40 ? 'MEDIUM' : 'LOW',
        bidding_disabled: high,
      },
    });
  })
);

/**
 * POST /auctions/assets/:id/bids
 * Place a bid. API enforces: bidding disabled when risk is HIGH (403).
 */
router.post(
  '/assets/:id/bids',
  authenticate,
  requirePermission('auctions:bid'),
  validateRequest(placeBidSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;
    const { amount_cents } = req.body;

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    const intelligenceResult = await validateIntelligence({
      tenantId,
      resourceType: 'auction_asset',
      resourceId: id,
      operation: 'place_bid',
      userId,
      userEmail: req.user!.email,
      userRole: req.context?.role,
      request: req,
    });
    if (!intelligenceResult.allowed) {
      const message = intelligenceResult.violations.map((v) => v.message).join('; ');
      throw new AuthorizationError(message || 'Bidding is disabled for this asset.');
    }

    const bid = await AuctionBidModel.create(tenantId, id, userId, amount_cents);

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'auction_bid.create',
      event_category: AuditEventCategory.DATA_MODIFICATION,
      action: AuditAction.CREATE,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'auction_bid',
      resource_id: bid.id,
      target_resource_id: id,
      description: 'Auction bid placed',
      details: { amount_cents, asset_id: id },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['legal'],
      retention_category: 'legal',
    });

    res.status(201).json({
      success: true,
      data: { id: bid.id, amount_cents },
    });
  })
);

/**
 * GET /auctions/assets/:id/roi
 * Get current ROI for asset (linked to auction asset). 404 if never calculated.
 */
router.get(
  '/assets/:id/roi',
  authenticate,
  requirePermission('auctions:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    const roi = await AuctionAssetROIModel.getByAssetId(id, tenantId);
    if (!roi) throw new NotFoundError('ROI (not yet calculated for this asset)');

    res.json({
      success: true,
      data: formatROI(roi),
    });
  })
);

/**
 * PUT /auctions/assets/:id/roi
 * Update ROI inputs (partial). Recalculates outputs, versions, and audits.
 */
router.put(
  '/assets/:id/roi',
  authenticate,
  requirePermission('auctions:update'),
  validateRequest(roiInputsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    const inputs: {
      acquisition_price_cents?: number;
      taxes_itbi_cents?: number;
      legal_costs_cents?: number;
      renovation_estimate_cents?: number;
      expected_resale_value_cents?: number;
      expected_resale_date?: string | null;
    } = {};
    if (typeof body.acquisition_price_cents === 'number') inputs.acquisition_price_cents = body.acquisition_price_cents;
    if (typeof body.taxes_itbi_cents === 'number') inputs.taxes_itbi_cents = body.taxes_itbi_cents;
    if (typeof body.legal_costs_cents === 'number') inputs.legal_costs_cents = body.legal_costs_cents;
    if (typeof body.renovation_estimate_cents === 'number') inputs.renovation_estimate_cents = body.renovation_estimate_cents;
    if (typeof body.expected_resale_value_cents === 'number') inputs.expected_resale_value_cents = body.expected_resale_value_cents;
    if (body.expected_resale_date !== undefined) inputs.expected_resale_date = body.expected_resale_date == null ? null : String(body.expected_resale_date);

    const { roi, isNew } = await AuctionAssetROIModel.updateInputs(id, tenantId, inputs);

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'roi.recalculation',
      event_category: AuditEventCategory.DATA_MODIFICATION,
      action: AuditAction.UPDATE,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'auction_asset_roi',
      resource_id: roi.id,
      target_resource_id: id,
      description: isNew ? 'ROI created (first calculation)' : 'ROI recalculated',
      details: {
        auction_asset_id: id,
        version_number: roi.version_number,
        net_profit_cents: roi.net_profit_cents,
        roi_percentage: roi.roi_percentage,
        break_even_date: roi.break_even_date,
      },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['legal'],
      retention_category: 'legal',
    });

    res.json({
      success: true,
      data: formatROI(roi),
    });
  })
);

/**
 * GET /auctions/assets/:id/roi/versions
 * List versioned ROI calculations for the asset.
 */
router.get(
  '/assets/:id/roi/versions',
  authenticate,
  requirePermission('auctions:read'),
  validateRequest(roiVersionsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;
    const limit = (req.query.limit as unknown) as number | undefined;
    const offset = (req.query.offset as unknown) as number | undefined;

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    const versions = await AuctionAssetROIModel.listVersions(id, tenantId, { limit, offset });

    res.json({
      success: true,
      data: {
        auction_asset_id: id,
        versions: versions.map((v) => ({
          id: v.id,
          version_number: v.version_number,
          inputs_snapshot: v.inputs_snapshot,
          total_cost_cents: v.total_cost_cents,
          net_profit_cents: v.net_profit_cents,
          roi_percentage: v.roi_percentage,
          break_even_date: v.break_even_date,
          created_at: v.created_at,
        })),
        pagination: { limit: limit ?? 50, offset: offset ?? 0 },
      },
    });
  })
);

function formatROI(roi: {
  id: string;
  auction_asset_id: string;
  acquisition_price_cents: number;
  taxes_itbi_cents: number;
  legal_costs_cents: number;
  renovation_estimate_cents: number;
  expected_resale_value_cents: number;
  expected_resale_date: string | null;
  total_cost_cents: number;
  net_profit_cents: number;
  roi_percentage: number;
  break_even_date: string | null;
  version_number: number;
  updated_at: Date;
}) {
  return {
    id: roi.id,
    auction_asset_id: roi.auction_asset_id,
    inputs: {
      acquisition_price_cents: roi.acquisition_price_cents,
      taxes_itbi_cents: roi.taxes_itbi_cents,
      legal_costs_cents: roi.legal_costs_cents,
      renovation_estimate_cents: roi.renovation_estimate_cents,
      expected_resale_value_cents: roi.expected_resale_value_cents,
      expected_resale_date: roi.expected_resale_date,
    },
    outputs: {
      total_cost_cents: roi.total_cost_cents,
      net_profit_cents: roi.net_profit_cents,
      roi_percentage: roi.roi_percentage,
      break_even_date: roi.break_even_date,
    },
    version_number: roi.version_number,
    updated_at: roi.updated_at,
  };
}

function formatAsset(asset: {
  id: string;
  current_stage: string;
  linked_document_ids: string[];
  due_diligence_checklist: unknown;
  risk_score: number;
  asset_reference: string | null;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: asset.id,
    current_stage: asset.current_stage,
    linked_document_ids: asset.linked_document_ids,
    due_diligence_checklist: asset.due_diligence_checklist,
    risk_score: asset.risk_score,
    risk_level: isRiskHigh(asset.risk_score) ? 'HIGH' : asset.risk_score >= 40 ? 'MEDIUM' : 'LOW',
    bidding_disabled: isRiskHigh(asset.risk_score),
    asset_reference: asset.asset_reference,
    title: asset.title,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

export default router;
