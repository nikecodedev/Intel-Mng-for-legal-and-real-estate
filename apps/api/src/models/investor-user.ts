import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * Investor user interface
 * Separate from regular users - read-only access only
 */
export interface InvestorUser {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  last_activity_at: Date | null;
  accepted_terms_version: string | null;
  accepted_terms_at: Date | null;
  privacy_policy_version: string | null;
  privacy_policy_accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateInvestorUserInput {
  tenant_id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

export interface UpdateInvestorUserInput {
  first_name?: string;
  last_name?: string;
  company_name?: string;
  is_active?: boolean;
  is_email_verified?: boolean;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): InvestorUser {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    email: row.email as string,
    password_hash: row.password_hash as string,
    first_name: (row.first_name as string) ?? null,
    last_name: (row.last_name as string) ?? null,
    company_name: (row.company_name as string) ?? null,
    is_active: Boolean(row.is_active),
    is_email_verified: Boolean(row.is_email_verified),
    failed_login_attempts: Number(row.failed_login_attempts) || 0,
    locked_until: row.locked_until ? new Date(row.locked_until as string) : null,
    last_login_at: row.last_login_at ? new Date(row.last_login_at as string) : null,
    last_activity_at: row.last_activity_at ? new Date(row.last_activity_at as string) : null,
    accepted_terms_version: (row.accepted_terms_version as string) ?? null,
    accepted_terms_at: row.accepted_terms_at ? new Date(row.accepted_terms_at as string) : null,
    privacy_policy_version: (row.privacy_policy_version as string) ?? null,
    privacy_policy_accepted_at: row.privacy_policy_accepted_at ? new Date(row.privacy_policy_accepted_at as string) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

/**
 * Investor User Model
 * Tenant-scoped investor user management
 */
export class InvestorUserModel {
  /**
   * Find investor by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<InvestorUser | null> {
    requireTenantId(tenantId, 'InvestorUserModel.findById');
    
    const result: QueryResult<InvestorUser> = await db.query<InvestorUser>(
      `SELECT * FROM investor_users 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List investors by tenant (for admin/CRM)
   */
  static async listByTenant(
    tenantId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<InvestorUser[]> {
    requireTenantId(tenantId, 'InvestorUserModel.listByTenant');
    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;
    const result: QueryResult<InvestorUser> = await db.query<InvestorUser>(
      `SELECT * FROM investor_users
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
    return result.rows.map(mapRow);
  }

  /**
   * Find investor by email within tenant
   */
  static async findByEmail(email: string, tenantId: string): Promise<InvestorUser | null> {
    requireTenantId(tenantId, 'InvestorUserModel.findByEmail');
    
    const result: QueryResult<InvestorUser> = await db.query<InvestorUser>(
      `SELECT * FROM investor_users 
       WHERE email = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [email, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find investor by email across ALL tenants (for authentication only)
   * WARNING: Use only during login before tenant context is established
   */
  static async findByEmailForAuth(email: string): Promise<InvestorUser | null> {
    const result: QueryResult<InvestorUser> = await db.query<InvestorUser>(
      `SELECT * FROM investor_users 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Create new investor user
   */
  static async create(input: CreateInvestorUserInput): Promise<InvestorUser> {
    requireTenantId(input.tenant_id, 'InvestorUserModel.create');
    
    const result: QueryResult<InvestorUser> = await db.query<InvestorUser>(
      `INSERT INTO investor_users 
       (tenant_id, email, password_hash, first_name, last_name, company_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.tenant_id,
        input.email,
        input.password_hash,
        input.first_name || null,
        input.last_name || null,
        input.company_name || null,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update investor user
   */
  static async update(id: string, tenantId: string, input: UpdateInvestorUserInput): Promise<InvestorUser> {
    requireTenantId(tenantId, 'InvestorUserModel.update');
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(input.first_name);
    }
    if (input.last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(input.last_name);
    }
    if (input.company_name !== undefined) {
      updates.push(`company_name = $${paramCount++}`);
      values.push(input.company_name);
    }
    if (input.is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(input.is_active);
    }
    if (input.is_email_verified !== undefined) {
      updates.push(`is_email_verified = $${paramCount++}`);
      values.push(input.is_email_verified);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new Error('Investor user not found');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result: QueryResult<InvestorUser> = await db.query<InvestorUser>(
      `UPDATE investor_users 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND tenant_id = $${paramCount++} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Investor user not found');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(id: string, tenantId: string): Promise<void> {
    requireTenantId(tenantId, 'InvestorUserModel.updateLastLogin');
    
    await db.query(
      `UPDATE investor_users 
       SET last_login_at = CURRENT_TIMESTAMP,
           last_activity_at = CURRENT_TIMESTAMP,
           failed_login_attempts = 0,
           locked_until = NULL
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
  }

  /**
   * Update last activity timestamp
   */
  static async updateLastActivity(id: string, tenantId: string): Promise<void> {
    requireTenantId(tenantId, 'InvestorUserModel.updateLastActivity');
    
    await db.query(
      `UPDATE investor_users 
       SET last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
  }

  /**
   * Increment failed login attempts
   */
  static async incrementFailedLoginAttempts(id: string, tenantId: string): Promise<void> {
    requireTenantId(tenantId, 'InvestorUserModel.incrementFailedLoginAttempts');
    
    await db.query(
      `UPDATE investor_users 
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE 
             WHEN failed_login_attempts + 1 >= 5 
             THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
             ELSE locked_until
           END
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
  }
}
