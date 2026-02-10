import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type ReceivablePaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'CANCELLED';

export interface AccountsReceivable {
  id: string;
  tenant_id: string;
  transaction_id: string;
  client_name: string;
  client_tax_id: string | null;
  client_contact_email: string | null;
  client_contact_phone: string | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  invoice_due_date: Date;
  original_amount_cents: number;
  received_amount_cents: number;
  remaining_amount_cents: number;
  payment_status: ReceivablePaymentStatus;
  last_payment_date: Date | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateAccountsReceivableInput {
  tenant_id: string;
  transaction_id: string;
  client_name: string;
  client_tax_id?: string;
  client_contact_email?: string;
  client_contact_phone?: string;
  invoice_number?: string;
  invoice_date?: string;
  invoice_due_date: string;
  original_amount_cents: number;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: Record<string, unknown>): AccountsReceivable {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    transaction_id: row.transaction_id as string,
    client_name: row.client_name as string,
    client_tax_id: (row.client_tax_id as string) ?? null,
    client_contact_email: (row.client_contact_email as string) ?? null,
    client_contact_phone: (row.client_contact_phone as string) ?? null,
    invoice_number: (row.invoice_number as string) ?? null,
    invoice_date: row.invoice_date ? new Date(row.invoice_date as string) : null,
    invoice_due_date: new Date(row.invoice_due_date as string),
    original_amount_cents: Number(row.original_amount_cents),
    received_amount_cents: Number(row.received_amount_cents),
    remaining_amount_cents: Number(row.remaining_amount_cents),
    payment_status: row.payment_status as ReceivablePaymentStatus,
    last_payment_date: row.last_payment_date ? new Date(row.last_payment_date as string) : null,
    notes: (row.notes as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Accounts Receivable Model
 * Tracks what is owed to us
 */
export class AccountsReceivableModel {
  /**
   * Find receivable by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<AccountsReceivable | null> {
    requireTenantId(tenantId, 'AccountsReceivableModel.findById');
    
    const result: QueryResult<AccountsReceivable> = await db.query<AccountsReceivable>(
      `SELECT * FROM accounts_receivable 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List receivables with filters
   */
  static async list(
    tenantId: string,
    filters?: {
      payment_status?: ReceivablePaymentStatus;
      client_name?: string;
      overdue_only?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ receivables: AccountsReceivable[]; total: number }> {
    requireTenantId(tenantId, 'AccountsReceivableModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.payment_status) {
      conditions.push(`payment_status = $${paramCount++}`);
      values.push(filters.payment_status);
    }
    if (filters?.client_name) {
      conditions.push(`client_name ILIKE $${paramCount++}`);
      values.push(`%${filters.client_name}%`);
    }
    if (filters?.overdue_only) {
      conditions.push(`invoice_due_date < CURRENT_DATE`);
      conditions.push(`payment_status != 'PAID'`);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM accounts_receivable WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<AccountsReceivable> = await db.query<AccountsReceivable>(
      `SELECT * FROM accounts_receivable 
       WHERE ${whereClause}
       ORDER BY invoice_due_date ASC, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      receivables: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new receivable
   */
  static async create(input: CreateAccountsReceivableInput): Promise<AccountsReceivable> {
    requireTenantId(input.tenant_id, 'AccountsReceivableModel.create');
    
    const result: QueryResult<AccountsReceivable> = await db.query<AccountsReceivable>(
      `INSERT INTO accounts_receivable 
       (tenant_id, transaction_id, client_name, client_tax_id, client_contact_email,
        client_contact_phone, invoice_number, invoice_date, invoice_due_date,
        original_amount_cents, notes, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        input.tenant_id,
        input.transaction_id,
        input.client_name,
        input.client_tax_id || null,
        input.client_contact_email || null,
        input.client_contact_phone || null,
        input.invoice_number || null,
        input.invoice_date || null,
        input.invoice_due_date,
        input.original_amount_cents,
        input.notes || null,
        input.tags || [],
        JSON.stringify(input.metadata || {}),
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Record payment received
   */
  static async recordPayment(
    id: string,
    tenantId: string,
    paymentAmountCents: number,
    paymentDate: string
  ): Promise<AccountsReceivable> {
    requireTenantId(tenantId, 'AccountsReceivableModel.recordPayment');
    
    const result: QueryResult<AccountsReceivable> = await db.query<AccountsReceivable>(
      `UPDATE accounts_receivable 
       SET received_amount_cents = received_amount_cents + $1,
           last_payment_date = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL
       RETURNING *`,
      [paymentAmountCents, paymentDate, id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Accounts receivable');
    }

    return mapRow(result.rows[0]);
  }
}
