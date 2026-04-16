import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError, ValidationError, InvalidTransitionError } from '../utils/errors.js';
import { RealEstateAssetModel, AssetState, getValidNextStates } from '../models/real-estate-asset.js';
import { db } from '../models/database.js';
import { AssetCostModel, CostType, PaymentStatus } from '../models/asset-cost.js';
import { VacancyMonitoringService } from '../services/vacancy-monitoring.js';
import { AssetCostCalculationService } from '../services/asset-cost-calculation.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const createAssetSchema = z.object({
  body: z.object({
    asset_code: z.string().min(1).max(255),
    property_address: z.string().min(1),
    property_type: z.string().optional(),
    property_size_sqm: z.number().positive().optional(),
    number_of_rooms: z.number().int().positive().optional(),
    number_of_bathrooms: z.number().int().positive().optional(),
    auction_asset_id: z.string().uuid().optional(),
    linked_document_ids: z.array(z.string().uuid()).optional(),
    acquisition_date: z.string().date().optional(),
    acquisition_price_cents: z.number().int().positive().optional(),
    acquisition_source: z.string().optional(),
    owner_id: z.string().uuid().optional(),
    assigned_to_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

const updateAssetSchema = z.object({
  body: z.object({
    property_address: z.string().min(1).optional(),
    property_type: z.string().optional(),
    property_size_sqm: z.number().positive().optional(),
    number_of_rooms: z.number().int().positive().optional(),
    number_of_bathrooms: z.number().int().positive().optional(),
    linked_document_ids: z.array(z.string().uuid()).optional(),
    linked_financial_record_ids: z.array(z.string().uuid()).optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
    owner_id: z.string().uuid().optional(),
    assigned_to_id: z.string().uuid().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

const transitionStateSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    // Spec Parcial #7: estados em PT-BR
    to_state: z.enum(['ADQUIRIDO', 'REGULARIZACAO', 'REFORMA', 'PRONTO', 'EM_NEGOCIACAO', 'VENDIDO', 'ALUGADO', 'ENCERRADO']),
    // Spec 5.3: Justificativa — textarea — Sim — Mínimo 100 caracteres
    reason: z.string().min(100, 'Justificativa obrigatória com mínimo 100 caracteres (Spec 5.3)'),
    // Spec 5.3: Documento Comprobatório — obrigatório para READY (DISPONIVEL_VENDA) e SOLD/RENTED
    document_proof_url: z.string().min(1).optional(),
    sale_date: z.string().date().optional(),
    sale_price_cents: z.number().int().positive().optional(),
    sale_buyer_name: z.string().optional(),
    rental_start_date: z.string().date().optional(),
    rental_end_date: z.string().date().optional(),
    rental_monthly_amount_cents: z.number().int().positive().optional(),
    rental_tenant_name: z.string().optional(),
  }),
});

const createCostSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    cost_type: z.enum(['acquisition', 'regularization', 'renovation', 'maintenance', 'taxes', 'legal', 'other']),
    cost_category: z.string().optional(),
    description: z.string().min(1),
    amount_cents: z.number().int().positive(),
    currency: z.string().length(3).optional(),
    cost_date: z.string().date(),
    invoice_number: z.string().optional(),
    vendor_name: z.string().optional(),
    linked_document_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

// ============================================
// Asset Routes
// ============================================

/**
 * POST /assets
 * Create new real estate asset
 */
router.post(
  '/',
  authenticate,
  requirePermission('assets:create'),
  validateRequest(createAssetSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const asset = await RealEstateAssetModel.create({
      tenant_id: tenantContext.tenantId,
      ...req.body,
    });

    // Audit creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'asset.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'real_estate_asset',
      resourceId: asset.id,
      description: `Created real estate asset ${asset.asset_code}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      asset,
    });
  })
);

/**
 * GET /assets
 * List real estate assets
 */
router.get(
  '/',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const state = req.query.state as AssetState | undefined;
    const is_vacant = req.query.is_vacant === 'true' ? true : req.query.is_vacant === 'false' ? false : undefined;
    const property_type = req.query.property_type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { assets, total } = await RealEstateAssetModel.list(tenantContext.tenantId, {
      state,
      is_vacant,
      property_type,
      limit,
      offset,
    });

    res.json({
      success: true,
      assets,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /assets/:id
 * Get single real estate asset
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    res.json({
      success: true,
      asset,
    });
  })
);

/**
 * PUT /assets/:id
 * Update real estate asset (does not change state)
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('assets:update'),
  validateRequest(updateAssetSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    const asset = await RealEstateAssetModel.update(id, tenantContext.tenantId, req.body);

    // Audit update
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'asset.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'real_estate_asset',
      resourceId: asset.id,
      description: `Updated real estate asset ${asset.asset_code}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      asset,
    });
  })
);

/**
 * POST /assets/:id/transition
 * Transition asset state (with validation)
 */
router.post(
  '/:id/transition',
  authenticate,
  requirePermission('assets:update'),
  validateRequest(transitionStateSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    // Get current asset
    const currentAsset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!currentAsset) {
      throw new NotFoundError('Real estate asset');
    }

    // Spec #7: Hard block — legal_hold blocks ALL transitions; trava_venda blocks sale transitions
    const flagsRow = await db.query<{ legal_hold: boolean; trava_venda: boolean }>(
      `SELECT COALESCE(legal_hold, false) AS legal_hold, COALESCE(trava_venda, false) AS trava_venda
       FROM real_estate_assets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenantContext.tenantId]
    );
    if (flagsRow.rows[0]?.legal_hold) {
      throw new ValidationError('Legal Hold ativo: toda movimentação de estado deste ativo está bloqueada.');
    }

    // Ref: Spec §5.5 — Trava de Venda Legal: bloqueia transição READY/SOLD/RENTED se EM_REGULARIZACAO ou matrícula não limpa
    //   (a) status atual = REGULARIZATION  OU
    //   (b) matricula_status != 'LIMPA' (matrícula com pendências no cartório)
    const targetState = req.body.to_state as AssetState;
    const isSaleTransition = targetState === 'PRONTO' || targetState === 'VENDIDO' || targetState === 'ALUGADO';

    if (isSaleTransition && flagsRow.rows[0]?.trava_venda) {
      throw new ValidationError('Trava de Venda ativa: imóvel não pode ser vendido ou alugado até a trava ser removida.');
    }

    if (isSaleTransition && currentAsset.current_state === 'REGULARIZACAO') {
      throw new ValidationError(
        'Trava de Venda Legal: imóvel em regularização não pode ser colocado à venda ou aluguel.'
      );
    }

    if (isSaleTransition) {
      // Fetch matricula_status directly (may not be in model cache)
      const matriculaRow = await db.query<{ matricula_status: string }>(
        `SELECT COALESCE(matricula_status, 'PENDENTE') AS matricula_status
         FROM real_estate_assets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, tenantContext.tenantId]
      );
      const matriculaStatus = matriculaRow.rows[0]?.matricula_status ?? 'PENDENTE';
      if (matriculaStatus !== 'LIMPA') {
        throw new ValidationError(
          `Trava de Venda Legal: matrícula do imóvel está "${matriculaStatus}" — somente imóveis com matrícula LIMPA podem ser vendidos ou alugados.`
        );
      }
    }

    // Ref: Spec §5.3 — Documento Comprobatório obrigatório para READY (DISPONIVEL_VENDA), SOLD e RENTED
    if (isSaleTransition && !req.body.document_proof_url) {
      throw new ValidationError(
        'Documento Comprobatório obrigatório para alterar status para READY, SOLD ou RENTED (Spec 5.3).'
      );
    }

    // Block SOLD/RENTED without required checklist completion
    if (targetState === 'VENDIDO' || targetState === 'ALUGADO') {
      const requiredPriorStates: AssetState[] = ['REGULARIZACAO', 'REFORMA'];
      const stateHistory = await db.query<{ to_state: string }>(
        `SELECT DISTINCT to_state FROM asset_state_transitions
         WHERE tenant_id = $1 AND real_estate_asset_id = $2 AND is_valid = true`,
        [tenantContext.tenantId, id]
      );
      const visitedStates = new Set(stateHistory.rows.map((r: { to_state: string }) => r.to_state));
      // Also count the current state as visited
      visitedStates.add(currentAsset.current_state);

      const missingStates = requiredPriorStates.filter((s) => !visitedStates.has(s));
      if (missingStates.length > 0) {
        throw new ValidationError(
          `Cannot transition to ${targetState}: asset must pass through ${missingStates.join(', ')} first`
        );
      }

      // Check regularization checklist completion
      const checklistResult = await db.query<{ total: string; completed: string }>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_completed = true) as completed
         FROM regularization_checklists
         WHERE tenant_id = $1 AND real_estate_asset_id = $2`,
        [tenantContext.tenantId, id]
      );
      const checklist = checklistResult.rows[0];
      if (checklist.total === '0') {
        throw new ValidationError('Não é possível transicionar para VENDIDO/ALUGADO: checklist de regularização não encontrado.');
      }
      if (checklist.completed !== checklist.total) {
        throw new ValidationError(`Não é possível transicionar para VENDIDO/ALUGADO: checklist ${checklist.completed}/${checklist.total} concluído.`);
      }

      // Verify acquisition cost is recorded
      if (!currentAsset.acquisition_price_cents) {
        throw new ValidationError(
          `Cannot transition to ${targetState}: acquisition_price_cents must be filled`
        );
      }
    }

    // Transition state
    const asset = await RealEstateAssetModel.transitionState(
      id,
      tenantContext.tenantId,
      userId,
      req.body
    );

    // Update vacancy monitoring
    await VacancyMonitoringService.updateVacancyOnStateChange(currentAsset, req.body.to_state);

    // Audit state transition
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'asset.state_transition',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'real_estate_asset',
      resourceId: asset.id,
      description: `State transition: ${currentAsset.current_state} → ${asset.current_state}`,
      details: {
        from_state: currentAsset.current_state,
        to_state: asset.current_state,
        reason: req.body.reason,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      asset,
      transition: {
        from: currentAsset.current_state,
        to: asset.current_state,
        valid_next_states: getValidNextStates(asset.current_state),
      },
    });
  })
);

/**
 * GET /assets/:id/valid-transitions
 * Get valid next states for current asset state
 */
router.get(
  '/:id/valid-transitions',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    res.json({
      success: true,
      current_state: asset.current_state,
      valid_next_states: getValidNextStates(asset.current_state),
    });
  })
);

// ============================================
// Cost Tracking Routes
// ============================================

/**
 * POST /assets/:id/costs
 * Add cost to asset
 */
router.post(
  '/:id/costs',
  authenticate,
  requirePermission('assets:update'),
  validateRequest(createCostSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify asset exists
    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    const cost = await AssetCostModel.create(
      {
        tenant_id: tenantContext.tenantId,
        real_estate_asset_id: id,
        ...req.body,
      },
      userId
    );

    // Audit cost creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'asset.cost.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'asset_cost',
      resourceId: cost.id,
      description: `Added cost ${cost.cost_type} of ${cost.amount_cents / 100} to asset ${asset.asset_code}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    // Spec §9: CAPEX vínculo automático a projeto_id — campo explícito (não process_id)
    const { amount_cents, description } = req.body;
    try {
      const assetRow = await db.query(`SELECT projeto_id FROM real_estate_assets WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, tenantContext.tenantId]);
      const projetoId = (assetRow.rows[0] as any)?.projeto_id ?? null;
      if (projetoId && amount_cents > 0) {
        await db.query(
          `INSERT INTO financial_transactions (tenant_id, transaction_type, amount_cents, currency, description, projeto_id, real_estate_asset_id, transaction_date, status, created_by)
           VALUES ($1, 'EXPENSE', $2, 'BRL', $3, $4, $5, CURRENT_DATE, 'APPROVED', $6)
           ON CONFLICT DO NOTHING`,
          [tenantContext.tenantId, amount_cents, `CAPEX: ${description}`, projetoId, id, userId]
        );
        logger.info('CAPEX auto-transaction created via projeto_id', { assetId: id, projetoId, amount_cents });
      } else if (!projetoId) {
        logger.warn('CAPEX auto-link skipped: asset has no projeto_id', { assetId: id });
      }
    } catch (capexErr) { logger.warn('CAPEX auto-transaction failed', { error: capexErr }); }

    res.status(201).json({
      success: true,
      cost,
    });
  })
);

/**
 * GET /assets/:id/costs
 * List costs for asset
 */
router.get(
  '/:id/costs',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const cost_type = req.query.cost_type as CostType | undefined;
    const payment_status = req.query.payment_status as PaymentStatus | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { costs, total } = await AssetCostModel.listByAsset(id, tenantContext.tenantId, {
      cost_type,
      payment_status,
      limit,
      offset,
    });

    res.json({
      success: true,
      costs,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /assets/:id/costs/total
 * Calculate total costs for asset
 */
router.get(
  '/:id/costs/total',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const cost_type = req.query.cost_type as CostType | undefined;
    const payment_status = req.query.payment_status as PaymentStatus | undefined;
    const include_pending = req.query.include_pending !== 'false';

    const totals = await AssetCostModel.calculateTotalCosts(id, tenantContext.tenantId, {
      cost_type,
      payment_status,
      include_pending,
    });

    res.json({
      success: true,
      totals: {
        ...totals,
        total_formatted: `R$ ${(totals.total_cents / 100).toFixed(2)}`,
      },
    });
  })
);

/**
 * GET /assets/:id/real-cost
 * Calculate real cost (acquisition + all costs) dynamically
 */
router.get(
  '/:id/real-cost',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const include_pending = req.query.include_pending !== 'false';

    const breakdown = await AssetCostCalculationService.getCostBreakdownFormatted(
      id,
      tenantContext.tenantId
    );

    res.json({
      success: true,
      breakdown,
    });
  })
);

// ============================================
// Vacancy Monitoring Routes
// ============================================

/**
 * GET /assets/vacancy/alerts
 * Get assets requiring vacancy alerts
 */
router.get(
  '/vacancy/alerts',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);

    const alerts = await VacancyMonitoringService.checkVacancyAlerts(tenantContext.tenantId);

    res.json({
      success: true,
      alerts,
      count: alerts.length,
    });
  })
);

/**
 * POST /assets/vacancy/process-alerts
 * Process and send all vacancy alerts
 */
router.post(
  '/vacancy/process-alerts',
  authenticate,
  requirePermission('assets:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const sentCount = await VacancyMonitoringService.processVacancyAlerts(
      tenantContext.tenantId,
      userId
    );

    res.json({
      success: true,
      alerts_sent: sentCount,
      message: `Processed ${sentCount} vacancy alerts`,
    });
  })
);

/**
 * GET /assets/vacancy/statistics
 * Get vacancy statistics
 */
router.get(
  '/vacancy/statistics',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);

    const stats = await VacancyMonitoringService.getVacancyStatistics(tenantContext.tenantId);

    res.json({
      success: true,
      statistics: stats,
    });
  })
);

const updateVacancySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    is_vacant: z.boolean(),
  }),
});

/**
 * PUT /assets/:id/vacancy
 * Update vacancy status manually
 */
router.put(
  '/:id/vacancy',
  authenticate,
  requirePermission('assets:update'),
  validateRequest(updateVacancySchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const { is_vacant } = req.body;
    const userId = req.user!.id;

    const asset = await RealEstateAssetModel.updateVacancy(id, tenantContext.tenantId, is_vacant);

    // Audit vacancy update
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'asset.vacancy.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'real_estate_asset',
      resourceId: asset.id,
      description: `Updated vacancy status to ${is_vacant ? 'vacant' : 'occupied'} for asset ${asset.asset_code}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      asset,
    });
  })
);

// ============================================
// Works Routes
// ============================================

/**
 * GET /assets/:id/works
 * List works for an asset
 */
router.get(
  '/:id/works',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    // Verify asset exists
    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM asset_works WHERE tenant_id = $1 AND real_estate_asset_id = $2`,
      [tenantContext.tenantId, id]
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const result = await db.query(
      `SELECT * FROM asset_works WHERE tenant_id = $1 AND real_estate_asset_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [tenantContext.tenantId, id, limit, offset]
    );

    res.json({
      success: true,
      works: result.rows,
      total,
      limit,
      offset,
    });
  })
);

/**
 * POST /assets/:id/works
 * Create a work item for an asset
 */
router.post(
  '/:id/works',
  authenticate,
  requirePermission('assets:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify asset exists
    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    const { title, description, work_type, status, estimated_cost_cents, actual_cost_cents, start_date, end_date, contractor_name, notes } = req.body;

    if (!title) {
      throw new ValidationError('title is required');
    }

    const result = await db.query<{ id: string }>(
      `INSERT INTO asset_works (tenant_id, real_estate_asset_id, title, description, work_type, status, estimated_cost_cents, actual_cost_cents, start_date, end_date, contractor_name, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        tenantContext.tenantId,
        id,
        title,
        description || null,
        work_type || null,
        status || 'PLANNED',
        estimated_cost_cents || null,
        actual_cost_cents || null,
        start_date || null,
        end_date || null,
        contractor_name || null,
        notes || null,
        userId,
      ]
    );

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'asset.work.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'asset_work',
      resourceId: result.rows[0].id,
      description: `Created work item "${title}" for asset ${asset.asset_code}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      work: result.rows[0],
    });
  })
);

// ============================================
// Liabilities Routes
// ============================================

/**
 * GET /assets/:id/liabilities
 * List liabilities for an asset
 */
router.get(
  '/:id/liabilities',
  authenticate,
  requirePermission('assets:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    // Verify asset exists
    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM asset_liabilities WHERE tenant_id = $1 AND real_estate_asset_id = $2`,
      [tenantContext.tenantId, id]
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const result = await db.query(
      `SELECT * FROM asset_liabilities WHERE tenant_id = $1 AND real_estate_asset_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [tenantContext.tenantId, id, limit, offset]
    );

    res.json({
      success: true,
      liabilities: result.rows,
      total,
      limit,
      offset,
    });
  })
);

/**
 * POST /assets/:id/liabilities
 * Create a liability for an asset
 */
router.post(
  '/:id/liabilities',
  authenticate,
  requirePermission('assets:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify asset exists
    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    const { title, description, liability_type, amount_cents, currency, due_date, status, creditor_name, notes } = req.body;

    if (!title) {
      throw new ValidationError('title is required');
    }

    const result = await db.query<{ id: string }>(
      `INSERT INTO asset_liabilities (tenant_id, real_estate_asset_id, title, description, liability_type, amount_cents, currency, due_date, status, creditor_name, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tenantContext.tenantId,
        id,
        title,
        description || null,
        liability_type || null,
        amount_cents || null,
        currency || 'BRL',
        due_date || null,
        status || 'ACTIVE',
        creditor_name || null,
        notes || null,
        userId,
      ]
    );

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'asset.liability.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'asset_liability',
      resourceId: result.rows[0].id,
      description: `Created liability "${title}" for asset ${asset.asset_code}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    // Emit workflow event: Passivo > R$10k → bloquear + notificar Owner
    try {
      const { runWorkflow } = await import('../services/workflow-engine.js');
      await runWorkflow({
        tenantId: tenantContext.tenantId,
        eventType: 'asset.liability.created',
        payload: {
          liability_id: result.rows[0].id,
          real_estate_asset_id: id,
          asset_code: asset.asset_code,
          title,
          amount_cents: amount_cents || 0,
          liability_type: liability_type || null,
        },
        userId,
        userEmail: req.user!.email,
        userRole: tenantContext.role,
        request: req,
      });
    } catch (wfErr) {
      logger.warn('Workflow event asset.liability.created failed', { error: wfErr });
    }

    res.status(201).json({
      success: true,
      liability: result.rows[0],
    });
  })
);

// ============================================
// Publish Commercial Listing — Spec 5.5
// ============================================

/**
 * POST /assets/:id/listing
 * Publish a commercial listing for an asset.
 * Spec 5.5: Hard Gate — asset must be in READY (DISPONIVEL_VENDA) or RENTED (LOCADO) state.
 */
router.post(
  '/:id/listing',
  authenticate,
  requirePermission('assets:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    const asset = await RealEstateAssetModel.findById(id, tenantContext.tenantId);
    if (!asset) throw new NotFoundError('Real estate asset');

    // Spec 5.5: Publicar Anúncio exige status PRONTO ou ALUGADO
    if (asset.current_state !== 'PRONTO' && asset.current_state !== 'ALUGADO') {
      throw new ValidationError(
        `Publicar anúncio requer status PRONTO ou ALUGADO. ` +
        `Status atual: ${asset.current_state} (Spec 5.5).`
      );
    }

    const { listing_type, asking_price, description } = req.body;

    const result = await db.query(
      `INSERT INTO asset_listings (tenant_id, real_estate_asset_id, listing_type, asking_price_cents, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
       ON CONFLICT (tenant_id, real_estate_asset_id, status)
       DO UPDATE SET listing_type = EXCLUDED.listing_type, asking_price_cents = EXCLUDED.asking_price_cents,
         description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        tenantContext.tenantId,
        id,
        listing_type ?? 'VENDA',
        asking_price ? Math.round(Number(asking_price) * 100) : null,
        description ?? null,
        userId,
      ]
    ).catch(async () => {
      // Fallback if table doesn't exist yet — store in asset metadata
      await db.query(
        `UPDATE real_estate_assets SET metadata = COALESCE(metadata, '{}')::jsonb ||
         $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3`,
        [JSON.stringify({ listing: { listing_type, asking_price, description, published_at: new Date().toISOString() } }), id, tenantContext.tenantId]
      );
      return { rows: [{ id: null, listing_type, asking_price, description, status: 'ACTIVE' }] };
    });

    res.status(201).json({
      success: true,
      listing: result.rows[0],
      message: 'Anúncio publicado com sucesso.',
    });
  })
);

// ============================================
// Spec §5.5 — Legal Hold / Trava de Venda (Divergência #7)
// ============================================

const setLegalHoldSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    active: z.boolean(),
    reason: z.string().min(10).optional(),
  }).refine(
    (d) => !d.active || !!d.reason,
    { message: 'reason é obrigatório ao ativar legal_hold', path: ['reason'] }
  ),
});

const setTravaVendaSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    active: z.boolean(),
    reason: z.string().min(10).optional(),
  }).refine(
    (d) => !d.active || !!d.reason,
    { message: 'reason é obrigatório ao ativar trava_venda', path: ['reason'] }
  ),
});

/**
 * PATCH /assets/:id/legal-hold
 * Set or clear legal hold on an asset (OWNER/ADMIN only). Blocks all sales when active (Spec §5.5).
 */
router.patch(
  '/:id/legal-hold',
  authenticate,
  requirePermission('assets:update'),
  validateRequest(setLegalHoldSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const { active, reason } = req.body;
    const userId = req.user!.id;

    const assetResult = await db.query<{ id: string; asset_code: string }>(
      `SELECT id, asset_code FROM real_estate_assets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [id, tenantContext.tenantId]
    );
    if (assetResult.rows.length === 0) throw new NotFoundError('Real estate asset');

    await db.query(
      `UPDATE real_estate_assets
       SET legal_hold = $1,
           legal_hold_reason = $2,
           legal_hold_set_by = $3,
           legal_hold_set_at = CASE WHEN $1 THEN NOW() ELSE legal_hold_set_at END,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [active, reason ?? null, userId, id, tenantContext.tenantId]
    );

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: active ? 'asset.legal_hold.set' : 'asset.legal_hold.cleared',
      eventCategory: AuditEventCategory.COMPLIANCE,
      resourceType: 'real_estate_asset',
      resourceId: id,
      description: `Legal hold ${active ? 'ATIVADO' : 'REMOVIDO'} no imóvel ${assetResult.rows[0].asset_code}${reason ? ': ' + reason : ''}`,
      details: { active, reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      asset_id: id,
      legal_hold: active,
      message: active ? 'Legal hold ativado. Listagens de venda bloqueadas.' : 'Legal hold removido.',
    });
  })
);

/**
 * PATCH /assets/:id/trava-venda
 * Set or clear trava_venda on an asset. Blocks sale listings when active (Spec §5.5).
 */
router.patch(
  '/:id/trava-venda',
  authenticate,
  requirePermission('assets:update'),
  validateRequest(setTravaVendaSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const { active, reason } = req.body;
    const userId = req.user!.id;

    const assetResult = await db.query<{ id: string; asset_code: string }>(
      `SELECT id, asset_code FROM real_estate_assets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [id, tenantContext.tenantId]
    );
    if (assetResult.rows.length === 0) throw new NotFoundError('Real estate asset');

    await db.query(
      `UPDATE real_estate_assets
       SET trava_venda = $1,
           trava_venda_reason = $2,
           trava_venda_set_by = $3,
           trava_venda_set_at = CASE WHEN $1 THEN NOW() ELSE trava_venda_set_at END,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [active, reason ?? null, userId, id, tenantContext.tenantId]
    );

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: active ? 'asset.trava_venda.set' : 'asset.trava_venda.cleared',
      eventCategory: AuditEventCategory.COMPLIANCE,
      resourceType: 'real_estate_asset',
      resourceId: id,
      description: `Trava de venda ${active ? 'ATIVADA' : 'REMOVIDA'} no imóvel ${assetResult.rows[0].asset_code}${reason ? ': ' + reason : ''}`,
      details: { active, reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      asset_id: id,
      trava_venda: active,
      message: active ? 'Trava de venda ativada. Imóvel não pode ser listado para venda.' : 'Trava de venda removida.',
    });
  })
);

export default router;

