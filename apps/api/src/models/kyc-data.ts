import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type KYCStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type KYCLevel = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';
export type PEPStatus = 'NO' | 'YES' | 'UNKNOWN';
export type SanctionsCheckStatus = 'PENDING' | 'CLEAR' | 'FLAGGED';

export interface KYCData {
  id: string;
  tenant_id: string;
  investor_user_id: string;
  full_name: string;
  date_of_birth: Date | null;
  nationality: string | null;
  tax_id: string | null;
  tax_id_type: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone_number: string | null;
  alternate_email: string | null;
  identity_document_type: string | null;
  identity_document_number: string | null;
  identity_document_front_id: string | null;
  identity_document_back_id: string | null;
  proof_of_address_document_id: string | null;
  source_of_funds: string | null;
  annual_income_range: string | null;
  net_worth_range: string | null;
  kyc_status: KYCStatus;
  kyc_level: KYCLevel;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  rejection_reason: string | null;
  pep_status: PEPStatus | null;
  sanctions_check_status: SanctionsCheckStatus | null;
  sanctions_check_date: Date | null;
  kyc_expires_at: Date | null;
  last_verified_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateKYCDataInput {
  tenant_id: string;
  investor_user_id: string;
  full_name: string;
  date_of_birth?: string;
  nationality?: string;
  tax_id?: string;
  tax_id_type?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone_number?: string;
  alternate_email?: string;
  identity_document_type?: string;
  identity_document_number?: string;
  identity_document_front_id?: string;
  identity_document_back_id?: string;
  proof_of_address_document_id?: string;
  source_of_funds?: string;
  annual_income_range?: string;
  net_worth_range?: string;
  pep_status?: PEPStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateKYCStatusInput {
  kyc_status: KYCStatus;
  review_notes?: string;
  rejection_reason?: string;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: Record<string, unknown>): KYCData {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    investor_user_id: row.investor_user_id as string,
    full_name: row.full_name as string,
    date_of_birth: row.date_of_birth ? new Date(row.date_of_birth as string) : null,
    nationality: (row.nationality as string) ?? null,
    tax_id: (row.tax_id as string) ?? null,
    tax_id_type: (row.tax_id_type as string) ?? null,
    address_line1: (row.address_line1 as string) ?? null,
    address_line2: (row.address_line2 as string) ?? null,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    postal_code: (row.postal_code as string) ?? null,
    country: (row.country as string) ?? null,
    phone_number: (row.phone_number as string) ?? null,
    alternate_email: (row.alternate_email as string) ?? null,
    identity_document_type: (row.identity_document_type as string) ?? null,
    identity_document_number: (row.identity_document_number as string) ?? null,
    identity_document_front_id: (row.identity_document_front_id as string) ?? null,
    identity_document_back_id: (row.identity_document_back_id as string) ?? null,
    proof_of_address_document_id: (row.proof_of_address_document_id as string) ?? null,
    source_of_funds: (row.source_of_funds as string) ?? null,
    annual_income_range: (row.annual_income_range as string) ?? null,
    net_worth_range: (row.net_worth_range as string) ?? null,
    kyc_status: row.kyc_status as KYCStatus,
    kyc_level: row.kyc_level as KYCLevel,
    reviewed_by: (row.reviewed_by as string) ?? null,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at as string) : null,
    review_notes: (row.review_notes as string) ?? null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    pep_status: (row.pep_status as PEPStatus) ?? null,
    sanctions_check_status: (row.sanctions_check_status as SanctionsCheckStatus) ?? null,
    sanctions_check_date: row.sanctions_check_date ? new Date(row.sanctions_check_date as string) : null,
    kyc_expires_at: row.kyc_expires_at ? new Date(row.kyc_expires_at as string) : null,
    last_verified_at: row.last_verified_at ? new Date(row.last_verified_at as string) : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * KYC Data Model
 * Manages KYC (Know Your Customer) data for investor onboarding
 */
export class KYCDataModel {
  /**
   * Find KYC data by investor ID within tenant
   */
  static async findByInvestorId(
    investorUserId: string,
    tenantId: string
  ): Promise<KYCData | null> {
    requireTenantId(tenantId, 'KYCDataModel.findByInvestorId');
    
    const result: QueryResult<KYCData> = await db.query<KYCData>(
      `SELECT * FROM kyc_data 
       WHERE investor_user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [investorUserId, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find KYC data by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<KYCData | null> {
    requireTenantId(tenantId, 'KYCDataModel.findById');
    
    const result: QueryResult<KYCData> = await db.query<KYCData>(
      `SELECT * FROM kyc_data 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Check if investor has approved KYC
   */
  static async hasApprovedKYC(investorUserId: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'KYCDataModel.hasApprovedKYC');
    
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM kyc_data
         WHERE investor_user_id = $1
           AND tenant_id = $2
           AND deleted_at IS NULL
           AND kyc_status = 'APPROVED'
           AND (kyc_expires_at IS NULL OR kyc_expires_at > CURRENT_TIMESTAMP)
         ORDER BY created_at DESC
         LIMIT 1
       ) as exists`,
      [investorUserId, tenantId]
    );
    return result.rows[0].exists;
  }

  /**
   * Create new KYC data
   */
  static async create(input: CreateKYCDataInput): Promise<KYCData> {
    requireTenantId(input.tenant_id, 'KYCDataModel.create');
    
    const result: QueryResult<KYCData> = await db.query<KYCData>(
      `INSERT INTO kyc_data 
       (tenant_id, investor_user_id, full_name, date_of_birth, nationality, tax_id, tax_id_type,
        address_line1, address_line2, city, state, postal_code, country, phone_number,
        alternate_email, identity_document_type, identity_document_number,
        identity_document_front_id, identity_document_back_id, proof_of_address_document_id,
        source_of_funds, annual_income_range, net_worth_range, pep_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
       RETURNING *`,
      [
        input.tenant_id,
        input.investor_user_id,
        input.full_name,
        input.date_of_birth || null,
        input.nationality || null,
        input.tax_id || null,
        input.tax_id_type || null,
        input.address_line1 || null,
        input.address_line2 || null,
        input.city || null,
        input.state || null,
        input.postal_code || null,
        input.country || null,
        input.phone_number || null,
        input.alternate_email || null,
        input.identity_document_type || null,
        input.identity_document_number || null,
        input.identity_document_front_id || null,
        input.identity_document_back_id || null,
        input.proof_of_address_document_id || null,
        input.source_of_funds || null,
        input.annual_income_range || null,
        input.net_worth_range || null,
        input.pep_status || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update KYC status (approve/reject)
   */
  static async updateStatus(
    id: string,
    tenantId: string,
    userId: string,
    input: UpdateKYCStatusInput
  ): Promise<KYCData> {
    requireTenantId(tenantId, 'KYCDataModel.updateStatus');
    
    const updates: string[] = [
      'kyc_status = $1',
      'reviewed_by = $2',
      'reviewed_at = CURRENT_TIMESTAMP',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    const values: unknown[] = [input.kyc_status, userId];

    if (input.review_notes) {
      updates.push(`review_notes = $${values.length + 1}`);
      values.push(input.review_notes);
    }
    if (input.rejection_reason) {
      updates.push(`rejection_reason = $${values.length + 1}`);
      values.push(input.rejection_reason);
    }

    values.push(id, tenantId);

    const result: QueryResult<KYCData> = await db.query<KYCData>(
      `UPDATE kyc_data 
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND tenant_id = $${values.length} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('KYC data');
    }

    return mapRow(result.rows[0]);
  }
}
