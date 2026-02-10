import { Router, Request, Response } from 'express';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { z } from 'zod';
import { audit } from '../middleware/audit.js';
import { setAuditContext, clearAuditContext, AuditableUserModel } from '../models/audit-hooks.js';
import { UserModel } from '../models/user.js';
import { NotFoundError } from '../utils/errors.js';
import { getTenantContext } from '../utils/tenant-context.js';

const router = Router();

/**
 * Example controller showing audit logging integration
 * Demonstrates both automatic and manual audit logging
 */

// ============================================
// Schema definitions
// ============================================

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
});

const updateUserSchema = z.object({
  body: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    is_active: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

// ============================================
// CREATE - Automatic audit via hooks
// ============================================

/**
 * POST /users
 * Create user with automatic audit logging using hooks
 */
router.post(
  '/',
  authenticate,
  requirePermission('users:create'),
  validateRequest(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, first_name, last_name } = req.body;
    const { tenantId, userId } = getTenantContext(req);

    // Fetch user role (using tenant context)
    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(userId, tenantId);
    const userRole = roles[0]?.name;

    // Set audit context for automatic logging
    setAuditContext({
      userId: userId,
      userEmail: req.user!.email,
      userRole,
      request: req,
    });

    try {
      // Import auth service for password hashing
      const { AuthService } = await import('../services/auth');
      const passwordHash = await AuthService.hashPassword(password);

      // Create user with automatic audit logging (include tenant_id)
      const user = await AuditableUserModel.createWithAudit(
        {
          tenant_id: tenantId,
          email,
          password_hash: passwordHash,
          first_name,
          last_name,
        },
        {
          userId: userId,
          userEmail: req.user!.email,
          userRole,
          request: req,
        }
      );

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          tenant_id: user.tenant_id,
        },
      });
    } finally {
      clearAuditContext();
    }
  })
);

// ============================================
// READ - Manual audit logging
// ============================================

/**
 * GET /users/:id
 * Get user with manual audit logging
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('users:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { tenantId } = getTenantContext(req);

    // Find user within tenant scope
    const user = await UserModel.findById(id, tenantId);

    if (!user) {
      throw new NotFoundError('User');
    }

    // Manual audit logging for read operation
    await audit.logRead(req, 'user', id, {
      accessed_fields: ['id', 'email', 'first_name', 'last_name'],
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active,
        created_at: user.created_at,
        tenant_id: user.tenant_id,
      },
    });
  })
);

// ============================================
// UPDATE - Automatic audit via hooks
// ============================================

/**
 * PUT /users/:id
 * Update user with automatic audit logging using hooks
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('users:update'),
  validateRequest(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    const { tenantId, userId } = getTenantContext(req);

    // Fetch user role (using tenant context)
    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(userId, tenantId);
    const userRole = roles[0]?.name;

    // Set audit context
    setAuditContext({
      userId: userId,
      userEmail: req.user!.email,
      userRole,
      request: req,
    });

    try {
      // Update user with automatic audit logging (tenant-scoped)
      await AuditableUserModel.updateWithAudit(id, tenantId, updates, {
        userId: userId,
        userEmail: req.user!.email,
        userRole,
        request: req,
      });

      // Get updated user (tenant-scoped)
      const user = await UserModel.findById(id, tenantId);

      if (!user) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          is_active: user.is_active,
          tenant_id: user.tenant_id,
        },
      });
    } finally {
      clearAuditContext();
    }
  })
);

// ============================================
// DELETE - Automatic audit via hooks
// ============================================

/**
 * DELETE /users/:id
 * Delete user with automatic audit logging using hooks
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('users:delete'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { tenantId, userId } = getTenantContext(req);

    // Fetch user role (using tenant context)
    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(userId, tenantId);
    const userRole = roles[0]?.name;

    // Set audit context
    setAuditContext({
      userId: userId,
      userEmail: req.user!.email,
      userRole,
      request: req,
    });

    try {
      // Delete user with automatic audit logging (tenant-scoped)
      await AuditableUserModel.deleteWithAudit(id, tenantId, {
        userId: userId,
        userEmail: req.user!.email,
        userRole,
        request: req,
      });

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } finally {
      clearAuditContext();
    }
  })
);

// ============================================
// LIST - Manual audit logging
// ============================================

/**
 * GET /users
 * List users with manual audit logging
 */
router.get(
  '/',
  authenticate,
  requirePermission('users:list'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);

    // Manual audit logging for list operation
    await audit.logRead(req, 'user', null, {
      operation: 'list',
      filters: req.query,
    });

    // Fetch users within tenant scope
    const users = await UserModel.findAllByTenant(tenantId);
    
    res.json({
      success: true,
      data: {
        users: users.map(u => ({
          id: u.id,
          email: u.email,
          first_name: u.first_name,
          last_name: u.last_name,
          is_active: u.is_active,
          created_at: u.created_at,
        })),
        total: users.length,
        tenant_id: tenantId,
      },
    });
  })
);

export default router;

