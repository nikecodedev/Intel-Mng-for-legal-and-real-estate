import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { AuthorizationError } from '../utils/errors.js';
import { validate as validateIntelligence, type IntelligenceOperationContext } from '../services/intelligence.js';

const router = Router();

const resourceTypes = ['document', 'auction_asset', 'auction_asset_roi'] as const;
const operations = ['general', 'generate_document', 'place_bid', 'transition'] as const;

const validateSchema = z.object({
  body: z.object({
    resource_type: z.enum(resourceTypes),
    resource_id: z.string().uuid(),
    operation: z.enum(operations).optional(),
  }),
});

/**
 * POST /intelligence/validate
 * Run rule-bound validation. Returns allowed, violations, suggestions, completeness, inconsistencies.
 * If allowed is false, caller should refuse the operation (e.g. return 403).
 * All suggestions and refusals are logged. No autonomous execution; deterministic explanations only.
 */
router.post(
  '/validate',
  authenticate,
  requirePermission('intelligence:read'),
  validateRequest(validateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { resource_type, resource_id, operation } = req.body;

    const result = await validateIntelligence({
      tenantId,
      resourceType: resource_type,
      resourceId: resource_id,
      operation: (operation as IntelligenceOperationContext) ?? 'general',
      userId,
      userEmail: req.user!.email,
      userRole: req.context?.role,
      request: req,
    });

    res.json({
      success: true,
      data: {
        allowed: result.allowed,
        violations: result.violations,
        suggestions: result.suggestions,
        completeness: result.completeness,
        inconsistencies: result.inconsistencies,
      },
    });
  })
);

/**
 * POST /intelligence/validate-and-enforce
 * Same as validate but returns 403 when allowed is false (for direct use before an operation).
 */
router.post(
  '/validate-and-enforce',
  authenticate,
  requirePermission('intelligence:read'),
  validateRequest(validateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { resource_type, resource_id, operation } = req.body;

    const result = await validateIntelligence({
      tenantId,
      resourceType: resource_type,
      resourceId: resource_id,
      operation: (operation as IntelligenceOperationContext) ?? 'general',
      userId,
      userEmail: req.user!.email,
      userRole: req.context?.role,
      request: req,
    });

    if (!result.allowed) {
      const message = result.violations.map((v) => v.message).join('; ');
      throw new AuthorizationError(message || 'Operation refused by rule-bound intelligence.');
    }

    res.json({
      success: true,
      data: {
        allowed: true,
        suggestions: result.suggestions,
        completeness: result.completeness,
        inconsistencies: result.inconsistencies,
      },
    });
  })
);

/**
 * GET /intelligence/suggestions/:resourceType/:resourceId
 * Get non-destructive suggestions, completeness and inconsistencies only (read-only).
 * No refusal; use POST /validate when you need to check if an operation is allowed.
 */
router.get(
  '/suggestions/:resourceType/:resourceId',
  authenticate,
  requirePermission('intelligence:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { resourceType, resourceId } = req.params;
    const operation = (req.query.operation as IntelligenceOperationContext) ?? 'general';

    const validType = resourceTypes.includes(resourceType as (typeof resourceTypes)[number]);
    if (!validType) {
      res.status(400).json({ success: false, error: 'Invalid resource_type' });
      return;
    }

    const result = await validateIntelligence({
      tenantId,
      resourceType: resourceType as (typeof resourceTypes)[number],
      resourceId,
      operation,
      userId,
      userEmail: req.user!.email,
      userRole: req.context?.role,
      request: req,
    });

    res.json({
      success: true,
      data: {
        suggestions: result.suggestions,
        completeness: result.completeness,
        inconsistencies: result.inconsistencies,
      },
    });
  })
);

export default router;
