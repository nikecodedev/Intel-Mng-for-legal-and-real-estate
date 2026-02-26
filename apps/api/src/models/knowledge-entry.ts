import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type KnowledgeEntryType = 'LEGAL_THESIS' | 'CASE_OUTCOME' | 'LEGAL_PRECEDENT' | 'LEGAL_OPINION';
export type OutcomeType = 'FAVORABLE' | 'UNFAVORABLE' | 'MIXED' | 'SETTLED';

export interface KnowledgeEntry {
  id: string;
  tenant_id: string;
  entry_type: KnowledgeEntryType;
  title: string;
  summary: string | null;
  content: string;
  category: string | null;
  tags: string[];
  keywords: string[];
  source_case_ids: string[];
  source_document_ids: string[];
  jurisdiction: string | null;
  court_level: string | null;
  decision_date: Date | null;
  case_number: string | null;
  judge_name: string | null;
  outcome_type: OutcomeType | null;
  outcome_summary: string | null;
  key_legal_points: string[];
  embedding_vector: number[] | null;
  search_text: string | null;
  view_count: number;
  last_viewed_at: Date | null;
  relevance_score: number | null;
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

export interface CreateKnowledgeEntryInput {
  tenant_id: string;
  entry_type: KnowledgeEntryType;
  title: string;
  summary?: string;
  content: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  source_case_ids?: string[];
  source_document_ids?: string[];
  jurisdiction?: string;
  court_level?: string;
  decision_date?: string;
  case_number?: string;
  judge_name?: string;
  outcome_type?: OutcomeType;
  outcome_summary?: string;
  key_legal_points?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): KnowledgeEntry {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    entry_type: row.entry_type as KnowledgeEntryType,
    title: row.title as string,
    summary: (row.summary as string) ?? null,
    content: row.content as string,
    category: (row.category as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    source_case_ids: Array.isArray(row.source_case_ids) ? (row.source_case_ids as string[]) : [],
    source_document_ids: Array.isArray(row.source_document_ids) ? (row.source_document_ids as string[]) : [],
    jurisdiction: (row.jurisdiction as string) ?? null,
    court_level: (row.court_level as string) ?? null,
    decision_date: row.decision_date ? new Date(row.decision_date as string) : null,
    case_number: (row.case_number as string) ?? null,
    judge_name: (row.judge_name as string) ?? null,
    outcome_type: (row.outcome_type as OutcomeType) ?? null,
    outcome_summary: (row.outcome_summary as string) ?? null,
    key_legal_points: Array.isArray(row.key_legal_points) ? (row.key_legal_points as string[]) : [],
    embedding_vector: Array.isArray(row.embedding_vector) ? (row.embedding_vector as number[]) : null,
    search_text: (row.search_text as string) ?? null,
    view_count: Number(row.view_count) || 0,
    last_viewed_at: row.last_viewed_at ? new Date(row.last_viewed_at as string) : null,
    relevance_score: row.relevance_score ? Number(row.relevance_score) : null,
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
 * Knowledge Entry Model
 * Manages legal theses, case outcomes, and legal knowledge
 */
export class KnowledgeEntryModel {
  /**
   * Find entry by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<KnowledgeEntry | null> {
    requireTenantId(tenantId, 'KnowledgeEntryModel.findById');
    
    const result: QueryResult<KnowledgeEntry> = await db.query<KnowledgeEntry>(
      `SELECT * FROM knowledge_entries 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List entries with filters
   */
  static async list(
    tenantId: string,
    filters?: {
      entry_type?: KnowledgeEntryType;
      category?: string;
      outcome_type?: OutcomeType;
      is_verified?: boolean;
      min_relevance_score?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ entries: KnowledgeEntry[]; total: number }> {
    requireTenantId(tenantId, 'KnowledgeEntryModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.entry_type) {
      conditions.push(`entry_type = $${paramCount++}`);
      values.push(filters.entry_type);
    }
    if (filters?.category) {
      conditions.push(`category = $${paramCount++}`);
      values.push(filters.category);
    }
    if (filters?.outcome_type) {
      conditions.push(`outcome_type = $${paramCount++}`);
      values.push(filters.outcome_type);
    }
    if (filters?.is_verified !== undefined) {
      conditions.push(`is_verified = $${paramCount++}`);
      values.push(filters.is_verified);
    }
    if (filters?.min_relevance_score !== undefined) {
      conditions.push(`relevance_score >= $${paramCount++}`);
      values.push(filters.min_relevance_score);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM knowledge_entries WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<KnowledgeEntry> = await db.query<KnowledgeEntry>(
      `SELECT * FROM knowledge_entries 
       WHERE ${whereClause}
       ORDER BY relevance_score DESC NULLS LAST, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      entries: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new knowledge entry
   */
  static async create(input: CreateKnowledgeEntryInput, userId: string): Promise<KnowledgeEntry> {
    requireTenantId(input.tenant_id, 'KnowledgeEntryModel.create');
    
    // Prepare search text (content + summary + title for full-text search)
    const searchText = [
      input.title,
      input.summary || '',
      input.content,
      input.keywords?.join(' ') || '',
    ].join(' ').toLowerCase();

    const result: QueryResult<KnowledgeEntry> = await db.query<KnowledgeEntry>(
      `INSERT INTO knowledge_entries 
       (tenant_id, entry_type, title, summary, content, category, tags, keywords,
        source_case_ids, source_document_ids, jurisdiction, court_level, decision_date,
        case_number, judge_name, outcome_type, outcome_summary, key_legal_points,
        search_text, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        input.tenant_id,
        input.entry_type,
        input.title,
        input.summary || null,
        input.content,
        input.category || null,
        input.tags || [],
        input.keywords || [],
        input.source_case_ids || [],
        input.source_document_ids || [],
        input.jurisdiction || null,
        input.court_level || null,
        input.decision_date || null,
        input.case_number || null,
        input.judge_name || null,
        input.outcome_type || null,
        input.outcome_summary || null,
        input.key_legal_points || [],
        searchText,
        userId,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Increment view count
   */
  static async incrementViewCount(id: string, tenantId: string): Promise<void> {
    requireTenantId(tenantId, 'KnowledgeEntryModel.incrementViewCount');
    
    await db.query(
      `UPDATE knowledge_entries 
       SET view_count = view_count + 1,
           last_viewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
  }
}
