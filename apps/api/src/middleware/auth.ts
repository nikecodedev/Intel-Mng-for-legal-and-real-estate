import { Request, Response, NextFunction } from 'express';
import { AuthService, JWTPayload } from '../services/auth.js';
import { UserModel } from '../models/user.js';
import { AuthenticationError } from '../utils/errors.js';
import { asyncHandler } from './validator.js';

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


