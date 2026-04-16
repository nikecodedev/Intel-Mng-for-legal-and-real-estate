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

    // Spec §2.2 / §1.3 — MFA hard enforcement for OWNER/ADMIN roles
    // Ref: Constituição Art. 2, migration 036_mfa_totp.sql
    const roleResult = await db.query<{ name: string }>(
      `SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1 LIMIT 1`,
      [user.id]
    );
    const roleName = roleResult.rows[0]?.name ?? '';
    const mfaRequiredRoles = ['OWNER', 'ADMIN'];

    if (mfaRequiredRoles.includes(roleName)) {
      try {
        const mfaResult = await db.query<{ mfa_enabled: boolean; mfa_verified_at: string | null }>(
          `SELECT mfa_enabled, mfa_verified_at FROM users WHERE id = $1 LIMIT 1`,
          [user.id]
        );
        const mfaRow = mfaResult.rows[0];

        if (!mfaRow || !mfaRow.mfa_enabled) {
          // MFA not configured — block OWNER/ADMIN until MFA is set up
          res.status(403).json({
            error: 'MFA_SETUP_REQUIRED',
            message: 'Perfil OWNER/ADMIN exige configuração de MFA (§2.2). Acesse /auth/mfa/setup.',
          });
          return;
        }

        const verifiedAt = mfaRow.mfa_verified_at ? new Date(mfaRow.mfa_verified_at) : null;
        const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

        if (!verifiedAt || verifiedAt < eightHoursAgo) {
          res.status(403).json({
            error: 'MFA_REQUIRED',
            message: 'Sessão MFA expirada ou ausente. Reautentique com TOTP (§2.2).',
          });
          return;
        }
      } catch (mfaErr: unknown) {
        // Only skip if column truly doesn't exist (migration not applied) — re-throw other errors
        const msg = mfaErr instanceof Error ? mfaErr.message : String(mfaErr);
        if (!msg.includes('column') && !msg.includes('does not exist')) {
          throw mfaErr;
        }
        // Migration 036 not yet applied — log and continue (dev/staging fallback only)
        console.warn('[auth] MFA columns missing — migration 036 not applied. MFA enforcement skipped.');
      }
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


