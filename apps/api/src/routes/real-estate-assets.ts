import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError, ValidationError, InvalidTransitionError } from '../utils/errors.js';
import { RealEstateAssetModel, AssetState, getValidNextStates } from '../models/real-estate-asset.js';
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
    to_state: z.enum(['ACQUIRED', 'REGULARIZATION', 'RENOVATION', 'READY', 'SOLD', 'RENTED']),
    reason: z.string().optional(),
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

export default router;
