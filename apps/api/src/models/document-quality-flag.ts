import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * Quality flag types
 */
export type QualityFlagType =
  | 'DPI_LOW'
  | 'DPI_UNDETECTABLE'
  | 'OCR_CONFIDENCE_LOW'
  | 'OCR_FAILED'
  | 'OCR_VISION_FALLBACK_USED'
  | 'CORRUPT_FILE'
  | 'INVALID_FORMAT'
  | 'ENCRYPTED_FILE'
  | 'MISSING_PAGES'
  | 'BLANK_PAGES'
  | 'EXTRACTION_FAILED'
  | 'EXTRACTION_INCOMPLETE'
  | 'DUPLICATE_CONTENT'
  | 'MANUAL_REVIEW_REQUIRED';

/**
 * Severity levels
 */
export type FlagSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Queue status
 */
export type QueueStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED' | 'ESCALATED';

/**
 * Document quality flag model
 */
export interface DocumentQualityFlag {
  id: string;
  tenant_id: string;
  document_id: string;
  
  // Flag details
  flag_type: QualityFlagType;
  flag_code: string;
  severity: FlagSeverity;
  
  // Flag data
  flag_message: string;
  flag_details: Record<string, unknown>;
  
  // Thresholds
  threshold_value: number | null;
  actual_value: number | null;
  
  // Queue status
  queue_status: QueueStatus;
  queued_at: Date;
  
  // Resolution
  resolution_action: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  
  // Auto-resolution
  auto_resolution_attempted: boolean;
  auto_resolution_result: string | null;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

export interface CreateQualityFlagInput {
  tenant_id: string;
  document_id: string;
  flag_type: QualityFlagType;
  flag_code: string;
  severity: FlagSeverity;
  flag_message: string;
  flag_details?: Record<string, unknown>;
  threshold_value?: number;
  actual_value?: number;
}

/**
 * Sanitation queue item (from view)
 */
export interface SanitationQueueItem {
  flag_id: string;
  tenant_id: string;
  document_id: string;
  document_number: string;
  document_title: string;
  file_name: string;
  status_cpo: string | null;
  flag_type: QualityFlagType;
  flag_code: string;
  severity: FlagSeverity;
  flag_message: string;
  flag_details: Record<string, unknown>;
  threshold_value: number | null;
  actual_value: number | null;
  queue_status: QueueStatus;
  queued_at: Date;
  resolution_action: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  document_created_at: Date;
}

/**
 * Validate tenant ID is provided
 */
function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

/**
 * DocumentQualityFlag model - Database operations with tenant isolation
 */
export class DocumentQualityFlagModel {
  /**
   * Find flag by ID
   */
  static async findById(id: string, tenantId: string): Promise<DocumentQualityFlag | null> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.findById');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `SELECT * FROM document_quality_flags 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find flags by document ID
   */
  static async findByDocumentId(documentId: string, tenantId: string): Promise<DocumentQualityFlag[]> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.findByDocumentId');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `SELECT * FROM document_quality_flags 
       WHERE document_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [documentId, tenantId]
    );
    return result.rows;
  }

  /**
   * Find unresolved flags by document ID
   */
  static async findUnresolvedByDocumentId(documentId: string, tenantId: string): Promise<DocumentQualityFlag[]> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.findUnresolvedByDocumentId');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `SELECT * FROM document_quality_flags 
       WHERE document_id = $1 AND tenant_id = $2
         AND queue_status IN ('PENDING', 'IN_REVIEW', 'ESCALATED')
       ORDER BY 
         CASE severity WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
         created_at ASC`,
      [documentId, tenantId]
    );
    return result.rows;
  }

  /**
   * Get sanitation queue items
   */
  static async getSanitationQueue(
    tenantId: string,
    options?: {
      severity?: FlagSeverity;
      flag_type?: QualityFlagType;
      limit?: number;
      offset?: number;
    }
  ): Promise<SanitationQueueItem[]> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.getSanitationQueue');
    
    let query = `
      SELECT 
        qf.id AS flag_id,
        qf.tenant_id,
        qf.document_id,
        d.document_number,
        d.title AS document_title,
        d.file_name,
        d.status_cpo,
        qf.flag_type,
        qf.flag_code,
        qf.severity,
        qf.flag_message,
        qf.flag_details,
        qf.threshold_value,
        qf.actual_value,
        qf.queue_status,
        qf.queued_at,
        qf.resolution_action,
        qf.resolved_by,
        qf.resolved_at,
        d.created_by AS uploaded_by,
        u.email AS uploaded_by_email,
        d.created_at AS document_created_at
      FROM document_quality_flags qf
      JOIN documents d ON qf.document_id = d.id AND qf.tenant_id = d.tenant_id
      LEFT JOIN users u ON d.created_by = u.id
      WHERE qf.tenant_id = $1
        AND qf.queue_status IN ('PENDING', 'IN_REVIEW', 'ESCALATED')
        AND d.deleted_at IS NULL
    `;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options?.severity) {
      query += ` AND qf.severity = $${paramIndex++}`;
      params.push(options.severity);
    }

    if (options?.flag_type) {
      query += ` AND qf.flag_type = $${paramIndex++}`;
      params.push(options.flag_type);
    }

    query += `
      ORDER BY 
        CASE qf.severity WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
        qf.queued_at ASC
    `;

    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result: QueryResult<SanitationQueueItem> = await db.query<SanitationQueueItem>(query, params);
    return result.rows;
  }

  /**
   * Create quality flag (uses database function to also update document)
   */
  static async create(input: CreateQualityFlagInput): Promise<DocumentQualityFlag> {
    requireTenantId(input.tenant_id, 'DocumentQualityFlagModel.create');
    
    // Use database function to create flag and update document status
    const flagIdResult = await db.query<{ add_document_quality_flag: string }>(
      `SELECT add_document_quality_flag($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.tenant_id,
        input.document_id,
        input.flag_type,
        input.flag_code,
        input.severity,
        input.flag_message,
        JSON.stringify(input.flag_details || {}),
        input.threshold_value || null,
        input.actual_value || null,
      ]
    );

    const flagId = flagIdResult.rows[0].add_document_quality_flag;
    
    // Fetch and return the created flag
    const flag = await this.findById(flagId, input.tenant_id);
    if (!flag) {
      throw new Error('Failed to create quality flag');
    }
    return flag;
  }

  /**
   * Create quality flag directly (without document update)
   */
  static async createDirect(input: CreateQualityFlagInput): Promise<DocumentQualityFlag> {
    requireTenantId(input.tenant_id, 'DocumentQualityFlagModel.createDirect');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `INSERT INTO document_quality_flags (
        tenant_id, document_id, flag_type, flag_code, severity,
        flag_message, flag_details, threshold_value, actual_value
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.tenant_id,
        input.document_id,
        input.flag_type,
        input.flag_code,
        input.severity,
        input.flag_message,
        JSON.stringify(input.flag_details || {}),
        input.threshold_value || null,
        input.actual_value || null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update queue status
   */
  static async updateQueueStatus(
    id: string,
    tenantId: string,
    status: QueueStatus
  ): Promise<DocumentQualityFlag | null> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.updateQueueStatus');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `UPDATE document_quality_flags 
       SET queue_status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [status, id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Resolve quality flag (uses database function)
   */
  static async resolve(
    id: string,
    tenantId: string,
    resolutionAction: string,
    resolutionNotes: string | null,
    resolvedBy: string
  ): Promise<boolean> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.resolve');
    
    const result = await db.query<{ resolve_document_quality_flag: boolean }>(
      `SELECT resolve_document_quality_flag($1, $2, $3, $4, $5)`,
      [id, tenantId, resolutionAction, resolutionNotes, resolvedBy]
    );
    
    return result.rows[0].resolve_document_quality_flag;
  }

  /**
   * Dismiss flag
   */
  static async dismiss(
    id: string,
    tenantId: string,
    dismissedBy: string,
    reason: string
  ): Promise<DocumentQualityFlag | null> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.dismiss');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `UPDATE document_quality_flags 
       SET queue_status = 'DISMISSED',
           resolution_action = 'DISMISSED',
           resolution_notes = $1,
           resolved_by = $2,
           resolved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [reason, dismissedBy, id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Escalate flag
   */
  static async escalate(
    id: string,
    tenantId: string,
    escalationNotes: string
  ): Promise<DocumentQualityFlag | null> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.escalate');
    
    const result: QueryResult<DocumentQualityFlag> = await db.query<DocumentQualityFlag>(
      `UPDATE document_quality_flags 
       SET queue_status = 'ESCALATED',
           flag_details = flag_details || jsonb_build_object('escalation_notes', $1, 'escalated_at', CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [escalationNotes, id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Count flags by status for a tenant
   */
  static async countByStatus(tenantId: string): Promise<Record<QueueStatus, number>> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.countByStatus');
    
    const result = await db.query<{ queue_status: QueueStatus; count: string }>(
      `SELECT queue_status, COUNT(*) as count 
       FROM document_quality_flags 
       WHERE tenant_id = $1
       GROUP BY queue_status`,
      [tenantId]
    );
    
    const counts: Record<QueueStatus, number> = {
      PENDING: 0,
      IN_REVIEW: 0,
      RESOLVED: 0,
      DISMISSED: 0,
      ESCALATED: 0,
    };
    
    for (const row of result.rows) {
      counts[row.queue_status] = parseInt(row.count, 10);
    }
    
    return counts;
  }

  /**
   * Count flags by severity for a tenant
   */
  static async countBySeverity(tenantId: string): Promise<Record<FlagSeverity, number>> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.countBySeverity');
    
    const result = await db.query<{ severity: FlagSeverity; count: string }>(
      `SELECT severity, COUNT(*) as count 
       FROM document_quality_flags 
       WHERE tenant_id = $1 AND queue_status NOT IN ('RESOLVED', 'DISMISSED')
       GROUP BY severity`,
      [tenantId]
    );
    
    const counts: Record<FlagSeverity, number> = {
      ERROR: 0,
      WARNING: 0,
      INFO: 0,
    };
    
    for (const row of result.rows) {
      counts[row.severity] = parseInt(row.count, 10);
    }
    
    return counts;
  }

  /**
   * Delete flag
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'DocumentQualityFlagModel.delete');
    
    const result = await db.query(
      `DELETE FROM document_quality_flags 
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
