import { Router, Request, Response } from 'express';
import { asyncHandler, validateRequest, authenticate } from '../middleware/index.js';
import { AuthService, User } from '../services/auth.js';
import { AuditService, AuditEventType } from '../services/audit.js';
import { config } from '../config/index.js';
import { db } from '../models/database.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { AppError, AuthenticationError } from '../utils/errors.js';

const router = Router();

/** System Tenant ID (Fonte 5) - used when no tenant context exists (e.g. failed login audit) */
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
 * Success and failure are both written to the audit log (mandatory for compliance).
 */
router.post(
  '/login',
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
      // Authenticate user - returns user with tenant_id from DB
      const user = await AuthService.authenticate(email, password);

      // Generate tokens using user's tenant_id from DB (not from headers/request)
      const accessToken = AuthService.generateAccessToken(user, tenantOptsFromUser(user));
      let refreshToken: string | null = null;
      if (user.tenant_id) {
        try {
          refreshToken = await AuthService.generateRefreshToken(
            user.id,
            user.tenant_id,
            req.get('user-agent'),
            req.ip
          );
        } catch (refreshErr) {
          logger.warn('Refresh token creation failed (login continues with access token only)', {
            userId: user.id,
            error: refreshErr,
          });
        }
      }

      // Audit: successful login (mandatory for compliance)
      await AuditService.logAuthEvent(
        user.tenant_id,
        AuditEventType.USER_LOGIN,
        user.id,
        user.email,
        req,
        true
      ).catch((err) => logger.warn('Audit log login success failed', { error: err }));

      logger.info('User logged in', {
        userId: user.id,
        email: user.email,
        tenantId: user.tenant_id,
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
    } catch (err) {
      // Audit: failed login (mandatory for compliance; use system tenant)
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      await AuditService.logAuthEvent(
        SYSTEM_TENANT_ID,
        AuditEventType.USER_LOGIN,
        undefined,
        email,
        req,
        false,
        errorMessage
      ).catch((auditErr) => logger.warn('Audit log login failure failed', { error: auditErr }));

      if (err instanceof AuthenticationError) throw err;
      throw err;
    }
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

    // Ensure tenant exists (avoid 500 on FK violation). Supports tenants.id (002) or tenants.tenant_id (saas).
    let tenantCheck: { rows: unknown[] };
    try {
      tenantCheck = await db.query('SELECT 1 FROM tenants WHERE id = $1', [effectiveTenantId]);
      if (!tenantCheck.rows.length) {
        tenantCheck = await db.query('SELECT 1 FROM tenants WHERE tenant_id = $1', [effectiveTenantId]);
      }
    } catch {
      tenantCheck = { rows: [] };
    }
    if (!tenantCheck.rows.length) {
      throw new AppError(
        400,
        'Tenant not found. Run database migrations: cd /var/gems && bash scripts/run-migrations.sh',
        true,
        'TENANT_NOT_FOUND'
      );
    }

    let user: User;
    try {
      user = await AuthService.register(
        effectiveTenantId,
        email,
        password,
        first_name,
        last_name
      );
    } catch (err) {
      if (err instanceof AuthenticationError || err instanceof AppError) {
        throw err;
      }
      const pgCode = (err as { code?: string })?.code;
      const pgMsg = (err as { message?: string })?.message ?? '';
      if (pgCode === '23503') {
        throw new AppError(
          400,
          'Tenant not found. Run database migrations: bash scripts/run-migrations.sh',
          true,
          'TENANT_NOT_FOUND'
        );
      }
      if (pgCode === '23505') {
        throw new AppError(409, 'User with this email already exists.', true, 'EMAIL_EXISTS');
      }
      if (pgCode === '23502') {
        throw new AppError(
          500,
          'Database schema outdated. Run migrations: bash scripts/run-migrations.sh',
          true,
          'SCHEMA_ERROR'
        );
      }
      if (pgCode === '42703') {
        throw new AppError(
          500,
          'Database schema outdated. Run migrations: bash scripts/run-migrations.sh',
          true,
          'SCHEMA_ERROR'
        );
      }
      logger.error('Register failed', { error: err, email, pgCode, pgMsg });
      throw new AppError(
        500,
        'Registration failed. Run migrations and try again: bash scripts/run-migrations.sh',
        true,
        'REGISTER_FAILED'
      );
    }

    // Generate tokens using user's tenant_id
    const accessToken = AuthService.generateAccessToken(user, tenantOptsFromUser(user));
    let refreshToken: string | null = null;
    if (user.tenant_id) {
      try {
        refreshToken = await AuthService.generateRefreshToken(
          user.id,
          user.tenant_id,
          req.get('user-agent'),
          req.ip
        );
      } catch (refreshErr) {
        logger.warn('Refresh token creation failed (register continues with access token only)', {
          userId: user.id,
          error: refreshErr,
        });
      }
    }

    // Audit: user registration (mandatory for compliance)
    await AuditService.logAuthEvent(
      user.tenant_id,
      AuditEventType.USER_REGISTER,
      user.id,
      user.email,
      req,
      true
    ).catch((err) => logger.warn('Audit log register failed', { error: err }));

    logger.info('User registered', {
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id,
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
    const tenantId = req.context?.tenant_id;
    const userId = req.user?.id;
    const userEmail = req.user?.email ?? '';

    // Revoke refresh token
    await AuthService.revokeRefreshToken(refresh_token, userId);

    // Audit: logout (mandatory for compliance)
    if (tenantId) {
      await AuditService.logAuthEvent(
        tenantId,
        AuditEventType.USER_LOGOUT,
        userId,
        userEmail,
        req,
        true
      ).catch((err) => logger.warn('Audit log logout failed', { error: err }));
    }

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


