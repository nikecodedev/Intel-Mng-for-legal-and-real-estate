import { db } from '../models/database.js';
import { KnowledgeEntryModel, KnowledgeEntry } from '../models/knowledge-entry.js';
import { logger } from '../utils/logger.js';
import * as crypto from 'crypto';

export interface SearchResult {
  entry: KnowledgeEntry;
  relevance_score: number;
  match_reasons: string[];
}

export interface SemanticSearchOptions {
  entry_type?: string;
  category?: string;
  outcome_type?: string;
  min_relevance_score?: number;
  limit?: number;
  use_cache?: boolean;
}

/**
 * Knowledge Search Service
 * Semantic search over past cases and legal outcomes
 */
export class KnowledgeSearchService {
  /**
   * Perform semantic search over knowledge entries
   */
  static async search(
    tenantId: string,
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<{ results: SearchResult[]; total: number; cached: boolean }> {
    const queryHash = crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
    const cacheKey = `${tenantId}:${queryHash}`;

    // Check cache if enabled
    if (options.use_cache !== false) {
      const cached = await this.getCachedResults(cacheKey);
      if (cached) {
        logger.debug('Returning cached search results', { queryHash, resultCount: cached.total_results });
        return {
          results: cached.results,
          total: cached.total_results,
          cached: true,
        };
      }
    }

    // Build search query
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL', 'is_active = true'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    // Full-text search using PostgreSQL tsvector
    if (query.trim()) {
      conditions.push(`to_tsvector('portuguese', COALESCE(search_text, '')) @@ plainto_tsquery('portuguese', $${paramCount++})`);
      values.push(query);
    }

    if (options.entry_type) {
      conditions.push(`entry_type = $${paramCount++}`);
      values.push(options.entry_type);
    }
    if (options.category) {
      conditions.push(`category = $${paramCount++}`);
      values.push(options.category);
    }
    if (options.outcome_type) {
      conditions.push(`outcome_type = $${paramCount++}`);
      values.push(options.outcome_type);
    }
    if (options.min_relevance_score !== undefined) {
      conditions.push(`relevance_score >= $${paramCount++}`);
      values.push(options.min_relevance_score);
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM knowledge_entries WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get search results with relevance scoring
    const searchValues = [...values, limit];
    const result = await db.query<KnowledgeEntry & { ts_rank: number }>(
      `SELECT *,
         ts_rank(to_tsvector('portuguese', COALESCE(search_text, '')), plainto_tsquery('portuguese', $${paramCount++})) as ts_rank
       FROM knowledge_entries
       WHERE ${whereClause}
       ORDER BY ts_rank DESC, relevance_score DESC NULLS LAST, created_at DESC
       LIMIT $${paramCount++}`,
      searchValues
    );

    // Process results and calculate relevance scores
    const results: SearchResult[] = result.rows.map(row => {
      // Map row to KnowledgeEntry (simplified - in production would use model method)
      const entry: KnowledgeEntry = {
        id: row.id as string,
        tenant_id: row.tenant_id as string,
        entry_type: row.entry_type as any,
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
        outcome_type: (row.outcome_type as any) ?? null,
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
      const tsRank = Number(row.ts_rank) || 0;
      
      // Calculate relevance score (0-100)
      // Combine ts_rank with existing relevance_score
      const baseScore = entry.relevance_score || 50;
      const searchScore = Math.min(100, tsRank * 100); // Normalize ts_rank to 0-100
      const relevanceScore = Math.round((baseScore * 0.3) + (searchScore * 0.7));

      // Determine match reasons
      const matchReasons: string[] = [];
      if (query.toLowerCase().includes(entry.category?.toLowerCase() || '')) {
        matchReasons.push('Category match');
      }
      if (entry.tags.some(tag => query.toLowerCase().includes(tag.toLowerCase()))) {
        matchReasons.push('Tag match');
      }
      if (entry.keywords.some(keyword => query.toLowerCase().includes(keyword.toLowerCase()))) {
        matchReasons.push('Keyword match');
      }
      if (tsRank > 0.1) {
        matchReasons.push('Content match');
      }

      return {
        entry,
        relevance_score: relevanceScore,
        match_reasons: matchReasons,
      };
    });

    // Cache results if enabled
    if (options.use_cache !== false) {
      await this.cacheResults(cacheKey, query, results, total, options);
    }

    return {
      results,
      total,
      cached: false,
    };
  }

  /**
   * Search past cases (processes) linked to knowledge entries
   */
  static async searchPastCases(
    tenantId: string,
    query: string,
    options: { limit?: number } = {}
  ): Promise<{ case_ids: string[]; entries: KnowledgeEntry[] }> {
    // Search knowledge entries with case outcomes
    const searchResults = await this.search(tenantId, query, {
      entry_type: 'CASE_OUTCOME',
      limit: options.limit || 50,
    });

    // Extract unique case IDs from results
    const caseIds = new Set<string>();
    searchResults.results.forEach(result => {
      result.entry.source_case_ids.forEach(caseId => caseIds.add(caseId));
    });

    return {
      case_ids: Array.from(caseIds),
      entries: searchResults.results.map(r => r.entry),
    };
  }

  /**
   * Search legal outcomes
   */
  static async searchLegalOutcomes(
    tenantId: string,
    query: string,
    outcomeType?: string,
    options: { limit?: number } = {}
  ): Promise<SearchResult[]> {
    const searchResults = await this.search(tenantId, query, {
      entry_type: 'CASE_OUTCOME',
      outcome_type: outcomeType,
      limit: options.limit || 50,
    });

    return searchResults.results;
  }

  /**
   * Get cached search results
   */
  private static async getCachedResults(cacheKey: string): Promise<{
    results: SearchResult[];
    total_results: number;
  } | null> {
    const result = await db.query<{
      result_ids: string[];
      result_scores: number[];
      total_results: number;
    }>(
      `SELECT result_ids, result_scores, total_results
       FROM semantic_search_cache
       WHERE query_hash = $1
         AND cache_expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT 1`,
      [cacheKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const cached = result.rows[0];
    // Reconstruct results from cached IDs (simplified - in production would store full results)
    return {
      results: [], // Would reconstruct from IDs
      total_results: cached.total_results,
    };
  }

  /**
   * Cache search results
   */
  private static async cacheResults(
    cacheKey: string,
    query: string,
    results: SearchResult[],
    total: number,
    options: SemanticSearchOptions
  ): Promise<void> {
    const resultIds = results.map(r => r.entry.id);
    const resultScores = results.map(r => r.relevance_score);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Cache for 1 hour

    try {
      await db.query(
        `INSERT INTO semantic_search_cache 
         (tenant_id, search_query, query_hash, query_type, result_ids, result_scores, total_results, cache_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (query_hash) DO UPDATE SET
           result_ids = EXCLUDED.result_ids,
           result_scores = EXCLUDED.result_scores,
           total_results = EXCLUDED.total_results,
           cache_expires_at = EXCLUDED.cache_expires_at,
           created_at = CURRENT_TIMESTAMP`,
        [
          results[0]?.entry.tenant_id || '',
          query,
          cacheKey,
          options.entry_type || 'GENERAL_SEARCH',
          resultIds,
          resultScores,
          total,
          expiresAt,
        ]
      );
    } catch (error) {
      logger.warn('Failed to cache search results', { error, cacheKey });
    }
  }
}
