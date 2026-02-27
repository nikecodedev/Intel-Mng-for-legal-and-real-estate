import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError } from '../utils/errors.js';
import { DashboardConfigModel } from '../models/dashboard.js';
import { DashboardKPIService } from '../services/dashboard-kpis.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const getKPISchema = z.object({
  query: z.object({
    kpi_types: z.string().optional(), // Comma-separated list
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  }),
});

// ============================================
// Dashboard Routes
// ============================================

/**
 * GET /dashboards
 * Get dashboards visible to current user (role-based)
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, role: userRole } = getTenantContext(req);
    const userPermissions: string[] = (req as Request & { user?: { permissions?: string[] } }).user?.permissions ?? [];

    const dashboards = await DashboardConfigModel.getVisibleDashboards(
      tenantId,
      userRole,
      userPermissions
    );

    res.json({
      success: true,
      dashboards,
    });
  })
);

/**
 * GET /dashboards/:id
 * Get single dashboard config
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { tenantId, role: userRole } = getTenantContext(req);
    const userPermissions: string[] = (req as Request & { user?: { permissions?: string[] } }).user?.permissions ?? [];

    const dashboard = await DashboardConfigModel.findById(id, tenantId);
    if (!dashboard) {
      throw new NotFoundError('Dashboard');
    }

    // Check visibility
    const visibleDashboards = await DashboardConfigModel.getVisibleDashboards(
      tenantId,
      userRole,
      userPermissions
    );
    const isVisible = visibleDashboards.some(d => d.id === id);

    if (!isVisible) {
      throw new NotFoundError('Dashboard');
    }

    res.json({
      success: true,
      dashboard,
    });
  })
);

/**
 * GET /dashboards/:id/kpis
 * Get KPIs for a dashboard
 */
router.get(
  '/:id/kpis',
  authenticate,
  validateRequest(getKPISchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { tenantId, role: userRole } = getTenantContext(req);
    const userPermissions: string[] = (req as Request & { user?: { permissions?: string[] } }).user?.permissions ?? [];

    // Verify dashboard exists and is visible
    const dashboard = await DashboardConfigModel.findById(id, tenantId);
    if (!dashboard) {
      throw new NotFoundError('Dashboard');
    }

    const visibleDashboards = await DashboardConfigModel.getVisibleDashboards(
      tenantId,
      userRole,
      userPermissions
    );
    const isVisible = visibleDashboards.some(d => d.id === id);

    if (!isVisible) {
      throw new NotFoundError('Dashboard');
    }

    // Get KPI types from dashboard config or query params
    const kpiTypes = req.query.kpi_types
      ? (req.query.kpi_types as string).split(',').map(t => t.trim().toUpperCase())
      : undefined;

    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    // Get KPIs
    const kpis = await DashboardKPIService.getAllKPIs(tenantId, kpiTypes as any);

    res.json({
      success: true,
      dashboard_id: id,
      kpis,
      refresh_interval: dashboard.auto_refresh_interval_seconds,
      cached_at: new Date().toISOString(),
    });
  })
);

// ============================================
// KPI Routes (Direct Access)
// ============================================

/**
 * GET /dashboards/kpis/cash-flow
 * Get cash flow KPI
 */
router.get(
  '/kpis/cash-flow',
  authenticate,
  requirePermission('dashboards:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    const kpi = await DashboardKPIService.calculateCashFlow(tenantId, startDate, endDate);

    res.json({
      success: true,
      kpi,
    });
  })
);

/**
 * GET /dashboards/kpis/deadlines
 * Get deadlines KPI
 */
router.get(
  '/kpis/deadlines',
  authenticate,
  requirePermission('dashboards:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);

    const kpi = await DashboardKPIService.calculateDeadlines(tenantId);

    res.json({
      success: true,
      kpi,
    });
  })
);

/**
 * GET /dashboards/kpis/roi
 * Get ROI KPI
 */
router.get(
  '/kpis/roi',
  authenticate,
  requirePermission('dashboards:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);

    const kpi = await DashboardKPIService.calculateROI(tenantId);

    res.json({
      success: true,
      kpi,
    });
  })
);

/**
 * GET /dashboards/kpis/risk-exposure
 * Get risk exposure KPI
 */
router.get(
  '/kpis/risk-exposure',
  authenticate,
  requirePermission('dashboards:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);

    const kpi = await DashboardKPIService.calculateRiskExposure(tenantId);

    res.json({
      success: true,
      kpi,
    });
  })
);

/**
 * GET /dashboards/kpis/all
 * Get all KPIs
 */
router.get(
  '/kpis/all',
  authenticate,
  requirePermission('dashboards:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const kpiTypes = req.query.kpi_types
      ? (req.query.kpi_types as string).split(',').map(t => t.trim().toUpperCase())
      : undefined;

    const kpis = await DashboardKPIService.getAllKPIs(tenantId, kpiTypes as any);

    res.json({
      success: true,
      kpis,
      cached_at: new Date().toISOString(),
    });
  })
);

export default router;
