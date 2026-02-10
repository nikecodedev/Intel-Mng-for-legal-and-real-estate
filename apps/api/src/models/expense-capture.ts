import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError, ValidationError } from '../utils/errors.js';

export type ExpenseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CANCELLED';
export type CapturedVia = 'MOBILE' | 'WEB' | 'API';

export interface ExpenseCapture {
  id: string;
  tenant_id: string;
  expense_date: Date;
  amount_cents: number;
  currency: string;
  category: string | null;
  description: string;
  process_id: string | null;
  real_estate_asset_id: string | null;
  client_id: string | null;
  captured_via: CapturedVia;
  captured_location: Record<string, unknown> | null;
  captured_at: Date;
  captured_by: string | null;
  receipt_document_id: string | null;
  receipt_ocr_data: Record<string, unknown> | null;
  status: ExpenseStatus;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  transaction_id: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateExpenseCaptureInput {
  tenant_id: string;
  expense_date: string; // ISO date
  amount_cents: number;
  currency?: string;
  category?: string;
  description: string;
  // MANDATORY: At least one link required
  process_id?: string;
  real_estate_asset_id?: string;
  client_id?: string;
  captured_via?: CapturedVia;
  captured_location?: { lat?: number; lng?: number; address?: string };
  receipt_document_id?: string;
  receipt_ocr_data?: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function validateExpenseLinks(input: {
  process_id?: string;
  real_estate_asset_id?: string;
  client_id?: string;
}): void {
  const linkCount = [
    input.process_id,
    input.real_estate_asset_id,
    input.client_id,
  ].filter(Boolean).length;

  if (linkCount === 0) {
    throw new ValidationError(
      'Expense must be linked to at least one of: process_id (case), real_estate_asset_id, or client_id'
    );
  }
}

function mapRow(row: Record<string, unknown>): ExpenseCapture {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    expense_date: new Date(row.expense_date as string),
    amount_cents: Number(row.amount_cents),
    currency: (row.currency as string) || 'BRL',
    category: (row.category as string) ?? null,
    description: row.description as string,
    process_id: (row.process_id as string) ?? null,
    real_estate_asset_id: (row.real_estate_asset_id as string) ?? null,
    client_id: (row.client_id as string) ?? null,
    captured_via: (row.captured_via as CapturedVia) || 'WEB',
    captured_location: row.captured_location 
      ? (row.captured_location as Record<string, unknown>) 
      : null,
    captured_at: new Date(row.captured_at as string),
    captured_by: (row.captured_by as string) ?? null,
    receipt_document_id: (row.receipt_document_id as string) ?? null,
    receipt_ocr_data: row.receipt_ocr_data 
      ? (row.receipt_ocr_data as Record<string, unknown>) 
      : null,
    status: row.status as ExpenseStatus,
    submitted_at: row.submitted_at ? new Date(row.submitted_at as string) : null,
    approved_by: (row.approved_by as string) ?? null,
    approved_at: row.approved_at ? new Date(row.approved_at as string) : null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    transaction_id: (row.transaction_id as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Expense Capture Model
 * Mobile-friendly expense tracking with mandatory links
 */
export class ExpenseCaptureModel {
  /**
   * Find expense by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<ExpenseCapture | null> {
    requireTenantId(tenantId, 'ExpenseCaptureModel.findById');
    
    const result: QueryResult<ExpenseCapture> = await db.query<ExpenseCapture>(
      `SELECT * FROM expense_capture 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List expenses with filters
   */
  static async list(
    tenantId: string,
    filters?: {
      status?: ExpenseStatus;
      category?: string;
      process_id?: string;
      real_estate_asset_id?: string;
      client_id?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ expenses: ExpenseCapture[]; total: number }> {
    requireTenantId(tenantId, 'ExpenseCaptureModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(filters.status);
    }
    if (filters?.category) {
      conditions.push(`category = $${paramCount++}`);
      values.push(filters.category);
    }
    if (filters?.process_id) {
      conditions.push(`process_id = $${paramCount++}`);
      values.push(filters.process_id);
    }
    if (filters?.real_estate_asset_id) {
      conditions.push(`real_estate_asset_id = $${paramCount++}`);
      values.push(filters.real_estate_asset_id);
    }
    if (filters?.client_id) {
      conditions.push(`client_id = $${paramCount++}`);
      values.push(filters.client_id);
    }
    if (filters?.start_date) {
      conditions.push(`expense_date >= $${paramCount++}`);
      values.push(filters.start_date);
    }
    if (filters?.end_date) {
      conditions.push(`expense_date <= $${paramCount++}`);
      values.push(filters.end_date);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM expense_capture WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<ExpenseCapture> = await db.query<ExpenseCapture>(
      `SELECT * FROM expense_capture 
       WHERE ${whereClause}
       ORDER BY expense_date DESC, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      expenses: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new expense (mobile-friendly)
   */
  static async create(input: CreateExpenseCaptureInput, userId: string): Promise<ExpenseCapture> {
    requireTenantId(input.tenant_id, 'ExpenseCaptureModel.create');
    
    // Validate: No orphan expenses
    validateExpenseLinks(input);

    const result: QueryResult<ExpenseCapture> = await db.query<ExpenseCapture>(
      `INSERT INTO expense_capture 
       (tenant_id, expense_date, amount_cents, currency, category, description,
        process_id, real_estate_asset_id, client_id, captured_via, captured_location,
        captured_by, receipt_document_id, receipt_ocr_data, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        input.tenant_id,
        input.expense_date,
        input.amount_cents,
        input.currency || 'BRL',
        input.category || null,
        input.description,
        input.process_id || null,
        input.real_estate_asset_id || null,
        input.client_id || null,
        input.captured_via || 'WEB',
        input.captured_location ? JSON.stringify(input.captured_location) : null,
        userId,
        input.receipt_document_id || null,
        input.receipt_ocr_data ? JSON.stringify(input.receipt_ocr_data) : null,
        input.tags || [],
        JSON.stringify(input.metadata || {}),
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Submit expense for approval
   */
  static async submit(id: string, tenantId: string): Promise<ExpenseCapture> {
    requireTenantId(tenantId, 'ExpenseCaptureModel.submit');
    
    const result: QueryResult<ExpenseCapture> = await db.query<ExpenseCapture>(
      `UPDATE expense_capture 
       SET status = 'SUBMITTED',
           submitted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Expense capture');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Approve expense
   */
  static async approve(id: string, tenantId: string, userId: string): Promise<ExpenseCapture> {
    requireTenantId(tenantId, 'ExpenseCaptureModel.approve');
    
    const result: QueryResult<ExpenseCapture> = await db.query<ExpenseCapture>(
      `UPDATE expense_capture 
       SET status = 'APPROVED',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [userId, id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Expense capture');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Reject expense
   */
  static async reject(
    id: string,
    tenantId: string,
    userId: string,
    reason: string
  ): Promise<ExpenseCapture> {
    requireTenantId(tenantId, 'ExpenseCaptureModel.reject');
    
    const result: QueryResult<ExpenseCapture> = await db.query<ExpenseCapture>(
      `UPDATE expense_capture 
       SET status = 'REJECTED',
           rejection_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [reason, id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Expense capture');
    }

    return mapRow(result.rows[0]);
  }
}
