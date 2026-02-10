import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * User model types
 * All users belong to exactly one tenant (tenant isolation)
 */
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateUserInput {
  tenant_id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
}

export interface UpdateUserInput {
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  is_email_verified?: boolean;
}

/**
 * Validate tenant ID is provided
 * @throws TenantRequiredError if tenantId is missing
 */
function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

/**
 * User model - Database operations with tenant isolation
 * 
 * IMPORTANT: All methods require explicit tenantId parameter.
 * No global queries allowed - all data is tenant-scoped.
 */
export class UserModel {
  /**
   * Find user by ID within a specific tenant
   * @param id - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findById(id: string, tenantId: string): Promise<User | null> {
    requireTenantId(tenantId, 'UserModel.findById');
    
    const result: QueryResult<User> = await db.query<User>(
      `SELECT * FROM users 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email within a specific tenant
   * @param email - User email
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findByEmail(email: string, tenantId: string): Promise<User | null> {
    requireTenantId(tenantId, 'UserModel.findByEmail');
    
    const result: QueryResult<User> = await db.query<User>(
      `SELECT * FROM users 
       WHERE email = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [email, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email across ALL tenants (for authentication only)
   * WARNING: Use only during login before tenant context is established
   * @param email - User email
   * @returns User with tenant_id populated
   */
  static async findByEmailForAuth(email: string): Promise<User | null> {
    const result: QueryResult<User> = await db.query<User>(
      `SELECT * FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by ID across ALL tenants (for token refresh only)
   * WARNING: Use only during token refresh before tenant context is established
   * The refresh token already validates ownership of the session.
   * @param id - User ID
   * @returns User with tenant_id populated
   */
  static async findByIdForAuth(id: string): Promise<User | null> {
    const result: QueryResult<User> = await db.query<User>(
      `SELECT * FROM users 
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * List all users within a specific tenant
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findAllByTenant(tenantId: string): Promise<User[]> {
    requireTenantId(tenantId, 'UserModel.findAllByTenant');
    
    const result: QueryResult<User> = await db.query<User>(
      `SELECT * FROM users 
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY email`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Create new user within a specific tenant
   * @param input - User creation data (must include tenant_id)
   * @throws TenantRequiredError if tenant_id is missing
   */
  static async create(input: CreateUserInput): Promise<User> {
    requireTenantId(input.tenant_id, 'UserModel.create');
    
    const result: QueryResult<User> = await db.query<User>(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.tenant_id, input.email, input.password_hash, input.first_name || null, input.last_name || null]
    );
    return result.rows[0];
  }

  /**
   * Update user within a specific tenant
   * @param id - User ID
   * @param tenantId - Tenant ID (required)
   * @param input - Fields to update
   * @throws TenantRequiredError if tenantId is missing
   */
  static async update(id: string, tenantId: string, input: UpdateUserInput): Promise<User | null> {
    requireTenantId(tenantId, 'UserModel.update');
    
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.first_name !== undefined) {
      fields.push(`first_name = $${paramIndex++}`);
      values.push(input.first_name);
    }
    if (input.last_name !== undefined) {
      fields.push(`last_name = $${paramIndex++}`);
      values.push(input.last_name);
    }
    if (input.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(input.is_active);
    }
    if (input.is_email_verified !== undefined) {
      fields.push(`is_email_verified = $${paramIndex++}`);
      values.push(input.is_email_verified);
    }

    if (fields.length === 0) {
      return this.findById(id, tenantId);
    }

    values.push(id);
    values.push(tenantId);
    const result: QueryResult<User> = await db.query<User>(
      `UPDATE users 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Update last login timestamp
   * @param id - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async updateLastLogin(id: string, tenantId: string): Promise<void> {
    requireTenantId(tenantId, 'UserModel.updateLastLogin');
    
    await db.query(
      `UPDATE users 
       SET last_login_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  /**
   * Soft delete user within a specific tenant
   * @param id - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'UserModel.delete');
    
    const result = await db.query(
      `UPDATE users 
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Count users in a specific tenant
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async countByTenant(tenantId: string): Promise<number> {
    requireTenantId(tenantId, 'UserModel.countByTenant');
    
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users 
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    return parseInt(result.rows[0].count, 10);
  }
}
