import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware';
import { getTenantContext } from '../utils/tenant-context';
import { NotFoundError, ValidationError } from '../utils/errors';
import { QualityGateModel, GateType, FailureAction } from '../models/quality-gate';
import { GateCheckModel, ResourceType } from '../models/gate-check';
import { QualityGateService } from '../services/quality-gate';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const createQualityGateSchema = z.object({
  body: z.object({
    gate_code: z.string().regex(/^QG[1-9][0-9]*$/),
    gate_name: z.string().min(1),
    description: z.string().optional(),
    gate_type: z.enum(['DOCUMENT', 'APPROVAL', 'RISK_SCORE', 'CUSTOM', 'DATA_COMPLETENESS', 'VALIDATION']),
    gate_category: z.string().optional(),
    gate_rules: z.record(z.unknown()),
    is_blocking: z.boolean().optional(),
    is_mandatory: z.boolean().optional(),
    failure_action: z.enum(['BLOCK', 'WARN', 'REQUIRE_OVERRIDE']).optional(),
    priority: z.number().int().optional(),
    applies_to_process_types: z.array(z.string()).optional(),
    applies_to_stages: z.array(z.string()).optional(),
  }),
});

const checkGatesSchema = z.object({
  body: z.object({
    resource_type: z.enum(['PROCESS', 'AUCTION_ASSET', 'REAL_ESTATE_ASSET', 'DOCUMENT']),
    resource_id: z.string().uuid(),
    process_type: z.string().optional(),
    stage: z.string().optional(),
  }),
});

// ============================================
// Quality Gates Routes
// ============================================

/**
 * POST /quality-gates
 * Create new quality gate
 */
router.post(
  '/',
  authenticate,
  requirePermission('quality_gates:create'),
  validateRequest(createQualityGateSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const gate = await QualityGateModel.create(
      {
        tenant_id: tenantContext.tenantId,
        ...req.body,
      },
      userId
    );

    // Audit gate creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'quality_gate.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'quality_gate',
      resourceId: gate.id,
      description: `Created quality gate ${gate.gate_code}: ${gate.gate_name}`,
      details: {
        gate_code: gate.gate_code,
        gate_type: gate.gate_type,
        is_blocking: gate.is_blocking,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      gate,
    });
  })
);

/**
 * GET /quality-gates
 * List quality gates
 */
router.get(
  '/',
  authenticate,
  requirePermission('quality_gates:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const gate_type = req.query.gate_type as GateType | undefined;
    const gate_category = req.query.gate_category as string | undefined;
    const is_active = req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { gates, total } = await QualityGateModel.list(tenantContext.tenantId, {
      gate_type,
      gate_category,
      is_active,
      limit,
      offset,
    });

    res.json({
      success: true,
      gates,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /quality-gates/:id
 * Get single quality gate
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('quality_gates:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const gate = await QualityGateModel.findById(id, tenantContext.tenantId);
    if (!gate) {
      throw new NotFoundError('Quality gate');
    }

    res.json({
      success: true,
      gate,
    });
  })
);

/**
 * GET /quality-gates/code/:code
 * Get gate by code (e.g., QG1, QG2)
 */
router.get(
  '/code/:code',
  authenticate,
  requirePermission('quality_gates:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { code } = req.params;

    const gate = await QualityGateModel.findByCode(code, tenantContext.tenantId);
    if (!gate) {
      throw new NotFoundError('Quality gate');
    }

    res.json({
      success: true,
      gate,
    });
  })
);

// ============================================
// Gate Checks Routes
// ============================================

/**
 * POST /quality-gates/check
 * Check all applicable gates for a resource
 */
router.post(
  '/check',
  authenticate,
  requirePermission('quality_gates:read'),
  validateRequest(checkGatesSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;
    const { resource_type, resource_id, process_type, stage } = req.body;

    const validation = await QualityGateService.checkGates(
      tenantContext.tenantId,
      resource_type,
      resource_id,
      process_type,
      stage,
      userId
    );

    // Audit gate check
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.READ,
      eventType: 'quality_gate.check',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: resource_type.toLowerCase(),
      resourceId: resource_id,
      description: `Quality gate check performed: ${validation.all_passed ? 'PASSED' : 'FAILED'}`,
      details: {
        all_passed: validation.all_passed,
        blocking_failures: validation.blocking_failures.length,
        workflow_blocked: validation.workflow_blocked,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      validation,
      can_proceed: !validation.workflow_blocked,
    });
  })
);

/**
 * GET /quality-gates/checks/:resource_type/:resource_id
 * Get gate checks for a resource
 */
router.get(
  '/checks/:resource_type/:resource_id',
  authenticate,
  requirePermission('quality_gates:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { resource_type, resource_id } = req.params;

    if (!['PROCESS', 'AUCTION_ASSET', 'REAL_ESTATE_ASSET', 'DOCUMENT'].includes(resource_type)) {
      throw new ValidationError('Invalid resource_type');
    }

    const checks = await GateCheckModel.findByResource(
      resource_type as ResourceType,
      resource_id,
      tenantContext.tenantId
    );

    res.json({
      success: true,
      checks,
      count: checks.length,
    });
  })
);

/**
 * POST /quality-gates/can-proceed
 * Check if workflow can proceed (all blocking gates passed)
 */
router.post(
  '/can-proceed',
  authenticate,
  requirePermission('quality_gates:read'),
  validateRequest(checkGatesSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { resource_type, resource_id, process_type, stage } = req.body;

    const result = await QualityGateService.canProceed(
      tenantContext.tenantId,
      resource_type,
      resource_id,
      process_type,
      stage
    );

    res.json({
      success: true,
      ...result,
    });
  })
);

/**
 * GET /quality-gates/decisions/:resource_type/:resource_id
 * Get gate decisions (immutable integrity log) for a resource
 */
router.get(
  '/decisions/:resource_type/:resource_id',
  authenticate,
  requirePermission('quality_gates:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { resource_type, resource_id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await db.query(
      `SELECT gd.*, qg.gate_code, qg.gate_name
       FROM gate_decisions gd
       JOIN quality_gates qg ON gd.quality_gate_id = qg.id
       WHERE gd.tenant_id = $1 
         AND gd.resource_type = $2 
         AND gd.resource_id = $3
       ORDER BY gd.created_at DESC
       LIMIT $4 OFFSET $5`,
      [tenantContext.tenantId, resource_type, resource_id, limit, offset]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM gate_decisions 
       WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3`,
      [tenantContext.tenantId, resource_type, resource_id]
    );

    res.json({
      success: true,
      decisions: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  })
);

export default router;
