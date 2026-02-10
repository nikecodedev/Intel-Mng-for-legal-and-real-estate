import { Router, Request, Response } from 'express';
import {
  authenticate,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireResourcePermission,
  requireDynamicPermission,
  asyncHandler,
} from '../middleware/index.js';
import { RBACService } from '../services/rbac.js';
import { getTenantContext } from '../utils/tenant-context.js';

const router = Router();

/**
 * Example routes demonstrating RBAC usage
 * These routes show different ways to enforce permissions
 */

// ============================================
// Example 1: Simple permission check
// ============================================

/**
 * GET /examples/users
 * Requires 'users:read' permission
 */
router.get(
  '/users',
  authenticate,
  requirePermission('users:read'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Access granted to users list',
      user: req.user?.email,
    });
  })
);

/**
 * POST /examples/users
 * Requires 'users:create' permission
 */
router.post(
  '/users',
  authenticate,
  requirePermission('users:create'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'User creation endpoint',
      user: req.user?.email,
    });
  })
);

// ============================================
// Example 2: Resource-based permission
// ============================================

/**
 * GET /examples/documents
 * Requires 'documents:read' permission
 */
router.get(
  '/documents',
  authenticate,
  requireResourcePermission('documents', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Access granted to documents',
      user: req.user?.email,
    });
  })
);

/**
 * POST /examples/documents
 * Requires 'documents:create' permission
 */
router.post(
  '/documents',
  authenticate,
  requireResourcePermission('documents', 'create'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Document creation endpoint',
      user: req.user?.email,
    });
  })
);

// ============================================
// Example 3: Multiple permissions (ANY)
// ============================================

/**
 * GET /examples/reports
 * Requires either 'reports:read' OR 'reports:generate' permission
 */
router.get(
  '/reports',
  authenticate,
  requireAnyPermission('reports:read', 'reports:generate'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Access granted to reports',
      user: req.user?.email,
    });
  })
);

// ============================================
// Example 4: Multiple permissions (ALL)
// ============================================

/**
 * POST /examples/reports/export
 * Requires BOTH 'reports:read' AND 'reports:export' permissions
 */
router.post(
  '/reports/export',
  authenticate,
  requireAllPermissions('reports:read', 'reports:export'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Report export endpoint',
      user: req.user?.email,
    });
  })
);

// ============================================
// Example 5: Dynamic permission checking
// ============================================

/**
 * GET /examples/permissions/check
 * Check if user has specific permission (programmatic check)
 */
router.get(
  '/permissions/check',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { permission } = req.query;
    const { tenantId, userId } = getTenantContext(req);

    if (!permission || typeof permission !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Permission parameter is required',
        },
      });
    }

    // Pass tenantId to RBACService for tenant-scoped permission check
    const hasPermission = await RBACService.hasPermission(
      userId,
      tenantId,
      permission
    );

    const userPermissions = await RBACService.getUserPermissions(userId, tenantId);

    res.json({
      success: true,
      data: {
        permission,
        hasPermission,
        userPermissions,
        tenant_id: tenantId,
      },
    });
  })
);

// ============================================
// Example 6: Dynamic permission based on route
// ============================================

/**
 * GET /examples/dynamic/:resource/:action
 * Dynamic permission check based on route parameters
 */
router.get(
  '/dynamic/:resource/:action',
  authenticate,
  requireDynamicPermission((req) => `${req.params.resource}:${req.params.action}`),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: `Access granted for ${req.params.resource}:${req.params.action}`,
      user: req.user?.email,
    });
  })
);

// ============================================
// Example 7: Conditional permission in handler
// ============================================

/**
 * DELETE /examples/users/:id
 * Requires 'users:delete' permission
 * Shows how to check permissions programmatically in handler
 */
router.delete(
  '/users/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: currentUserId } = getTenantContext(req);

    // Programmatic permission check (with tenantId)
    await RBACService.requirePermission(currentUserId, tenantId, 'users:delete');

    // Additional business logic
    const targetUserId = req.params.id;

    // Check if user is trying to delete themselves
    if (targetUserId === currentUserId) {
      // Might require additional permission
      await RBACService.requirePermission(currentUserId, tenantId, 'users:delete-self');
    }

    res.json({
      success: true,
      message: `User ${targetUserId} deleted`,
      user: req.user?.email,
      tenant_id: tenantId,
    });
  })
);

export default router;


