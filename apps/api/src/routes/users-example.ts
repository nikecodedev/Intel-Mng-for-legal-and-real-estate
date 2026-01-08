import { Router, Request, Response } from 'express';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware';
import { z } from 'zod';
import { audit } from '../middleware/audit';
import { setAuditContext, clearAuditContext, AuditableUserModel } from '../models/audit-hooks';
import { UserModel } from '../models/user';
import { NotFoundError } from '../utils/errors';

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

      // Fetch user role
      const { RoleModel } = await import('../models/role');
      const roles = await RoleModel.findByUserId(req.user!.id);
      const userRole = roles[0]?.name;

      // Set audit context for automatic logging
      setAuditContext({
        userId: req.user!.id,
        userEmail: req.user!.email,
        userRole,
        request: req,
      });

    try {
      // Import auth service for password hashing
      const { AuthService } = await import('../services/auth');
      const passwordHash = await AuthService.hashPassword(password);

      // Create user with automatic audit logging
      const user = await AuditableUserModel.createWithAudit(
        {
          email,
          password_hash: passwordHash,
          first_name,
          last_name,
        },
        {
          userId: req.user!.id,
          userEmail: req.user!.email,
          userRole: req.user!.user?.roles?.[0]?.name,
          request: req,
        }
      );

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
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

    const user = await UserModel.findById(id);

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

      // Fetch user role
      const { RoleModel } = await import('../models/role');
      const roles = await RoleModel.findByUserId(req.user!.id);
      const userRole = roles[0]?.name;

      // Set audit context
      setAuditContext({
        userId: req.user!.id,
        userEmail: req.user!.email,
        userRole,
        request: req,
      });

    try {
      // Update user with automatic audit logging
      await AuditableUserModel.updateWithAudit(id, updates, {
        userId: req.user!.id,
        userEmail: req.user!.email,
        userRole,
        request: req,
      });

      // Get updated user
      const user = await UserModel.findById(id);

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

      // Fetch user role
      const { RoleModel } = await import('../models/role');
      const roles = await RoleModel.findByUserId(req.user!.id);
      const userRole = roles[0]?.name;

      // Set audit context
      setAuditContext({
        userId: req.user!.id,
        userEmail: req.user!.email,
        userRole,
        request: req,
      });

    try {
      // Fetch user role
      const { RoleModel: RoleModelDelete } = await import('../models/role');
      const rolesDelete = await RoleModelDelete.findByUserId(req.user!.id);
      const userRoleDelete = rolesDelete[0]?.name;

      // Delete user with automatic audit logging
      await AuditableUserModel.deleteWithAudit(id, {
        userId: req.user!.id,
        userEmail: req.user!.email,
        userRole: userRoleDelete,
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
    // Manual audit logging for list operation
    await audit.logRead(req, 'user', null, {
      operation: 'list',
      filters: req.query,
    });

    // In a real implementation, you would fetch users from database
    // For this example, we'll return a mock response
    res.json({
      success: true,
      data: {
        users: [],
        total: 0,
      },
    });
  })
);

export default router;

