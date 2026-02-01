import { Router, Request, Response } from 'express';
import { asyncHandler, validateRequest, authenticate } from '../middleware';
import { AuthService, User } from '../services/auth';
import { config } from '../config';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

/** System Tenant ID (Fonte 5) - used when no tenant context exists */
const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Generate token options from user's tenant_id
 * For login/register, user.tenant_id comes from DB
 */
function tenantOptsFromUser(user: User): { tenantId: string; role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' } {
  return { 
    tenantId: user.tenant_id, 
    role: 'OPERATIONAL' 
  };
}

/**
 * Login schema
 */
const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

/**
 * Register schema
 * Note: tenant_id is required for SaaS isolation (Fonte 75)
 */
const registerSchema = z.object({
  body: z.object({
    tenant_id: z.string().uuid('Invalid tenant ID').optional(), // Optional - falls back to system tenant
    email: z.string().email('Invalid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
});

/**
 * Refresh token schema
 */
const refreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'Refresh token is required'),
  }),
});

/**
 * POST /auth/login
 * Authenticate user and return JWT tokens
 * 
 * NOTE: This route is EXEMPT from TenantMiddleware (login path).
 * tenant_id is extracted from the authenticated user's DB record.
 */
router.post(
  '/login',
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Authenticate user - returns user with tenant_id from DB
    const user = await AuthService.authenticate(email, password);

    // Generate tokens using user's tenant_id from DB (not from headers/request)
    const accessToken = AuthService.generateAccessToken(user, tenantOptsFromUser(user));
    const refreshToken = await AuthService.generateRefreshToken(
      user.id,
      req.get('user-agent'),
      req.ip
    );

    logger.info('User logged in', { 
      userId: user.id, 
      email: user.email,
      tenantId: user.tenant_id 
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          tenant_id: user.tenant_id,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      },
    });
  })
);

/**
 * POST /auth/register
 * Register new user in a tenant
 * 
 * NOTE: This route is EXEMPT from TenantMiddleware (registration path).
 * tenant_id must be provided in request body or falls back to SYSTEM_TENANT_ID.
 * 
 * SaaS Isolation (Fonte 75): Users are always created within a tenant context.
 */
router.post(
  '/register',
  validateRequest(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenant_id, email, password, first_name, last_name } = req.body;

    // Determine tenant - explicit or system default
    const effectiveTenantId = tenant_id || config.tenant.defaultTenantId || SYSTEM_TENANT_ID;

    // Register user in the specified tenant
    const user = await AuthService.register(
      effectiveTenantId,
      email, 
      password, 
      first_name, 
      last_name
    );

    // Generate tokens using user's tenant_id
    const accessToken = AuthService.generateAccessToken(user, tenantOptsFromUser(user));
    const refreshToken = await AuthService.generateRefreshToken(
      user.id,
      req.get('user-agent'),
      req.ip
    );

    logger.info('User registered', { 
      userId: user.id, 
      email: user.email,
      tenantId: user.tenant_id 
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          tenant_id: user.tenant_id,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      },
    });
  })
);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 * 
 * NOTE: This route is EXEMPT from TenantMiddleware (refresh path).
 * tenant_id is extracted from the user's DB record (validated via refresh token).
 */
router.post(
  '/refresh',
  validateRequest(refreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    // Verify refresh token - returns userId
    const userId = await AuthService.verifyRefreshToken(refresh_token);

    // Get user with their tenant_id
    const { UserModel } = await import('../models/user');
    
    // Use findByIdForAuth (cross-tenant) because we don't have tenant context yet
    // The refresh token already validates ownership
    const user = await UserModel.findByIdForAuth(userId);

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    // Generate new access token using user's tenant_id from DB
    const accessToken = AuthService.generateAccessToken(user, tenantOptsFromUser(user));

    logger.info('Token refreshed', { 
      userId: user.id,
      tenantId: user.tenant_id 
    });

    res.json({
      success: true,
      data: {
        access_token: accessToken,
      },
    });
  })
);

/**
 * POST /auth/logout
 * Revoke refresh token (requires authentication)
 */
router.post(
  '/logout',
  authenticate,
  validateRequest(refreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    // Revoke refresh token
    await AuthService.revokeRefreshToken(refresh_token, req.user?.id);

    logger.info('User logged out', { userId: req.user?.id });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

/**
 * GET /auth/me
 * Get current authenticated user
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user?.user;

    if (!user) {
      throw new Error('User not found');
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          is_email_verified: user.is_email_verified,
        },
      },
    });
  })
);

export default router;


