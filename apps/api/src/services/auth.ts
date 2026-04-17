import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { UserModel, User } from '../models/user.js';
export type { User };
import { AuthenticationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { db } from '../models/database.js';
import { redisClient } from './redis.js';

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
  /** JWT ID — used for access token blacklisting on logout */
  jti?: string;
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
    opts?: { tenantId: string; role?: string },
    expiresInOverride?: string
  ): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tid: opts?.tenantId,
      uid: user.id,
      role: (opts?.role ?? 'OPERATIONAL') as JWTPayload['role'],
      jti: randomUUID(),
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: (expiresInOverride || config.jwt.expiresIn) as string | number,
      issuer: 'platform-api',
      audience: 'platform-client',
    } as jwt.SignOptions);
  }

  /**
   * Blacklist an access token's jti in Redis so it cannot be reused after logout.
   * TTL is set to the token's remaining lifetime so Redis auto-cleans it.
   */
  static async blacklistAccessToken(token: string): Promise<void> {
    if (!redisClient.isAvailable()) return; // graceful degradation when Redis is off

    let payload: JWTPayload | null = null;
    try {
      payload = jwt.decode(token) as JWTPayload | null;
    } catch {
      return;
    }
    if (!payload?.jti || !payload?.exp) return;

    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return; // already expired — nothing to blacklist

    try {
      const client = redisClient.getClient();
      await client.set(`blacklist:jti:${payload.jti}`, '1', 'EX', ttl);
    } catch (err) {
      logger.warn('Failed to blacklist access token jti', { jti: payload.jti, error: err });
    }
  }

  /**
   * Check if a jti has been blacklisted (returns true = token is revoked).
   */
  static async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    if (!redisClient.isAvailable()) return false; // can't check — allow (graceful degradation)
    try {
      const client = redisClient.getClient();
      const result = await client.get(`blacklist:jti:${jti}`);
      return result !== null;
    } catch {
      return false;
    }
  }

  /**
   * Generate refresh token (tenant_id required when migration 002 is applied)
   */
  static async generateRefreshToken(
    userId: string,
    tenantId: string,
    userAgent?: string,
    ipAddress?: string,
    expirationDays: number = 7
  ): Promise<string> {
    const token = jwt.sign(
      { userId, type: 'refresh' },
      config.jwt.secret,
      {
        expiresIn: `${expirationDays}d`,
        issuer: 'platform-api',
        audience: 'platform-client',
      } as jwt.SignOptions
    );

    // Store refresh token in database (tenant_id for tenant isolation - migration 002)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    try {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, tenant_id, token, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, tenantId, token, expiresAt, userAgent || null, ipAddress || null]
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // 42703 = undefined_column (tenant_id missing, e.g. migration 002 not applied)
      if (code === '42703') {
        await db.query(
          `INSERT INTO refresh_tokens (user_id, token, expires_at, user_agent, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, token, expiresAt, userAgent || null, ipAddress || null]
        );
      } else {
        throw err;
      }
    }

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

    // Require tenant_id so JWT and refresh token work correctly (DB must have migrations applied)
    if (!user.tenant_id) {
      logger.warn('User missing tenant_id (run migrations)', { email, userId: user.id });
      throw new AuthenticationError(
        'Account configuration error. Please sign up again or contact support.'
      );
    }

    // Update last login (non-fatal: missing column still allows login)
    if (user.tenant_id) {
      try {
        await UserModel.updateLastLogin(user.id, user.tenant_id);
      } catch (err) {
        logger.warn('updateLastLogin failed (login continues)', { userId: user.id, error: err });
      }
    }

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

    // Auto-assign OWNER role (non-fatal: if role not seeded yet, skip)
    try {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id, tenant_id)
         SELECT $1, r.id, $2 FROM roles r WHERE r.name = 'OWNER'
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [user.id, tenantId]
      );
    } catch (err) {
      logger.warn('Auto-assign OWNER role failed (non-fatal)', { userId: user.id, error: err });
    }

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id
    });

    return user;
  }
}


