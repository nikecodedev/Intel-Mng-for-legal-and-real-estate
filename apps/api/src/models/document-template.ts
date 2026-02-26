import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export interface DocumentTemplate {
  id: string;
  tenant_id: string;
  template_name: string;
  template_type: string;
  description: string | null;
  template_content: string;
  template_structure: Record<string, unknown> | null;
  variables: Record<string, unknown> | null;
  category: string | null;
  tags: string[];
  use_cases: string[];
  source_knowledge_entry_ids: string[];
  source_case_ids: string[];
  usage_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number | null;
  last_used_at: Date | null;
  priority_score: number;
  is_recommended: boolean;
  version_number: number;
  parent_template_id: string | null;
  is_current_version: boolean;
  is_active: boolean;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: Date | null;
  created_by: string | null;
  updated_by: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateDocumentTemplateInput {
  tenant_id: string;
  template_name: string;
  template_type: string;
  description?: string;
  template_content: string;
  template_structure?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  category?: string;
  tags?: string[];
  use_cases?: string[];
  source_knowledge_entry_ids?: string[];
  source_case_ids?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): DocumentTemplate {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    template_name: row.template_name as string,
    template_type: row.template_type as string,
    description: (row.description as string) ?? null,
    template_content: row.template_content as string,
    template_structure: row.template_structure ? (row.template_structure as Record<string, unknown>) : null,
    variables: row.variables ? (row.variables as Record<string, unknown>) : null,
    category: (row.category as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    use_cases: Array.isArray(row.use_cases) ? (row.use_cases as string[]) : [],
    source_knowledge_entry_ids: Array.isArray(row.source_knowledge_entry_ids) 
      ? (row.source_knowledge_entry_ids as string[]) : [],
    source_case_ids: Array.isArray(row.source_case_ids) ? (row.source_case_ids as string[]) : [],
    usage_count: Number(row.usage_count) || 0,
    success_count: Number(row.success_count) || 0,
    failure_count: Number(row.failure_count) || 0,
    success_rate: row.success_rate ? Number(row.success_rate) : null,
    last_used_at: row.last_used_at ? new Date(row.last_used_at as string) : null,
    priority_score: Number(row.priority_score) || 50,
    is_recommended: Boolean(row.is_recommended),
    version_number: Number(row.version_number) || 1,
    parent_template_id: (row.parent_template_id as string) ?? null,
    is_current_version: Boolean(row.is_current_version),
    is_active: Boolean(row.is_active),
    is_verified: Boolean(row.is_verified),
    verified_by: (row.verified_by as string) ?? null,
    verified_at: row.verified_at ? new Date(row.verified_at as string) : null,
    created_by: (row.created_by as string) ?? null,
    updated_by: (row.updated_by as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Document Template Model
 * Manages document templates with success rate tracking
 */
export class DocumentTemplateModel {
  /**
   * Find template by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<DocumentTemplate | null> {
    requireTenantId(tenantId, 'DocumentTemplateModel.findById');
    
    const result: QueryResult<DocumentTemplate> = await db.query<DocumentTemplate>(
      `SELECT * FROM document_templates 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List templates with filters (prioritized by success rate)
   */
  static async list(
    tenantId: string,
    filters?: {
      template_type?: string;
      category?: string;
      recommended_only?: boolean;
      min_success_rate?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ templates: DocumentTemplate[]; total: number }> {
    requireTenantId(tenantId, 'DocumentTemplateModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL', 'is_active = true'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.template_type) {
      conditions.push(`template_type = $${paramCount++}`);
      values.push(filters.template_type);
    }
    if (filters?.category) {
      conditions.push(`category = $${paramCount++}`);
      values.push(filters.category);
    }
    if (filters?.recommended_only) {
      conditions.push(`is_recommended = true`);
    }
    if (filters?.min_success_rate !== undefined) {
      conditions.push(`success_rate >= $${paramCount++}`);
      values.push(filters.min_success_rate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM document_templates WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results (prioritized by success rate and priority score)
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<DocumentTemplate> = await db.query<DocumentTemplate>(
      `SELECT * FROM document_templates 
       WHERE ${whereClause}
       ORDER BY priority_score DESC, success_rate DESC NULLS LAST, usage_count DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      templates: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new template
   */
  static async create(input: CreateDocumentTemplateInput, userId: string): Promise<DocumentTemplate> {
    requireTenantId(input.tenant_id, 'DocumentTemplateModel.create');
    
    const result: QueryResult<DocumentTemplate> = await db.query<DocumentTemplate>(
      `INSERT INTO document_templates 
       (tenant_id, template_name, template_type, description, template_content,
        template_structure, variables, category, tags, use_cases,
        source_knowledge_entry_ids, source_case_ids, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        input.tenant_id,
        input.template_name,
        input.template_type,
        input.description || null,
        input.template_content,
        input.template_structure ? JSON.stringify(input.template_structure) : null,
        input.variables ? JSON.stringify(input.variables) : null,
        input.category || null,
        input.tags || [],
        input.use_cases || [],
        input.source_knowledge_entry_ids || [],
        input.source_case_ids || [],
        userId,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Record template usage
   */
  static async recordUsage(
    templateId: string,
    tenantId: string,
    userId: string,
    caseId?: string,
    documentId?: string
  ): Promise<void> {
    requireTenantId(tenantId, 'DocumentTemplateModel.recordUsage');
    
    await db.query(
      `INSERT INTO template_usage_stats 
       (tenant_id, template_id, used_in_case_id, used_in_document_id, used_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, templateId, caseId || null, documentId || null, userId]
    );

    // Update template last_used_at
    await db.query(
      `UPDATE document_templates 
       SET last_used_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );
  }

  /**
   * Record template outcome
   */
  static async recordOutcome(
    templateId: string,
    tenantId: string,
    outcomeType: 'SUCCESS' | 'FAILURE' | 'PARTIAL',
    outcomeDate?: string,
    outcomeNotes?: string
  ): Promise<void> {
    requireTenantId(tenantId, 'DocumentTemplateModel.recordOutcome');
    
    await db.query(
      `UPDATE template_usage_stats 
       SET outcome_type = $1,
           outcome_date = $2,
           outcome_notes = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE template_id = $4 
         AND tenant_id = $5
         AND outcome_type IS NULL
       ORDER BY used_at DESC
       LIMIT 1`,
      [outcomeType, outcomeDate || null, outcomeNotes || null, templateId, tenantId]
    );
  }
}
