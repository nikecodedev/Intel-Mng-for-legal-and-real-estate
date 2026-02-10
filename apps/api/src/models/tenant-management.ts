import { db } from './database';
import { QueryResult } from 'pg';
import { NotFoundError } from '../utils/errors';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'TRIAL';
export type SubscriptionPlan = 'FREE' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE' | 'CUSTOM';
export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  config_hard_gates: Record<string, unknown>;
  tenant_code: string | null;
  domain: string | null;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  subscription_start_date: Date | null;
  subscription_end_date: Date | null;
  trial_end_date: Date | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_email: string | null;
  metadata: Record<string, unknown>;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  suspended_at: Date | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  reactivated_at: Date | null;
  reactivated_by: string | null;
}

export interface CreateTenantInput {
  name: string;
  tenant_code?: string;
  domain?: string;
  subscription_plan?: SubscriptionPlan;
  contact_email?: string;
  contact_phone?: string;
  billing_email?: string;
  metadata?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateTenantInput {
  name?: string;
  status?: TenantStatus;
  subscription_plan?: SubscriptionPlan;
  subscription_status?: SubscriptionStatus;
  subscription_start_date?: string;
  subscription_end_date?: string;
  trial_end_date?: string;
  contact_email?: string;
  contact_phone?: string;
  billing_email?: string;
  metadata?: Record<string, unknown>;
  notes?: string;
}

function mapRow(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    name: row.name as string,
    status: (row.status as TenantStatus) || 'ACTIVE',
    config_hard_gates: (row.config_hard_gates as Record<string, unknown>) || {},
    tenant_code: (row.tenant_code as string) ?? null,
    domain: (row.domain as string) ?? null,
    subscription_plan: (row.subscription_plan as SubscriptionPlan) || 'STANDARD',
    subscription_status: (row.subscription_status as SubscriptionStatus) || 'ACTIVE',
    subscription_start_date: row.subscription_start_date ? new Date(row.subscription_start_date as string) : null,
    subscription_end_date: row.subscription_end_date ? new Date(row.subscription_end_date as string) : null,
    trial_end_date: row.trial_end_date ? new Date(row.trial_end_date as string) : null,
    contact_email: (row.contact_email as string) ?? null,
    contact_phone: (row.contact_phone as string) ?? null,
    billing_email: (row.billing_email as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    notes: (row.notes as string) ?? null,
    created_at: new Date(row.created_at as string),
    updated_at: row.updated_at ? new Date(row.updated_at as string) : new Date(row.created_at as string),
    suspended_at: row.suspended_at ? new Date(row.suspended_at as string) : null,
    suspended_by: (row.suspended_by as string) ?? null,
    suspension_reason: (row.suspension_reason as string) ?? null,
    reactivated_at: row.reactivated_at ? new Date(row.reactivated_at as string) : null,
    reactivated_by: (row.reactivated_by as string) ?? null,
  };
}

/**
 * Tenant Management Model
 * Manages tenant provisioning and lifecycle
 */
export class TenantManagementModel {
  /**
   * Find tenant by ID
   */
  static async findById(id: string): Promise<Tenant | null> {
    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `SELECT * FROM tenants WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find tenant by code
   */
  static async findByCode(tenantCode: string): Promise<Tenant | null> {
    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `SELECT * FROM tenants WHERE tenant_code = $1`,
      [tenantCode]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List all tenants
   */
  static async list(filters?: {
    status?: TenantStatus;
    subscription_plan?: SubscriptionPlan;
    subscription_status?: SubscriptionStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ tenants: Tenant[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(filters.status);
    }
    if (filters?.subscription_plan) {
      conditions.push(`subscription_plan = $${paramCount++}`);
      values.push(filters.subscription_plan);
    }
    if (filters?.subscription_status) {
      conditions.push(`subscription_status = $${paramCount++}`);
      values.push(filters.subscription_status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenants ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `SELECT * FROM tenants 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      tenants: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new tenant (provisioning)
   */
  static async create(input: CreateTenantInput): Promise<Tenant> {
    // Generate tenant code if not provided
    const tenantCode = input.tenant_code || this.generateTenantCode(input.name);

    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `INSERT INTO tenants 
       (name, tenant_code, domain, subscription_plan, subscription_status,
        subscription_start_date, contact_email, contact_phone, billing_email,
        metadata, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.name,
        tenantCode,
        input.domain || null,
        input.subscription_plan || 'STANDARD',
        input.subscription_status || 'ACTIVE',
        input.subscription_start_date || new Date().toISOString().split('T')[0],
        input.contact_email || null,
        input.contact_phone || null,
        input.billing_email || null,
        JSON.stringify(input.metadata || {}),
        input.notes || null,
        'ACTIVE',
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update tenant
   */
  static async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(input.name);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.subscription_plan !== undefined) {
      updates.push(`subscription_plan = $${paramCount++}`);
      values.push(input.subscription_plan);
    }
    if (input.subscription_status !== undefined) {
      updates.push(`subscription_status = $${paramCount++}`);
      values.push(input.subscription_status);
    }
    if (input.subscription_start_date !== undefined) {
      updates.push(`subscription_start_date = $${paramCount++}`);
      values.push(input.subscription_start_date || null);
    }
    if (input.subscription_end_date !== undefined) {
      updates.push(`subscription_end_date = $${paramCount++}`);
      values.push(input.subscription_end_date || null);
    }
    if (input.trial_end_date !== undefined) {
      updates.push(`trial_end_date = $${paramCount++}`);
      values.push(input.trial_end_date || null);
    }
    if (input.contact_email !== undefined) {
      updates.push(`contact_email = $${paramCount++}`);
      values.push(input.contact_email);
    }
    if (input.contact_phone !== undefined) {
      updates.push(`contact_phone = $${paramCount++}`);
      values.push(input.contact_phone);
    }
    if (input.billing_email !== undefined) {
      updates.push(`billing_email = $${paramCount++}`);
      values.push(input.billing_email);
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(input.notes);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Tenant');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `UPDATE tenants 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Tenant');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Suspend tenant
   */
  static async suspend(id: string, userId: string, reason: string): Promise<Tenant> {
    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `UPDATE tenants 
       SET status = 'SUSPENDED',
           subscription_status = 'SUSPENDED',
           suspended_at = CURRENT_TIMESTAMP,
           suspended_by = $1,
           suspension_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [userId, reason, id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Tenant');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Reactivate tenant
   */
  static async reactivate(id: string, userId: string): Promise<Tenant> {
    const result: QueryResult<Tenant> = await db.query<Tenant>(
      `UPDATE tenants 
       SET status = 'ACTIVE',
           subscription_status = 'ACTIVE',
           reactivated_at = CURRENT_TIMESTAMP,
           reactivated_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Tenant');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Generate unique tenant code from name
   */
  private static generateTenantCode(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    
    // Add random suffix to ensure uniqueness
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }
}
