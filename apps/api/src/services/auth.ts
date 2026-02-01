import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { UserModel, User } from '../models/user';
import { AuthenticationError, InternalServerError } from '../utils/errors';
import { logger } from '../utils/logger';
import { db } from '../models/database';

/**
 * JWT payload interface (Fonte 5 - Motor Payton)
 * tid/uid/role required for TenantMiddleware isolation.
 */
export interface JWTPayload {
  userId: string;
  email: string;
  /** Tenant ID (isolation key) - required for SaaS */
  tid?: string;
  /** User ID alias (same as userId) */
  uid?: string;
  /** Role: OWNER | REVISOR | OPERATIONAL */
  role?: 'OWNER' | 'REVISOR' | 'OPERATIONAL';
  iat?: number;
  exp?: number;
}

/**
 * Authentication service
 * Handles JWT generation, verification, and password operations
 */
export class AuthService {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate access token (JWT) with tid, uid, role (Fonte 5 - TenantMiddleware)
   */
  static generateAccessToken(
    user: User,
    opts?: { tenantId: string; role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' }
  ): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tid: opts?.tenantId,
      uid: user.id,
      role: opts?.role ?? 'OPERATIONAL',
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: 'platform-api',
      audience: 'platform-client',
    });
  }

  /**
   * Generate refresh token
   */
  static async generateRefreshToken(userId: string, userAgent?: string, ipAddress?: string): Promise<string> {
    const token = jwt.sign(
      { userId, type: 'refresh' },
      config.jwt.secret,
      {
        expiresIn: config.jwt.refreshExpiresIn,
        issuer: 'platform-api',
        audience: 'platform-client',
      }
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, token, expiresAt, userAgent || null, ipAddress || null]
    );

    return token;
  }

  /**
   * Verify and decode JWT token
   */
  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'platform-api',
        audience: 'platform-client',
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      throw new AuthenticationError('Token verification failed');
    }
  }

  /**
   * Verify refresh token
   */
  static async verifyRefreshToken(token: string): Promise<string> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'platform-api',
        audience: 'platform-client',
      }) as { userId: string; type: string };

      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type');
      }

      // Check if token exists and is not revoked
      const result = await db.query(
        `SELECT user_id FROM refresh_tokens
         WHERE token = $1 
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
        [token]
      );

      if (result.rowCount === 0) {
        throw new AuthenticationError('Refresh token not found or expired');
      }

      return decoded.userId;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(token: string, revokedBy?: string): Promise<void> {
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
       WHERE token = $1 AND revoked_at IS NULL`,
      [token, revokedBy || null]
    );
  }

  /**
   * Authenticate user with email and password
   * Uses findByEmailForAuth (cross-tenant lookup) because tenant is unknown at login
   * Returns user with tenant_id populated for JWT generation
   */
  static async authenticate(email: string, password: string): Promise<User> {
    // Use findByEmailForAuth - cross-tenant lookup for authentication only
    const user = await UserModel.findByEmailForAuth(email);

    if (!user) {
      logger.warn('Authentication attempt with non-existent email', { email });
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.is_active) {
      logger.warn('Authentication attempt with inactive account', { email, userId: user.id });
      throw new AuthenticationError('Account is inactive');
    }

    const isValidPassword = await this.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('Authentication attempt with invalid password', { email, userId: user.id });
      throw new AuthenticationError('Invalid credentials');
    }

    // Update last login (use user's tenant_id from DB)
    await UserModel.updateLastLogin(user.id, user.tenant_id);

    logger.info('User authenticated successfully', { 
      userId: user.id, 
      email: user.email,
      tenantId: user.tenant_id 
    });

    return user;
  }

  /**
   * Register new user in a specific tenant
   * @param tenantId - Tenant ID (required)
   */
  static async register(
    tenantId: string,
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<User> {
    if (!tenantId) {
      throw new AuthenticationError('Tenant ID is required for registration');
    }

    // Check if user already exists in this tenant
    const existingUser = await UserModel.findByEmail(email, tenantId);
    if (existingUser) {
      throw new AuthenticationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user in the specified tenant
    const user = await UserModel.create({
      tenant_id: tenantId,
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
    });

    logger.info('User registered successfully', { 
      userId: user.id, 
      email: user.email,
      tenantId: user.tenant_id 
    });

    return user;
  }
}


