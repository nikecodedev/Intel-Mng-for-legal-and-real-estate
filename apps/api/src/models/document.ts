import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * Document model types
 * All documents belong to exactly one tenant (tenant isolation)
 */
export interface Document {
  id: string;
  tenant_id: string;
  document_number: string;
  title: string;
  description: string | null;
  document_type: string;
  category: string | null;
  
  // File information
  file_name: string;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  file_hash_sha256: string | null;
  
  // OCR/DPI fields
  ocr_processed: boolean;
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_processed_at: Date | null;
  ocr_engine: string | null;
  
  dpi_processed: boolean;
  dpi_resolution: number | null;
  dpi_processed_at: Date | null;
  image_quality_score: number | null;
  
  // Status
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  version: number;
  is_current_version: boolean;
  
  // CPO (Quality Control)
  status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO' | null;
  cpo_reviewer_id: string | null;
  cpo_reviewed_at: Date | null;
  cpo_notes: string | null;
  cpo_checklist: Record<string, unknown>;
  cpo_approval_required: boolean;
  cpo_approved_by: string | null;
  cpo_approved_at: Date | null;
  
  // Ownership
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  
  // Relationships
  parent_document_id: string | null;
  related_document_ids: string[] | null;
  process_id: string | null;
  
  // Dates
  document_date: Date | null;
  expiration_date: Date | null;
  effective_date: Date | null;
  
  // Metadata
  metadata: Record<string, unknown>;
  tags: string[] | null;
  keywords: string[] | null;
  
  // Compliance
  confidentiality_level: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  retention_policy: string | null;
  retention_until: Date | null;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateDocumentInput {
  tenant_id: string;
  document_number: string;
  title: string;
  description?: string;
  document_type: string;
  category?: string;
  file_name: string;
  storage_path?: string;
  file_size?: number;
  mime_type?: string;
  file_hash_sha256?: string;
  owner_id?: string;
  created_by: string;
  document_date?: Date;
  metadata?: Record<string, unknown>;
  tags?: string[];
  confidentiality_level?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string;
  category?: string;
  status?: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  metadata?: Record<string, unknown>;
  tags?: string[];
  keywords?: string[];
  document_date?: Date;
  expiration_date?: Date;
  updated_by?: string;
}

export interface DocumentOCRUpdate {
  ocr_processed: boolean;
  ocr_text?: string;
  ocr_confidence?: number;
  ocr_engine?: string;
}

export interface DocumentDPIUpdate {
  dpi_processed: boolean;
  dpi_resolution?: number;
  image_quality_score?: number;
}

export interface DocumentCPOUpdate {
  status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO';
  cpo_notes?: string;
  cpo_reviewer_id?: string;
  cpo_approval_required?: boolean;
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
 * Document model - Database operations with tenant isolation
 */
export class DocumentModel {
  /**
   * Find document by ID within a specific tenant
   */
  static async findById(id: string, tenantId: string): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.findById');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `SELECT * FROM documents 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find document by document number within a specific tenant
   */
  static async findByDocumentNumber(documentNumber: string, tenantId: string): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.findByDocumentNumber');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `SELECT * FROM documents 
       WHERE document_number = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [documentNumber, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find document by file hash within a specific tenant (for deduplication)
   */
  static async findByFileHash(fileHash: string, tenantId: string): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.findByFileHash');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `SELECT * FROM documents 
       WHERE file_hash_sha256 = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [fileHash, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * List all documents within a specific tenant
   */
  static async findAllByTenant(
    tenantId: string,
    options?: {
      status?: string;
      status_cpo?: string;
      document_type?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Document[]> {
    requireTenantId(tenantId, 'DocumentModel.findAllByTenant');
    
    let query = `SELECT * FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(options.status);
    }

    if (options?.status_cpo) {
      query += ` AND status_cpo = $${paramIndex++}`;
      params.push(options.status_cpo);
    }

    if (options?.document_type) {
      query += ` AND document_type = $${paramIndex++}`;
      params.push(options.document_type);
    }

    query += ` ORDER BY created_at DESC`;

    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result: QueryResult<Document> = await db.query<Document>(query, params);
    return result.rows;
  }

  /**
   * Find documents pending OCR processing
   */
  static async findPendingOCR(tenantId: string, limit: number = 10): Promise<Document[]> {
    requireTenantId(tenantId, 'DocumentModel.findPendingOCR');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `SELECT * FROM documents 
       WHERE tenant_id = $1 
         AND deleted_at IS NULL 
         AND ocr_processed = false
       ORDER BY created_at ASC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  /**
   * Find documents in sanitation queue (CPO flagged)
   */
  static async findInSanitationQueue(
    tenantId: string,
    options?: { severity?: 'ERROR' | 'WARNING'; limit?: number }
  ): Promise<Document[]> {
    requireTenantId(tenantId, 'DocumentModel.findInSanitationQueue');
    
    let query = `
      SELECT DISTINCT d.* FROM documents d
      JOIN document_quality_flags qf ON d.id = qf.document_id AND d.tenant_id = qf.tenant_id
      WHERE d.tenant_id = $1 
        AND d.deleted_at IS NULL
        AND qf.queue_status IN ('PENDING', 'IN_REVIEW')
    `;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options?.severity) {
      query += ` AND qf.severity = $${paramIndex++}`;
      params.push(options.severity);
    }

    query += ` ORDER BY d.created_at ASC`;

    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result: QueryResult<Document> = await db.query<Document>(query, params);
    return result.rows;
  }

  /**
   * Create new document
   */
  static async create(input: CreateDocumentInput): Promise<Document> {
    requireTenantId(input.tenant_id, 'DocumentModel.create');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `INSERT INTO documents (
        tenant_id, document_number, title, description, document_type, category,
        file_name, storage_path, file_size, mime_type, file_hash_sha256,
        owner_id, created_by, document_date, metadata, tags, confidentiality_level
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING *`,
      [
        input.tenant_id,
        input.document_number,
        input.title,
        input.description || null,
        input.document_type,
        input.category || null,
        input.file_name,
        input.storage_path || null,
        input.file_size || null,
        input.mime_type || null,
        input.file_hash_sha256 || null,
        input.owner_id || null,
        input.created_by,
        input.document_date || null,
        JSON.stringify(input.metadata || {}),
        input.tags || null,
        input.confidentiality_level || 'INTERNAL',
      ]
    );
    return result.rows[0];
  }

  /**
   * Update document
   */
  static async update(id: string, tenantId: string, input: UpdateDocumentInput): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.update');
    
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(input.category);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.keywords !== undefined) {
      fields.push(`keywords = $${paramIndex++}`);
      values.push(input.keywords);
    }
    if (input.document_date !== undefined) {
      fields.push(`document_date = $${paramIndex++}`);
      values.push(input.document_date);
    }
    if (input.expiration_date !== undefined) {
      fields.push(`expiration_date = $${paramIndex++}`);
      values.push(input.expiration_date);
    }
    if (input.updated_by !== undefined) {
      fields.push(`updated_by = $${paramIndex++}`);
      values.push(input.updated_by);
    }

    values.push(id);
    values.push(tenantId);

    const result: QueryResult<Document> = await db.query<Document>(
      `UPDATE documents 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Update OCR processing results
   */
  static async updateOCR(id: string, tenantId: string, input: DocumentOCRUpdate): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.updateOCR');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `UPDATE documents 
       SET ocr_processed = $1,
           ocr_text = $2,
           ocr_confidence = $3,
           ocr_engine = $4,
           ocr_processed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6 AND deleted_at IS NULL
       RETURNING *`,
      [
        input.ocr_processed,
        input.ocr_text || null,
        input.ocr_confidence || null,
        input.ocr_engine || null,
        id,
        tenantId,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Update DPI processing results
   */
  static async updateDPI(id: string, tenantId: string, input: DocumentDPIUpdate): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.updateDPI');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `UPDATE documents 
       SET dpi_processed = $1,
           dpi_resolution = $2,
           image_quality_score = $3,
           dpi_processed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5 AND deleted_at IS NULL
       RETURNING *`,
      [
        input.dpi_processed,
        input.dpi_resolution || null,
        input.image_quality_score || null,
        id,
        tenantId,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Update CPO (Quality Control) status
   */
  static async updateCPO(id: string, tenantId: string, input: DocumentCPOUpdate): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.updateCPO');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `UPDATE documents 
       SET status_cpo = $1,
           cpo_notes = COALESCE($2, cpo_notes),
           cpo_reviewer_id = COALESCE($3, cpo_reviewer_id),
           cpo_reviewed_at = CURRENT_TIMESTAMP,
           cpo_approval_required = COALESCE($4, cpo_approval_required),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6 AND deleted_at IS NULL
       RETURNING *`,
      [
        input.status_cpo,
        input.cpo_notes || null,
        input.cpo_reviewer_id || null,
        input.cpo_approval_required,
        id,
        tenantId,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Approve document CPO
   */
  static async approveCPO(id: string, tenantId: string, approvedBy: string): Promise<Document | null> {
    requireTenantId(tenantId, 'DocumentModel.approveCPO');
    
    const result: QueryResult<Document> = await db.query<Document>(
      `UPDATE documents 
       SET status_cpo = 'VERDE',
           cpo_approved_by = $1,
           cpo_approved_at = CURRENT_TIMESTAMP,
           cpo_approval_required = false,
           status = 'APPROVED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [approvedBy, id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Soft delete document
   */
  static async delete(id: string, tenantId: string, deletedBy?: string): Promise<boolean> {
    requireTenantId(tenantId, 'DocumentModel.delete');
    
    const result = await db.query(
      `UPDATE documents 
       SET deleted_at = CURRENT_TIMESTAMP,
           deleted_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [deletedBy || null, id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Count documents by tenant
   */
  static async countByTenant(tenantId: string, filters?: { status?: string; status_cpo?: string }): Promise<number> {
    requireTenantId(tenantId, 'DocumentModel.countByTenant');
    
    let query = `SELECT COUNT(*) as count FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.status_cpo) {
      query += ` AND status_cpo = $${paramIndex++}`;
      params.push(filters.status_cpo);
    }

    const result = await db.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Generate unique document number for tenant
   */
  static async generateDocumentNumber(tenantId: string, prefix: string = 'DOC'): Promise<string> {
    requireTenantId(tenantId, 'DocumentModel.generateDocumentNumber');
    
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM documents WHERE tenant_id = $1`,
      [tenantId]
    );
    const count = parseInt(result.rows[0].count, 10) + 1;
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${count.toString().padStart(6, '0')}`;
  }
}
