import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { InvestorUserModel, InvestorUser } from '../models/investor-user.js';
import { AuthenticationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { db } from '../models/database.js';

/**
 * Investor JWT payload interface
 * Separate from regular user tokens
 */
export interface InvestorJWTPayload {
  investorId: string;
  email: string;
  /** Tenant ID (isolation key) - required for SaaS */
  tid?: string;
  /** Investor ID alias (same as investorId) */
  uid?: string;
  /** Role: always INVESTOR for investor portal */
  role?: 'INVESTOR';
  iat?: number;
  exp?: number;
}

/**
 * Investor Authentication Service
 * Separate authentication flow for read-only investor access
 */
export class InvestorAuthService {
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
   * Generate access token (JWT) for investor
   */
  static generateAccessToken(investor: InvestorUser): string {
    const payload: InvestorJWTPayload = {
      investorId: investor.id,
      email: investor.email,
      tid: investor.tenant_id,
      uid: investor.id,
      role: 'INVESTOR',
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string | number,
      issuer: 'platform-api',
      audience: 'platform-investor',
    } as jwt.SignOptions);
  }

  /**
   * Generate refresh token for investor
   */
  static async generateRefreshToken(
    investorId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<string> {
    const token = jwt.sign(
      { investorId, type: 'refresh' },
      config.jwt.secret,
      {
        expiresIn: config.jwt.refreshExpiresIn as string | number,
        issuer: 'platform-api',
        audience: 'platform-investor',
      } as jwt.SignOptions
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.query(
      `INSERT INTO investor_refresh_tokens (investor_user_id, token, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [investorId, token, expiresAt, userAgent || null, ipAddress || null]
    );

    return token;
  }

  /**
   * Verify and decode investor JWT token
   */
  static verifyToken(token: string): InvestorJWTPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'platform-api',
        audience: 'platform-investor',
      }) as InvestorJWTPayload;

      if (!decoded.investorId || !decoded.email) {
        throw new AuthenticationError('Invalid token payload');
      }

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
  static async verifyRefreshToken(token: string): Promise<InvestorJWTPayload> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'platform-api',
        audience: 'platform-investor',
      }) as { investorId: string; type: string };

      if (decoded.type !== 'refresh' || !decoded.investorId) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Check if token is revoked
      const result = await db.query(
        `SELECT investor_user_id, expires_at FROM investor_refresh_tokens 
         WHERE token = $1 AND revoked_at IS NULL`,
        [token]
      );

      if (result.rows.length === 0) {
        throw new AuthenticationError('Refresh token not found or revoked');
      }

      const tokenData = result.rows[0] as { expires_at: string };
      const expiresAt = new Date(tokenData.expires_at);

      if (expiresAt < new Date()) {
        throw new AuthenticationError('Refresh token expired');
      }

      // Get investor to return full payload
      const investor = await InvestorUserModel.findByIdForAuth(decoded.investorId);
      if (!investor || !investor.is_active) {
        throw new AuthenticationError('Investor not found or inactive');
      }

      return {
        investorId: investor.id,
        email: investor.email,
        tid: investor.tenant_id,
        uid: investor.id,
        role: 'INVESTOR',
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Refresh token verification failed');
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(token: string): Promise<void> {
    await db.query(
      `UPDATE investor_refresh_tokens 
       SET revoked_at = CURRENT_TIMESTAMP 
       WHERE token = $1 AND revoked_at IS NULL`,
      [token]
    );
  }

  /**
   * Authenticate investor (login)
   */
  static async login(
    email: string,
    password: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{
    investor: InvestorUser;
    accessToken: string;
    refreshToken: string;
  }> {
    // Find investor by email (across all tenants for login)
    const investor = await InvestorUserModel.findByEmailForAuth(email);

    if (!investor) {
      logger.warn('Investor login attempt with invalid email', { email });
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if account is locked
    if (investor.locked_until && new Date(investor.locked_until) > new Date()) {
      logger.warn('Investor login attempt on locked account', { email, investorId: investor.id });
      throw new AuthenticationError('Account is temporarily locked. Please try again later.');
    }

    // Check if account is active
    if (!investor.is_active) {
      logger.warn('Investor login attempt on inactive account', { email, investorId: investor.id });
      throw new AuthenticationError('Account is inactive');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, investor.password_hash);

    if (!isValidPassword) {
      // Increment failed login attempts
      await InvestorUserModel.incrementFailedLoginAttempts(investor.id, investor.tenant_id);
      logger.warn('Investor login attempt with invalid password', { email, investorId: investor.id });
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login
    await InvestorUserModel.updateLastLogin(investor.id, investor.tenant_id);

    // Generate tokens
    const accessToken = this.generateAccessToken(investor);
    const refreshToken = await this.generateRefreshToken(investor.id, userAgent, ipAddress);

    logger.info('Investor logged in successfully', {
      investorId: investor.id,
      email: investor.email,
      tenantId: investor.tenant_id,
    });

    return {
      investor,
      accessToken,
      refreshToken,
    };
  }
}
