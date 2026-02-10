import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { parsePagination } from '../utils/pagination.js';
import { NotFoundError, AuthorizationError } from '../utils/errors.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { WorkflowTriggerModel, type WorkflowActionType } from '../models/workflow-trigger.js';
import { runWorkflow } from '../services/workflow-engine.js';

const router = Router();

const createTriggerSchema = z.object({
  body: z.object({
    name: z.string().max(255).optional(),
    event_type: z.string().min(1).max(100),
    condition: z.record(z.unknown()),
    action_type: z.enum(['create_task', 'send_notification', 'block_transition']),
    action_config: z.record(z.unknown()).optional(),
  }),
});

const emitSchema = z.object({
  body: z.object({
    event_type: z.string().min(1).max(100),
    payload: z.record(z.unknown()).optional(),
  }),
});

const updateActiveSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ is_active: z.boolean() }),
});

/**
 * GET /workflow/triggers
 * List workflow triggers for tenant. Optional filter by event_type.
 */
router.get(
  '/triggers',
  authenticate,
  requirePermission('workflow:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const event_type = req.query.event_type as string | undefined;
    const { limit, offset } = parsePagination(req.query);

    const triggers = await WorkflowTriggerModel.listByTenant(tenantId, {
      event_type,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        triggers: triggers.map((t) => ({
          id: t.id,
          name: t.name,
          event_type: t.event_type,
          condition: t.condition,
          action_type: t.action_type,
          action_config: t.action_config,
          is_active: t.is_active,
          created_at: t.created_at,
        })),
        pagination: { limit, offset },
      },
    });
  })
);

/**
 * POST /workflow/triggers
 * Create a workflow trigger (deterministic rule).
 */
router.post(
  '/triggers',
  authenticate,
  requirePermission('workflow:update'),
  validateRequest(createTriggerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { name, event_type, condition, action_type, action_config } = req.body;

    const trigger = await WorkflowTriggerModel.create({
      tenant_id: tenantId,
      name,
      event_type,
      condition,
      action_type: action_type as WorkflowActionType,
      action_config: action_config ?? {},
    });

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'workflow_trigger.create',
      event_category: AuditEventCategory.DATA_MODIFICATION,
      action: AuditAction.CREATE,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'workflow_trigger',
      resource_id: trigger.id,
      description: 'Workflow trigger created',
      details: { event_type, action_type },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['workflow'],
      retention_category: 'workflow',
    });

    res.status(201).json({
      success: true,
      data: {
        id: trigger.id,
        name: trigger.name,
        event_type: trigger.event_type,
        condition: trigger.condition,
        action_type: trigger.action_type,
        action_config: trigger.action_config,
        is_active: trigger.is_active,
        created_at: trigger.created_at,
      },
    });
  })
);

/**
 * GET /workflow/triggers/:id
 */
router.get(
  '/triggers/:id',
  authenticate,
  requirePermission('workflow:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    const trigger = await WorkflowTriggerModel.findById(id, tenantId);
    if (!trigger) throw new NotFoundError('Workflow trigger');

    res.json({
      success: true,
      data: {
        id: trigger.id,
        name: trigger.name,
        event_type: trigger.event_type,
        condition: trigger.condition,
        action_type: trigger.action_type,
        action_config: trigger.action_config,
        is_active: trigger.is_active,
        created_at: trigger.created_at,
        updated_at: trigger.updated_at,
      },
    });
  })
);

/**
 * PATCH /workflow/triggers/:id
 * Update is_active only.
 */
router.patch(
  '/triggers/:id',
  authenticate,
  requirePermission('workflow:update'),
  validateRequest(updateActiveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;
    const { is_active } = req.body;

    const trigger = await WorkflowTriggerModel.updateActive(id, tenantId, is_active);
    if (!trigger) throw new NotFoundError('Workflow trigger');

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'workflow_trigger.update',
      event_category: AuditEventCategory.DATA_MODIFICATION,
      action: AuditAction.UPDATE,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'workflow_trigger',
      resource_id: id,
      description: 'Workflow trigger updated',
      details: { is_active },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['workflow'],
      retention_category: 'workflow',
    });

    res.json({
      success: true,
      data: {
        id: trigger.id,
        is_active: trigger.is_active,
        updated_at: trigger.updated_at,
      },
    });
  })
);

/**
 * POST /workflow/emit
 * Emit an event and run workflow. If any trigger blocks, returns 403.
 * Use before performing a transition to enforce "block transition" rules.
 */
router.post(
  '/emit',
  authenticate,
  requirePermission('workflow:emit'),
  validateRequest(emitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { event_type, payload } = req.body;

    const result = await runWorkflow({
      tenantId,
      eventType: event_type,
      payload: payload ?? {},
      userId,
      userEmail: req.user!.email,
      userRole: req.context?.role,
      request: req,
    });

    if (!result.allowed) {
      throw new AuthorizationError(result.blockMessage ?? 'Action blocked by workflow rule.');
    }

    res.json({
      success: true,
      data: {
        allowed: true,
        triggered: result.triggered,
      },
    });
  })
);

export default router;
