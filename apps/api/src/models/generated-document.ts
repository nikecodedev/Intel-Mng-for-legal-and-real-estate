import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

export type ReviewStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface GeneratedDocument {
  id: string;
  tenant_id: string;
  content: string;
  generated_by: string;
  source_fact_ids: string[];
  review_status: ReviewStatus;
  reviewed_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGeneratedDocumentInput {
  tenant_id: string;
  content: string;
  generated_by: string;
  source_fact_ids: string[];
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): GeneratedDocument {
  const sourceIds = row.source_fact_ids;
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    content: row.content as string,
    generated_by: row.generated_by as string,
    source_fact_ids: Array.isArray(sourceIds) ? (sourceIds as string[]) : [],
    review_status: (row.review_status as ReviewStatus) ?? 'PENDING',
    reviewed_by: (row.reviewed_by as string) ?? null,
    approved_at: row.approved_at ? new Date(row.approved_at as string) : null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export class GeneratedDocumentModel {
  static async findById(id: string, tenantId: string): Promise<GeneratedDocument | null> {
    requireTenantId(tenantId, 'GeneratedDocumentModel.findById');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM generated_documents WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  static async create(input: CreateGeneratedDocumentInput): Promise<GeneratedDocument> {
    requireTenantId(input.tenant_id, 'GeneratedDocumentModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO generated_documents (tenant_id, content, generated_by, source_fact_ids)
       VALUES ($1, $2, $3, $4::uuid[])
       RETURNING *`,
      [
        input.tenant_id,
        input.content,
        input.generated_by,
        input.source_fact_ids,
      ]
    );
    return mapRow(result.rows[0]);
  }

  static async listByTenant(
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<GeneratedDocument[]> {
    requireTenantId(tenantId, 'GeneratedDocumentModel.listByTenant');
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM generated_documents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
    return result.rows.map(mapRow);
  }

  /**
   * Submit document for review
   */
  static async submitForReview(id: string, tenantId: string): Promise<GeneratedDocument> {
    requireTenantId(tenantId, 'GeneratedDocumentModel.submitForReview');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE generated_documents SET review_status = 'IN_REVIEW', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new TenantRequiredError('Document not found');
    return mapRow(result.rows[0]);
  }

  /**
   * Approve a generated document
   */
  static async approve(id: string, tenantId: string, reviewerId: string): Promise<GeneratedDocument> {
    requireTenantId(tenantId, 'GeneratedDocumentModel.approve');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE generated_documents
       SET review_status = 'APPROVED', reviewed_by = $3, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, reviewerId]
    );
    if (result.rows.length === 0) throw new TenantRequiredError('Document not found');
    return mapRow(result.rows[0]);
  }

  /**
   * Reject a generated document
   */
  static async reject(id: string, tenantId: string, reviewerId: string, reason: string): Promise<GeneratedDocument> {
    requireTenantId(tenantId, 'GeneratedDocumentModel.reject');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE generated_documents
       SET review_status = 'REJECTED', reviewed_by = $3, rejection_reason = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, reviewerId, reason]
    );
    if (result.rows.length === 0) throw new TenantRequiredError('Document not found');
    return mapRow(result.rows[0]);
  }
}
