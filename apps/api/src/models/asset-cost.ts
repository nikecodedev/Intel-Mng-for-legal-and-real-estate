import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type CostType = 'acquisition' | 'regularization' | 'renovation' | 'maintenance' | 'taxes' | 'legal' | 'other';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';

export interface AssetCost {
  id: string;
  tenant_id: string;
  real_estate_asset_id: string;
  cost_type: CostType;
  cost_category: string | null;
  description: string;
  amount_cents: number;
  currency: string;
  cost_date: Date;
  invoice_number: string | null;
  vendor_name: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  payment_status: PaymentStatus;
  payment_date: Date | null;
  linked_document_id: string | null;
  linked_financial_record_id: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateAssetCostInput {
  tenant_id: string;
  real_estate_asset_id: string;
  cost_type: CostType;
  cost_category?: string;
  description: string;
  amount_cents: number;
  currency?: string;
  cost_date: string; // ISO date
  invoice_number?: string;
  vendor_name?: string;
  linked_document_id?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAssetCostInput {
  cost_type?: CostType;
  cost_category?: string;
  description?: string;
  amount_cents?: number;
  currency?: string;
  cost_date?: string;
  invoice_number?: string;
  vendor_name?: string;
  payment_status?: PaymentStatus;
  payment_date?: string;
  approved_by?: string;
  linked_document_id?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): AssetCost {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    real_estate_asset_id: row.real_estate_asset_id as string,
    cost_type: row.cost_type as CostType,
    cost_category: (row.cost_category as string) ?? null,
    description: row.description as string,
    amount_cents: Number(row.amount_cents),
    currency: (row.currency as string) || 'BRL',
    cost_date: new Date(row.cost_date as string),
    invoice_number: (row.invoice_number as string) ?? null,
    vendor_name: (row.vendor_name as string) ?? null,
    approved_by: (row.approved_by as string) ?? null,
    approved_at: row.approved_at ? new Date(row.approved_at as string) : null,
    payment_status: row.payment_status as PaymentStatus,
    payment_date: row.payment_date ? new Date(row.payment_date as string) : null,
    linked_document_id: (row.linked_document_id as string) ?? null,
    linked_financial_record_id: (row.linked_financial_record_id as string) ?? null,
    notes: (row.notes as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    created_by: (row.created_by as string) ?? null,
    updated_at: new Date(row.updated_at as string),
    updated_by: (row.updated_by as string) ?? null,
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Asset Cost Model
 * Tracks all costs associated with real estate assets
 */
export class AssetCostModel {
  /**
   * Find cost by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<AssetCost | null> {
    requireTenantId(tenantId, 'AssetCostModel.findById');
    
    const result: QueryResult<AssetCost> = await db.query<AssetCost>(
      `SELECT * FROM asset_costs 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List costs for an asset
   */
  static async listByAsset(
    assetId: string,
    tenantId: string,
    filters?: {
      cost_type?: CostType;
      payment_status?: PaymentStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ costs: AssetCost[]; total: number }> {
    requireTenantId(tenantId, 'AssetCostModel.listByAsset');
    
    const conditions: string[] = ['real_estate_asset_id = $1', 'tenant_id = $2', 'deleted_at IS NULL'];
    const values: unknown[] = [assetId, tenantId];
    let paramCount = 3;

    if (filters?.cost_type) {
      conditions.push(`cost_type = $${paramCount++}`);
      values.push(filters.cost_type);
    }
    if (filters?.payment_status) {
      conditions.push(`payment_status = $${paramCount++}`);
      values.push(filters.payment_status);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM asset_costs WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<AssetCost> = await db.query<AssetCost>(
      `SELECT * FROM asset_costs 
       WHERE ${whereClause}
       ORDER BY cost_date DESC, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      costs: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new cost
   */
  static async create(input: CreateAssetCostInput, userId: string): Promise<AssetCost> {
    requireTenantId(input.tenant_id, 'AssetCostModel.create');
    
    const result: QueryResult<AssetCost> = await db.query<AssetCost>(
      `INSERT INTO asset_costs 
       (tenant_id, real_estate_asset_id, cost_type, cost_category, description, 
        amount_cents, currency, cost_date, invoice_number, vendor_name,
        linked_document_id, notes, tags, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.tenant_id,
        input.real_estate_asset_id,
        input.cost_type,
        input.cost_category || null,
        input.description,
        input.amount_cents,
        input.currency || 'BRL',
        input.cost_date,
        input.invoice_number || null,
        input.vendor_name || null,
        input.linked_document_id || null,
        input.notes || null,
        input.tags || [],
        JSON.stringify(input.metadata || {}),
        userId,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update cost
   */
  static async update(
    id: string,
    tenantId: string,
    userId: string,
    input: UpdateAssetCostInput
  ): Promise<AssetCost> {
    requireTenantId(tenantId, 'AssetCostModel.update');
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.cost_type !== undefined) {
      updates.push(`cost_type = $${paramCount++}`);
      values.push(input.cost_type);
    }
    if (input.cost_category !== undefined) {
      updates.push(`cost_category = $${paramCount++}`);
      values.push(input.cost_category);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(input.description);
    }
    if (input.amount_cents !== undefined) {
      updates.push(`amount_cents = $${paramCount++}`);
      values.push(input.amount_cents);
    }
    if (input.currency !== undefined) {
      updates.push(`currency = $${paramCount++}`);
      values.push(input.currency);
    }
    if (input.cost_date !== undefined) {
      updates.push(`cost_date = $${paramCount++}`);
      values.push(input.cost_date);
    }
    if (input.invoice_number !== undefined) {
      updates.push(`invoice_number = $${paramCount++}`);
      values.push(input.invoice_number);
    }
    if (input.vendor_name !== undefined) {
      updates.push(`vendor_name = $${paramCount++}`);
      values.push(input.vendor_name);
    }
    if (input.payment_status !== undefined) {
      updates.push(`payment_status = $${paramCount++}`);
      values.push(input.payment_status);
    }
    if (input.payment_date !== undefined) {
      updates.push(`payment_date = $${paramCount++}`);
      values.push(input.payment_date || null);
    }
    if (input.approved_by !== undefined) {
      updates.push(`approved_by = $${paramCount++}`);
      updates.push(`approved_at = CASE WHEN $${paramCount - 1} IS NOT NULL THEN CURRENT_TIMESTAMP ELSE approved_at END`);
      values.push(input.approved_by);
    }
    if (input.linked_document_id !== undefined) {
      updates.push(`linked_document_id = $${paramCount++}`);
      values.push(input.linked_document_id);
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(input.notes);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramCount++}`);
      values.push(input.tags);
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundError('Asset cost');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`updated_by = $${paramCount++}`);
    values.push(userId, id, tenantId);

    const result: QueryResult<AssetCost> = await db.query<AssetCost>(
      `UPDATE asset_costs 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount - 2} AND tenant_id = $${paramCount - 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Asset cost');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Calculate total costs for an asset
   */
  static async calculateTotalCosts(
    assetId: string,
    tenantId: string,
    filters?: {
      cost_type?: CostType;
      payment_status?: PaymentStatus;
      include_pending?: boolean;
    }
  ): Promise<{
    total_cents: number;
    by_type: Record<CostType, number>;
    by_payment_status: Record<PaymentStatus, number>;
  }> {
    requireTenantId(tenantId, 'AssetCostModel.calculateTotalCosts');
    
    const conditions: string[] = ['real_estate_asset_id = $1', 'tenant_id = $2', 'deleted_at IS NULL'];
    const values: unknown[] = [assetId, tenantId];
    let paramCount = 3;

    if (filters?.cost_type) {
      conditions.push(`cost_type = $${paramCount++}`);
      values.push(filters.cost_type);
    }
    if (filters?.payment_status) {
      conditions.push(`payment_status = $${paramCount++}`);
      values.push(filters.payment_status);
    } else if (filters?.include_pending === false) {
      conditions.push(`payment_status != 'PENDING'`);
    }

    const whereClause = conditions.join(' AND ');

    // Get totals
    const result = await db.query<{
      total_cents: string;
      cost_type: CostType;
      payment_status: PaymentStatus;
      type_total: string;
      status_total: string;
    }>(
      `SELECT 
         SUM(amount_cents) as total_cents,
         cost_type,
         payment_status,
         SUM(amount_cents) FILTER (WHERE cost_type = cost_type) as type_total,
         SUM(amount_cents) FILTER (WHERE payment_status = payment_status) as status_total
       FROM asset_costs
       WHERE ${whereClause}
       GROUP BY cost_type, payment_status`,
      values
    );

    let total_cents = 0;
    const by_type: Record<CostType, number> = {
      acquisition: 0,
      regularization: 0,
      renovation: 0,
      maintenance: 0,
      taxes: 0,
      legal: 0,
      other: 0,
    };
    const by_payment_status: Record<PaymentStatus, number> = {
      PENDING: 0,
      PAID: 0,
      PARTIAL: 0,
      CANCELLED: 0,
    };

    for (const row of result.rows) {
      const amount = parseInt(row.total_cents, 10) || 0;
      total_cents += amount;
      by_type[row.cost_type] = (by_type[row.cost_type] || 0) + amount;
      by_payment_status[row.payment_status] = (by_payment_status[row.payment_status] || 0) + amount;
    }

    return {
      total_cents,
      by_type,
      by_payment_status,
    };
  }
}
