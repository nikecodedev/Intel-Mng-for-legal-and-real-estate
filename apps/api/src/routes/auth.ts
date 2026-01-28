import { Router, Request, Response } from 'express';
import { asyncHandler, validateRequest, authenticate } from '../middleware';
import { AuthService } from '../services/auth';
import { config } from '../config';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

/** Tenant + role for JWT (Fonte 5). Uses DEFAULT_TENANT_ID when user has no tenant association. */
function tenantOptsForToken():
  | { tenantId: string; role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' }
  | undefined {
  const tid = config.tenant.defaultTenantId;
  if (!tid) return undefined;
  return { tenantId: tid, role: 'OPERATIONAL' };
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
 */
const registerSchema = z.object({
  body: z.object({
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
 */
router.post(
  '/login',
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Authenticate user
    const user = await AuthService.authenticate(email, password);

    // Generate tokens (tid, role for TenantMiddleware - Fonte 5)
    const accessToken = AuthService.generateAccessToken(user, tenantOptsForToken());
    const refreshToken = await AuthService.generateRefreshToken(
      user.id,
      req.get('user-agent'),
      req.ip
    );

    logger.info('User logged in', { userId: user.id, email: user.email });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
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
 * Register new user
 */
router.post(
  '/register',
  validateRequest(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, first_name, last_name } = req.body;

    // Register user
    const user = await AuthService.register(email, password, first_name, last_name);

    // Generate tokens (tid, role for TenantMiddleware - Fonte 5)
    const accessToken = AuthService.generateAccessToken(user, tenantOptsForToken());
    const refreshToken = await AuthService.generateRefreshToken(
      user.id,
      req.get('user-agent'),
      req.ip
    );

    logger.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
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
 */
router.post(
  '/refresh',
  validateRequest(refreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    // Verify refresh token
    const userId = await AuthService.verifyRefreshToken(refresh_token);

    // Get user
    const { UserModel } = await import('../models/user');
    const user = await UserModel.findById(userId);

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    // Generate new access token (tid, role for TenantMiddleware - Fonte 5)
    const accessToken = AuthService.generateAccessToken(user, tenantOptsForToken());

    logger.info('Token refreshed', { userId: user.id });

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


