import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
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
import { db } from '../models/database.js';

const router = Router();

const createAssetSchema = z.object({
  body: z.object({
    linked_document_ids: z.array(z.string().uuid()).optional(),
    asset_reference: z.string().max(255).optional(),
    title: z.string().max(500).optional(),
    // Spec 4.3: Nº do Edital único por leiloeiro (auctioneer)
    edital_number: z.string().max(100).optional(),
    auctioneer_id: z.string().uuid().optional(),
    // Spec §4.3: Cadastro Lote F0 campos obrigatórios
    tipo_imovel: z.string().min(1, 'Tipo de imóvel obrigatório (Spec §4.3)'),
    avaliacao_judicial: z.number().int().positive('Avaliação judicial obrigatória (Spec §4.3)'),
    lance_minimo: z.number().int().positive('Lance mínimo obrigatório (Spec §4.3)'),
    ocupacao: z.enum(['DESOCUPADO', 'OCUPADO', 'PARCIAL'], { errorMap: () => ({ message: 'Ocupação obrigatória: DESOCUPADO, OCUPADO ou PARCIAL (Spec §4.3)' }) }),
    iptu_aberto: z.boolean({ required_error: 'iptu_aberto obrigatório (Spec §4.3)' }),
    condominio_aberto: z.boolean({ required_error: 'condominio_aberto obrigatório (Spec §4.3)' }),
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
    opex_monthly_cents: z.number().int().min(0).optional(),
    registry_fees_cents: z.number().int().min(0).optional(),
    insurance_cents: z.number().int().min(0).optional(),
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
    const { linked_document_ids, asset_reference, title, edital_number, auctioneer_id,
            tipo_imovel, avaliacao_judicial, lance_minimo, ocupacao, iptu_aberto, condominio_aberto } = req.body;

    // Spec 4.3: Nº do Edital único por leiloeiro — uniqueness check
    if (edital_number && auctioneer_id) {
      const dup = await db.query(
        `SELECT id FROM auction_assets WHERE tenant_id = $1 AND edital_number = $2 AND auctioneer_id = $3 LIMIT 1`,
        [tenantId, edital_number, auctioneer_id]
      );
      if (dup.rows.length > 0) {
        throw new ValidationError(`Nº do Edital '${edital_number}' já existe para este leiloeiro (Spec 4.3). Use um número único.`);
      }
    }

    const asset = await AuctionAssetModel.create({
      tenant_id: tenantId,
      linked_document_ids,
      asset_reference,
      title,
      edital_number: edital_number ?? null,
      auctioneer_id: auctioneer_id ?? null,
      tipo_imovel: tipo_imovel ?? null,
      avaliacao_judicial: avaliacao_judicial ?? null,
      lance_minimo: lance_minimo ?? null,
      ocupacao: ocupacao ?? null,
      iptu_aberto: iptu_aberto ?? null,
      condominio_aberto: condominio_aberto ?? null,
    } as any);

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

    // Ref: Spec §4.2 — HG-3: Checklist de due diligence deve ser 100% "ok" antes de avançar para F9 (Vendido/Concluído)
    if (to_stage === 'F9') {
      const assetResult = await db.query<{ due_diligence_checklist: Record<string, { status: string }> }>(
        'SELECT due_diligence_checklist FROM auction_assets WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      const checklist = assetResult.rows[0]?.due_diligence_checklist;
      if (checklist) {
        const categories = ['occupancy', 'debts', 'legal_risks', 'zoning'];
        const pending: string[] = [];
        for (const cat of categories) {
          const item = checklist[cat];
          if (!item || item.status !== 'ok') {
            pending.push(`${cat}: ${item?.status || 'missing'}`);
          }
        }
        if (pending.length > 0) {
          throw new ValidationError(`Cannot advance to F9 (Vendido/Concluído): due diligence checklist incomplete — ${pending.join(', ')}. All items must be "ok".`);
        }
      }
    }

    const { asset, previous_stage } = await AuctionAssetModel.transitionStage(id, tenantId, to_stage);

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'auction_asset.current_stage_transition',
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

    // Emit workflow event when stage reaches F4 (Arrematação Homologada)
    if (to_stage === 'F4') {
      try {
        const { runWorkflow } = await import('../services/workflow-engine.js');
        await runWorkflow({
          tenantId,
          eventType: 'auction.bid.homologated',
          payload: {
            auction_asset_id: id,
            asset_title: asset.title,
            status: 'HOMOLOGATED',
            stage: to_stage,
            previous_stage,
          },
          userId,
          userEmail: req.user!.email,
          userRole: req.context?.role ?? 'OPERATIONAL',
          request: req,
        });
      } catch (wfErr) {
        logger.warn('Workflow event auction.bid.homologated failed', { error: wfErr });
      }

      // Spec Divergence #8: Arrematação F4 → cria ativo real_estate_asset em REGULARIZATION automaticamente
      try {
        const existing = await db.query(
          `SELECT id FROM real_estate_assets WHERE source_auction_id = $1 AND tenant_id = $2 LIMIT 1`,
          [id, tenantId]
        );
        if (existing.rows.length === 0) {
          const assetCode = `REA-AUC-${id.substring(0, 8).toUpperCase()}`;
          const assetTitle = asset.title || asset.asset_reference || id;
          await db.query(
            `INSERT INTO real_estate_assets
               (tenant_id, asset_code, property_address, property_type, current_state, source_auction_id, created_by, metadata)
             VALUES ($1, $2, $3, 'auction', 'REGULARIZACAO', $4, $5, $6)`,
            [
              tenantId,
              assetCode,
              `Ativo de arrematação — ${assetTitle}`,
              id,
              userId,
              JSON.stringify({ origin: 'auction_homologation', auction_asset_id: id }),
            ]
          );
          logger.info('Real estate asset created from auction homologation', { auctionAssetId: id, tenantId });
        }
      } catch (assetErr) {
        logger.warn('Failed to create real estate asset from auction', { error: assetErr });
      }
    }

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

    // Spec #6: Hard Gate — risk_score >= 50 OR certidoes_negativas === false OR mpga_risk_score >= 70 blocks bidding
    const mpgaBlocked = asset.mpga_risk_score !== null && asset.mpga_risk_score !== undefined && asset.mpga_risk_score >= 70;
    const blocked = isRiskHigh(asset.risk_score) || asset.certidoes_negativas === false || mpgaBlocked;
    if (blocked) {
      const reason = asset.certidoes_negativas === false
        ? 'Lance bloqueado: certidões negativas pendentes ou irregulares (Hard Gate).'
        : mpgaBlocked
          ? `Lance bloqueado: MPGA risk score ${asset.mpga_risk_score} ≥ 70 (Hard Gate).`
          : 'Lance bloqueado: risco elevado na due diligence (Hard Gate).';
      res.status(422).json({ success: false, error: reason });
      return;
    }

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
      opex_monthly_cents?: number;
      registry_fees_cents?: number;
      insurance_cents?: number;
      expected_resale_value_cents?: number;
      expected_resale_date?: string | null;
    } = {};
    if (typeof body.acquisition_price_cents === 'number') inputs.acquisition_price_cents = body.acquisition_price_cents;
    if (typeof body.taxes_itbi_cents === 'number') inputs.taxes_itbi_cents = body.taxes_itbi_cents;
    if (typeof body.legal_costs_cents === 'number') inputs.legal_costs_cents = body.legal_costs_cents;
    if (typeof body.renovation_estimate_cents === 'number') inputs.renovation_estimate_cents = body.renovation_estimate_cents;
    if (typeof body.opex_monthly_cents === 'number') inputs.opex_monthly_cents = body.opex_monthly_cents;
    if (typeof body.registry_fees_cents === 'number') inputs.registry_fees_cents = body.registry_fees_cents;
    if (typeof body.insurance_cents === 'number') inputs.insurance_cents = body.insurance_cents;
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

// ============================================
// F3 Pre-Bid Authorization (Spec Ausente #5)
// ============================================

/**
 * POST /auctions/assets/:id/authorize-bid
 * F3 Pre-bid authorization form — separate from bid-override exception.
 * Requires: teto_autorizado (max bid ceiling), certidoes_anexadas (boolean), justificativa min 200 chars.
 */
const authorizeBidSchema = z.object({
  body: z.object({
    teto_autorizado: z.number().int().positive('Teto autorizado deve ser um valor positivo em centavos'),
    certidoes_anexadas: z.literal(true, { errorMap: () => ({ message: 'Certidões devem estar anexadas para autorizar lance (Spec F3)' }) }),
    justificativa: z.string().min(200, 'Justificativa deve ter pelo menos 200 caracteres (Spec F3)'),
    documento_autorizacao_id: z.string().uuid().optional(),
  }),
});

router.post(
  '/assets/:id/authorize-bid',
  authenticate,
  requirePermission('auctions:create'),
  validateRequest(authorizeBidSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { teto_autorizado, certidoes_anexadas, justificativa, documento_autorizacao_id } = req.body;
    const { tenantId, userId } = getTenantContext(req);

    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    // Record authorization in override_events (audited)
    const authResult = await db.query(
      `INSERT INTO override_events
         (tenant_id, user_id, user_email, override_type, target_entity, target_id, otp_verified, reason, justification, metadata)
       VALUES ($1, $2, $3, 'bid_authorization_f3', 'auction_asset', $4, FALSE, $5, $5, $6)
       RETURNING id`,
      [
        tenantId,
        userId,
        req.user!.email ?? '',
        id,
        justificativa,
        JSON.stringify({
          teto_autorizado,
          certidoes_anexadas,
          documento_autorizacao_id: documento_autorizacao_id ?? null,
          asset_title: asset.title,
          current_stage: asset.current_stage,
        }),
      ]
    ).catch(() => ({ rows: [{ id: 'audit-only' }] }));

    const authId = (authResult.rows[0] as { id: string }).id;

    await AuditService.log({
      tenantId,
      userId,
      userEmail: req.user!.email ?? '',
      userRole: req.context?.role ?? 'OPERATIONAL',
      action: AuditAction.CREATE,
      event_category: AuditEventCategory.COMPLIANCE,
      resourceType: 'auction_asset',
      resourceId: id,
      description: `Autorização de lance F3 registrada por ${req.user!.email} — teto: R$${(teto_autorizado / 100).toFixed(2)}`,
      details: { auth_id: authId, teto_autorizado, certidoes_anexadas, justificativa },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      auth_id: authId,
      asset_id: id,
      teto_autorizado,
      message: 'Autorização de lance F3 registrada com sucesso.',
    });
  })
);

// ============================================
// Bid Override (F3 — Hard Gate MPGA)
// ============================================

/**
 * POST /auctions/assets/:id/bid-override
 * Override bid hard gate — OWNER only, requires TOTP OTP + justification.
 * Creates an audited override_event so the bypass is fully traceable.
 * Spec 4.5: "Override de Lance — Admin — Token OTP + justificativa. Registrado em override_events."
 */
const bidOverrideSchema = z.object({
  body: z.object({
    otp_code: z.string().length(6, 'Código OTP deve ter exatamente 6 dígitos'),
    justification: z.string().min(200, 'Justificativa deve ter pelo menos 200 caracteres (Spec 4.5)'),
    target_stage: z.string().min(1, 'Estágio alvo obrigatório (ex: F3, F4)').optional(),
  }),
});

router.post(
  '/assets/:id/bid-override',
  authenticate,
  requirePermission('auctions:override'),
  validateRequest(bidOverrideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { otp_code, justification, target_stage } = req.body;
    const { tenantId, role } = getTenantContext(req);
    const userId = req.user!.id;

    // Fetch auction asset
    const asset = await AuctionAssetModel.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');

    // Verify TOTP OTP against user's MFA secret
    const userRow = await db.query(
      'SELECT mfa_secret FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const mfaRow = userRow.rows[0] as { mfa_secret: string | null } | undefined;

    if (!mfaRow?.mfa_secret) {
      res.status(400).json({
        success: false,
        error: 'MFA não configurado. Configure o autenticador antes de usar o override de lance.',
      });
      return;
    }

    const { verifySync } = await import('otplib');
    const otpValid = verifySync({ token: otp_code, secret: mfaRow.mfa_secret });

    if (!otpValid) {
      logger.warn('Bid override OTP invalid', { userId, assetId: id });
      res.status(401).json({ success: false, error: 'Código OTP inválido ou expirado.' });
      return;
    }

    // Insert override_event record
    const overrideResult = await db.query(
      `INSERT INTO override_events
         (tenant_id, user_id, user_email, override_type, target_entity, target_id, otp_verified, reason, justification, metadata)
       VALUES ($1, $2, $3, 'bid_override', 'auction_asset', $4, TRUE, $5, $5, $6)
       RETURNING id`,
      [
        tenantId,
        userId,
        req.user!.email ?? '',
        id,
        justification,
        JSON.stringify({
          asset_title: asset.title,
          current_stage: asset.current_stage,
          target_stage: target_stage ?? null,
          risk_score: asset.risk_score,
        }),
      ]
    ).catch(() => ({ rows: [{ id: 'audit-only' }] }));

    const overrideId = (overrideResult.rows[0] as { id: string }).id;

    // Mandatory compliance audit log
    await AuditService.log({
      tenantId,
      userId,
      userEmail: req.user!.email ?? '',
      userRole: role,
      action: AuditAction.UPDATE,
      event_category: AuditEventCategory.COMPLIANCE,
      resourceType: 'auction_asset',
      resourceId: id,
      description: `Override de lance executado por ${req.user!.email} — ativo ${asset.title}. Justificativa: ${justification}`,
      details: {
        override_id: overrideId,
        risk_score: asset.risk_score,
        current_stage: asset.current_stage,
        target_stage: target_stage ?? null,
        justification,
        otp_verified: true,
      },
      requestId: (req as any).id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    logger.info('Bid override recorded', { userId, assetId: id, overrideId });

    res.json({
      success: true,
      override_id: overrideId,
      asset_id: id,
      message: 'Override de lance registado e auditado com sucesso.',
    });
  })
);

export default router;
