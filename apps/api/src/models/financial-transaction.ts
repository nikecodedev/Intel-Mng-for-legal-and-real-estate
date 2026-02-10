import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError, ValidationError } from '../utils/errors.js';

export type TransactionType = 'PAYABLE' | 'RECEIVABLE' | 'EXPENSE' | 'INCOME' | 'TRANSFER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'OVERDUE';

export interface FinancialTransaction {
  id: string;
  tenant_id: string;
  transaction_number: string;
  transaction_type: TransactionType;
  transaction_category: string | null;
  amount_cents: number;
  currency: string;
  exchange_rate: number;
  transaction_date: Date;
  due_date: Date | null;
  paid_date: Date | null;
  process_id: string | null;
  real_estate_asset_id: string | null;
  client_id: string | null;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  proof_document_id: string | null;
  bank_account_id: string | null;
  bank_transaction_id: string | null;
  is_reconciled: boolean;
  reconciled_at: Date | null;
  reconciled_by: string | null;
  vendor_name: string | null;
  vendor_tax_id: string | null;
  vendor_account_number: string | null;
  description: string;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  created_by: string | null;
  assigned_to_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateFinancialTransactionInput {
  tenant_id: string;
  transaction_type: TransactionType;
  transaction_category?: string;
  amount_cents: number;
  currency?: string;
  exchange_rate?: number;
  transaction_date: string; // ISO date
  due_date?: string;
  // MANDATORY: At least one link required
  process_id?: string;
  real_estate_asset_id?: string;
  client_id?: string;
  payment_method?: string;
  payment_reference?: string;
  bank_account_id?: string;
  vendor_name?: string;
  vendor_tax_id?: string;
  vendor_account_number?: string;
  description: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  requires_approval?: boolean;
  assigned_to_id?: string;
}

export interface UpdateFinancialTransactionInput {
  transaction_category?: string;
  amount_cents?: number;
  currency?: string;
  transaction_date?: string;
  due_date?: string;
  payment_method?: string;
  payment_reference?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  assigned_to_id?: string;
}

export interface MarkPaymentInput {
  paid_date: string; // ISO date
  payment_method: string;
  payment_reference?: string;
  proof_document_id: string; // MANDATORY
  bank_transaction_id?: string;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function validateTransactionLinks(input: {
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
      'Transaction must be linked to at least one of: process_id (case), real_estate_asset_id, or client_id'
    );
  }
}

function mapRow(row: Record<string, unknown>): FinancialTransaction {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    transaction_number: row.transaction_number as string,
    transaction_type: row.transaction_type as TransactionType,
    transaction_category: (row.transaction_category as string) ?? null,
    amount_cents: Number(row.amount_cents),
    currency: (row.currency as string) || 'BRL',
    exchange_rate: Number(row.exchange_rate) || 1.0,
    transaction_date: new Date(row.transaction_date as string),
    due_date: row.due_date ? new Date(row.due_date as string) : null,
    paid_date: row.paid_date ? new Date(row.paid_date as string) : null,
    process_id: (row.process_id as string) ?? null,
    real_estate_asset_id: (row.real_estate_asset_id as string) ?? null,
    client_id: (row.client_id as string) ?? null,
    payment_status: row.payment_status as PaymentStatus,
    payment_method: (row.payment_method as string) ?? null,
    payment_reference: (row.payment_reference as string) ?? null,
    proof_document_id: (row.proof_document_id as string) ?? null,
    bank_account_id: (row.bank_account_id as string) ?? null,
    bank_transaction_id: (row.bank_transaction_id as string) ?? null,
    is_reconciled: Boolean(row.is_reconciled),
    reconciled_at: row.reconciled_at ? new Date(row.reconciled_at as string) : null,
    reconciled_by: (row.reconciled_by as string) ?? null,
    vendor_name: (row.vendor_name as string) ?? null,
    vendor_tax_id: (row.vendor_tax_id as string) ?? null,
    vendor_account_number: (row.vendor_account_number as string) ?? null,
    description: row.description as string,
    notes: (row.notes as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata: (row.metadata as Record<string, unknown>) || {},
    requires_approval: Boolean(row.requires_approval),
    approved_by: (row.approved_by as string) ?? null,
    approved_at: row.approved_at ? new Date(row.approved_at as string) : null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    assigned_to_id: (row.assigned_to_id as string) ?? null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Generate unique transaction number
 */
async function generateTransactionNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM financial_transactions 
     WHERE tenant_id = $1 AND transaction_number LIKE $2 AND deleted_at IS NULL`,
    [tenantId, `TXN-${year}-%`]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `TXN-${year}-${String(count).padStart(6, '0')}`;
}

/**
 * Financial Transaction Model
 * Manages financial transactions with mandatory links to case/asset/client
 */
export class FinancialTransactionModel {
  /**
   * Find transaction by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<FinancialTransaction | null> {
    requireTenantId(tenantId, 'FinancialTransactionModel.findById');
    
    const result: QueryResult<FinancialTransaction> = await db.query<FinancialTransaction>(
      `SELECT * FROM financial_transactions 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find transaction by transaction number
   */
  static async findByTransactionNumber(
    transactionNumber: string,
    tenantId: string
  ): Promise<FinancialTransaction | null> {
    requireTenantId(tenantId, 'FinancialTransactionModel.findByTransactionNumber');
    
    const result: QueryResult<FinancialTransaction> = await db.query<FinancialTransaction>(
      `SELECT * FROM financial_transactions 
       WHERE transaction_number = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [transactionNumber, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List transactions with filters
   */
  static async list(
    tenantId: string,
    filters?: {
      transaction_type?: TransactionType;
      payment_status?: PaymentStatus;
      process_id?: string;
      real_estate_asset_id?: string;
      client_id?: string;
      is_reconciled?: boolean;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ transactions: FinancialTransaction[]; total: number }> {
    requireTenantId(tenantId, 'FinancialTransactionModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.transaction_type) {
      conditions.push(`transaction_type = $${paramCount++}`);
      values.push(filters.transaction_type);
    }
    if (filters?.payment_status) {
      conditions.push(`payment_status = $${paramCount++}`);
      values.push(filters.payment_status);
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
    if (filters?.is_reconciled !== undefined) {
      conditions.push(`is_reconciled = $${paramCount++}`);
      values.push(filters.is_reconciled);
    }
    if (filters?.start_date) {
      conditions.push(`transaction_date >= $${paramCount++}`);
      values.push(filters.start_date);
    }
    if (filters?.end_date) {
      conditions.push(`transaction_date <= $${paramCount++}`);
      values.push(filters.end_date);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM financial_transactions WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<FinancialTransaction> = await db.query<FinancialTransaction>(
      `SELECT * FROM financial_transactions 
       WHERE ${whereClause}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      transactions: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new transaction
   */
  static async create(input: CreateFinancialTransactionInput, userId: string): Promise<FinancialTransaction> {
    requireTenantId(input.tenant_id, 'FinancialTransactionModel.create');
    
    // Validate: No orphan transactions
    validateTransactionLinks(input);

    // Generate transaction number
    const transactionNumber = await generateTransactionNumber(input.tenant_id);

    const result: QueryResult<FinancialTransaction> = await db.query<FinancialTransaction>(
      `INSERT INTO financial_transactions 
       (tenant_id, transaction_number, transaction_type, transaction_category, amount_cents,
        currency, exchange_rate, transaction_date, due_date, process_id, real_estate_asset_id,
        client_id, payment_method, payment_reference, bank_account_id, vendor_name, vendor_tax_id,
        vendor_account_number, description, notes, tags, metadata, requires_approval,
        assigned_to_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
       RETURNING *`,
      [
        input.tenant_id,
        transactionNumber,
        input.transaction_type,
        input.transaction_category || null,
        input.amount_cents,
        input.currency || 'BRL',
        input.exchange_rate || 1.0,
        input.transaction_date,
        input.due_date || null,
        input.process_id || null,
        input.real_estate_asset_id || null,
        input.client_id || null,
        input.payment_method || null,
        input.payment_reference || null,
        input.bank_account_id || null,
        input.vendor_name || null,
        input.vendor_tax_id || null,
        input.vendor_account_number || null,
        input.description,
        input.notes || null,
        input.tags || [],
        JSON.stringify(input.metadata || {}),
        input.requires_approval || false,
        input.assigned_to_id || null,
        userId,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update transaction
   */
  static async update(
    id: string,
    tenantId: string,
    input: UpdateFinancialTransactionInput
  ): Promise<FinancialTransaction> {
    requireTenantId(tenantId, 'FinancialTransactionModel.update');
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.transaction_category !== undefined) {
      updates.push(`transaction_category = $${paramCount++}`);
      values.push(input.transaction_category);
    }
    if (input.amount_cents !== undefined) {
      updates.push(`amount_cents = $${paramCount++}`);
      values.push(input.amount_cents);
    }
    if (input.currency !== undefined) {
      updates.push(`currency = $${paramCount++}`);
      values.push(input.currency);
    }
    if (input.transaction_date !== undefined) {
      updates.push(`transaction_date = $${paramCount++}`);
      values.push(input.transaction_date);
    }
    if (input.due_date !== undefined) {
      updates.push(`due_date = $${paramCount++}`);
      values.push(input.due_date || null);
    }
    if (input.payment_method !== undefined) {
      updates.push(`payment_method = $${paramCount++}`);
      values.push(input.payment_method);
    }
    if (input.payment_reference !== undefined) {
      updates.push(`payment_reference = $${paramCount++}`);
      values.push(input.payment_reference);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(input.description);
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
    if (input.assigned_to_id !== undefined) {
      updates.push(`assigned_to_id = $${paramCount++}`);
      values.push(input.assigned_to_id);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundError('Financial transaction');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result: QueryResult<FinancialTransaction> = await db.query<FinancialTransaction>(
      `UPDATE financial_transactions 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND tenant_id = $${paramCount++} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Financial transaction');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Mark payment as paid (MANDATORY proof document required)
   */
  static async markPayment(
    id: string,
    tenantId: string,
    userId: string,
    input: MarkPaymentInput
  ): Promise<FinancialTransaction> {
    requireTenantId(tenantId, 'FinancialTransactionModel.markPayment');
    
    // Validate proof document is provided
    if (!input.proof_document_id) {
      throw new ValidationError('Proof document is required to mark payment as paid');
    }

    const updates: string[] = [
      'payment_status = $1',
      'paid_date = $2',
      'payment_method = $3',
      'proof_document_id = $4',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    const values: unknown[] = ['PAID', input.paid_date, input.payment_method, input.proof_document_id];

    if (input.payment_reference) {
      updates.push(`payment_reference = $${values.length + 1}`);
      values.push(input.payment_reference);
    }
    if (input.bank_transaction_id) {
      updates.push(`bank_transaction_id = $${values.length + 1}`);
      updates.push(`is_reconciled = true`);
      updates.push(`reconciled_at = CURRENT_TIMESTAMP`);
      updates.push(`reconciled_by = $${values.length + 2}`);
      values.push(input.bank_transaction_id, userId);
    }

    values.push(id, tenantId);

    const result: QueryResult<FinancialTransaction> = await db.query<FinancialTransaction>(
      `UPDATE financial_transactions 
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND tenant_id = $${values.length} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Financial transaction');
    }

    return mapRow(result.rows[0]);
  }
}
