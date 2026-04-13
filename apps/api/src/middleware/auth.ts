import { Request, Response, NextFunction } from 'express';
import { AuthService, JWTPayload } from '../services/auth.js';
import { UserModel } from '../models/user.js';
import { AuthenticationError } from '../utils/errors.js';
import { asyncHandler } from './validator.js';
import { db } from '../models/database.js';

/**
 * Extend Express Request to include user
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        user: Awaited<ReturnType<typeof UserModel.findById>>;
      };
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload: JWTPayload = AuthService.verifyToken(token);

    // Get user from database (auth method doesn't require tenantId)
    const user = await UserModel.findByIdForAuth(payload.userId);

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (!user.is_active) {
      throw new AuthenticationError('User account is inactive');
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      user,
    };

    // Spec Divergence #1: MFA server-side enforcement for OWNER/ADMIN roles
    // Graceful: only enforces if mfa_enabled column exists (migration 036)
    try {
      const mfaResult = await db.query(
        `SELECT mfa_enabled, mfa_verified_at FROM users WHERE id = $1 LIMIT 1`,
        [user.id]
      );
      const mfaRow = mfaResult.rows[0] as { mfa_enabled?: boolean; mfa_verified_at?: string | null } | undefined;

      if (mfaRow?.mfa_enabled === true) {
        // Check if role is OWNER or ADMIN — these require active MFA session
        const roleResult = await db.query(
          `SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1 LIMIT 1`,
          [user.id]
        );
        const roleName = (roleResult.rows[0] as { name?: string } | undefined)?.name;
        const mfaRequiredRoles = ['OWNER', 'ADMIN'];

        if (roleName && mfaRequiredRoles.includes(roleName)) {
          const verifiedAt = mfaRow.mfa_verified_at ? new Date(mfaRow.mfa_verified_at) : null;
          const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

          if (!verifiedAt || verifiedAt < eightHoursAgo) {
            res.status(403).json({
              error: 'MFA_REQUIRED',
              message: 'Autenticação MFA obrigatória para este perfil.',
            });
            return;
          }
        }
      }
    } catch {
      // Silently ignore — mfa columns may not exist yet (migration 036 not applied)
    }

    next();
  }
);

/**
 * Optional authentication middleware
 * Attaches user if token is present, but doesn't require it
 */
export const optionalAuth = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload: JWTPayload = AuthService.verifyToken(token);
        const user = await UserModel.findByIdForAuth(payload.userId);

        if (user && user.is_active) {
          req.user = {
            id: user.id,
            email: user.email,
            user,
          };
        }
      } catch (error) {
        // Ignore authentication errors for optional auth
      }
    }

    next();
  }
);


