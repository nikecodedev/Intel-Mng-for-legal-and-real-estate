import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * Party extracted from legal document
 */
export interface ExtractedParty {
  type: 'plaintiff' | 'defendant' | 'witness' | 'lawyer' | 'judge' | 'other';
  name: string;
  cpf_cnpj?: string;
  role?: string;
  oab?: string; // For lawyers
}

/**
 * Monetary value extracted from legal document
 */
export interface ExtractedMonetaryValue {
  type: 'causa' | 'condenacao' | 'honorarios' | 'custas' | 'multa' | 'other';
  value: number;
  currency: string;
  description?: string;
}

/**
 * Date extracted from legal document
 */
export interface ExtractedDate {
  type: 'distribuicao' | 'sentenca' | 'vencimento' | 'citacao' | 'audiencia' | 'other';
  date: string; // ISO date string
  description?: string;
}

/**
 * Document extraction model
 */
export interface DocumentExtraction {
  id: string;
  tenant_id: string;
  document_id: string;
  
  // Extracted legal fields
  process_number: string | null;
  court: string | null;
  court_type: string | null;
  court_state: string | null;
  
  // Parties
  parties: ExtractedParty[];
  
  // Monetary values
  monetary_values: ExtractedMonetaryValue[];
  total_monetary_value: number | null;
  
  // Dates
  extracted_dates: ExtractedDate[];
  
  // Full text
  extracted_text: string | null;
  extracted_text_hash: string | null;
  
  // Metadata
  extraction_engine: string;
  extraction_version: string | null;
  extraction_language: string;
  
  // Confidence
  overall_confidence: number | null;
  field_confidences: Record<string, number>;
  
  // Raw data
  raw_ocr_output: Record<string, unknown> | null;
  extraction_warnings: string[] | null;
  
  // Processing info
  processed_by: string | null;
  processed_at: Date;
  reprocessed_count: number;
  last_reprocessed_at: Date | null;
  
  // Validation
  validation_status: 'PENDING' | 'VALIDATED' | 'REJECTED' | 'NEEDS_REVIEW';
  validated_by: string | null;
  validated_at: Date | null;
  validation_notes: string | null;
  
  // Manual corrections
  manual_corrections: Record<string, unknown>;
  corrections_by: string | null;
  corrections_at: Date | null;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

export interface CreateExtractionInput {
  tenant_id: string;
  document_id: string;
  process_number?: string;
  court?: string;
  court_type?: string;
  court_state?: string;
  parties?: ExtractedParty[];
  monetary_values?: ExtractedMonetaryValue[];
  extracted_dates?: ExtractedDate[];
  extracted_text?: string;
  extracted_text_hash?: string;
  extraction_engine?: string;
  extraction_version?: string;
  overall_confidence?: number;
  field_confidences?: Record<string, number>;
  raw_ocr_output?: Record<string, unknown>;
  extraction_warnings?: string[];
  processed_by?: string;
}

export interface UpdateExtractionInput {
  process_number?: string;
  court?: string;
  court_type?: string;
  court_state?: string;
  parties?: ExtractedParty[];
  monetary_values?: ExtractedMonetaryValue[];
  extracted_dates?: ExtractedDate[];
  overall_confidence?: number;
  field_confidences?: Record<string, number>;
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
 * Calculate total monetary value from array
 */
function calculateTotalMonetaryValue(values: ExtractedMonetaryValue[]): number {
  return values.reduce((sum, v) => sum + (v.value || 0), 0);
}

/**
 * DocumentExtraction model - Database operations with tenant isolation
 */
export class DocumentExtractionModel {
  /**
   * Find extraction by ID
   */
  static async findById(id: string, tenantId: string): Promise<DocumentExtraction | null> {
    requireTenantId(tenantId, 'DocumentExtractionModel.findById');
    
    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `SELECT * FROM document_extractions 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find extraction by document ID
   */
  static async findByDocumentId(documentId: string, tenantId: string): Promise<DocumentExtraction | null> {
    requireTenantId(tenantId, 'DocumentExtractionModel.findByDocumentId');
    
    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `SELECT * FROM document_extractions 
       WHERE document_id = $1 AND tenant_id = $2`,
      [documentId, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find extractions by process number
   */
  static async findByProcessNumber(processNumber: string, tenantId: string): Promise<DocumentExtraction[]> {
    requireTenantId(tenantId, 'DocumentExtractionModel.findByProcessNumber');
    
    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `SELECT * FROM document_extractions 
       WHERE process_number = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [processNumber, tenantId]
    );
    return result.rows;
  }

  /**
   * List all extractions for a tenant
   */
  static async findAllByTenant(
    tenantId: string,
    options?: {
      validation_status?: string;
      min_confidence?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<DocumentExtraction[]> {
    requireTenantId(tenantId, 'DocumentExtractionModel.findAllByTenant');
    
    let query = `SELECT * FROM document_extractions WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options?.validation_status) {
      query += ` AND validation_status = $${paramIndex++}`;
      params.push(options.validation_status);
    }

    if (options?.min_confidence !== undefined) {
      query += ` AND overall_confidence >= $${paramIndex++}`;
      params.push(options.min_confidence);
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

    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(query, params);
    return result.rows;
  }

  /**
   * Create new extraction
   */
  static async create(input: CreateExtractionInput): Promise<DocumentExtraction> {
    requireTenantId(input.tenant_id, 'DocumentExtractionModel.create');
    
    const parties = input.parties || [];
    const monetaryValues = input.monetary_values || [];
    const extractedDates = input.extracted_dates || [];
    const totalMonetaryValue = calculateTotalMonetaryValue(monetaryValues);

    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `INSERT INTO document_extractions (
        tenant_id, document_id,
        process_number, court, court_type, court_state,
        parties, monetary_values, total_monetary_value, extracted_dates,
        extracted_text, extracted_text_hash,
        extraction_engine, extraction_version, extraction_language,
        overall_confidence, field_confidences,
        raw_ocr_output, extraction_warnings,
        processed_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING *`,
      [
        input.tenant_id,
        input.document_id,
        input.process_number || null,
        input.court || null,
        input.court_type || null,
        input.court_state || null,
        JSON.stringify(parties),
        JSON.stringify(monetaryValues),
        totalMonetaryValue || null,
        JSON.stringify(extractedDates),
        input.extracted_text || null,
        input.extracted_text_hash || null,
        input.extraction_engine || 'tesseract',
        input.extraction_version || null,
        'por',
        input.overall_confidence || null,
        JSON.stringify(input.field_confidences || {}),
        input.raw_ocr_output ? JSON.stringify(input.raw_ocr_output) : null,
        input.extraction_warnings || null,
        input.processed_by || null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update extraction
   */
  static async update(id: string, tenantId: string, input: UpdateExtractionInput): Promise<DocumentExtraction | null> {
    requireTenantId(tenantId, 'DocumentExtractionModel.update');
    
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.process_number !== undefined) {
      fields.push(`process_number = $${paramIndex++}`);
      values.push(input.process_number);
    }
    if (input.court !== undefined) {
      fields.push(`court = $${paramIndex++}`);
      values.push(input.court);
    }
    if (input.court_type !== undefined) {
      fields.push(`court_type = $${paramIndex++}`);
      values.push(input.court_type);
    }
    if (input.court_state !== undefined) {
      fields.push(`court_state = $${paramIndex++}`);
      values.push(input.court_state);
    }
    if (input.parties !== undefined) {
      fields.push(`parties = $${paramIndex++}`);
      values.push(JSON.stringify(input.parties));
    }
    if (input.monetary_values !== undefined) {
      fields.push(`monetary_values = $${paramIndex++}`);
      values.push(JSON.stringify(input.monetary_values));
      fields.push(`total_monetary_value = $${paramIndex++}`);
      values.push(calculateTotalMonetaryValue(input.monetary_values));
    }
    if (input.extracted_dates !== undefined) {
      fields.push(`extracted_dates = $${paramIndex++}`);
      values.push(JSON.stringify(input.extracted_dates));
    }
    if (input.overall_confidence !== undefined) {
      fields.push(`overall_confidence = $${paramIndex++}`);
      values.push(input.overall_confidence);
    }
    if (input.field_confidences !== undefined) {
      fields.push(`field_confidences = $${paramIndex++}`);
      values.push(JSON.stringify(input.field_confidences));
    }

    values.push(id);
    values.push(tenantId);

    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `UPDATE document_extractions 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Update validation status
   */
  static async updateValidation(
    id: string,
    tenantId: string,
    status: 'PENDING' | 'VALIDATED' | 'REJECTED' | 'NEEDS_REVIEW',
    validatedBy: string,
    notes?: string
  ): Promise<DocumentExtraction | null> {
    requireTenantId(tenantId, 'DocumentExtractionModel.updateValidation');
    
    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `UPDATE document_extractions 
       SET validation_status = $1,
           validated_by = $2,
           validated_at = CURRENT_TIMESTAMP,
           validation_notes = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [status, validatedBy, notes || null, id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Apply manual corrections
   */
  static async applyCorrections(
    id: string,
    tenantId: string,
    corrections: Record<string, unknown>,
    correctedBy: string
  ): Promise<DocumentExtraction | null> {
    requireTenantId(tenantId, 'DocumentExtractionModel.applyCorrections');
    
    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `UPDATE document_extractions 
       SET manual_corrections = manual_corrections || $1,
           corrections_by = $2,
           corrections_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [JSON.stringify(corrections), correctedBy, id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark for reprocessing
   */
  static async markForReprocessing(id: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'DocumentExtractionModel.markForReprocessing');
    
    const result = await db.query(
      `UPDATE document_extractions 
       SET validation_status = 'PENDING',
           reprocessed_count = reprocessed_count + 1,
           last_reprocessed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete extraction
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'DocumentExtractionModel.delete');
    
    const result = await db.query(
      `DELETE FROM document_extractions 
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Search extractions by text
   */
  static async searchByText(
    tenantId: string,
    searchText: string,
    limit: number = 20
  ): Promise<DocumentExtraction[]> {
    requireTenantId(tenantId, 'DocumentExtractionModel.searchByText');
    
    const result: QueryResult<DocumentExtraction> = await db.query<DocumentExtraction>(
      `SELECT * FROM document_extractions 
       WHERE tenant_id = $1 
         AND to_tsvector('portuguese', COALESCE(extracted_text, '')) @@ plainto_tsquery('portuguese', $2)
       ORDER BY ts_rank(to_tsvector('portuguese', COALESCE(extracted_text, '')), plainto_tsquery('portuguese', $2)) DESC
       LIMIT $3`,
      [tenantId, searchText, limit]
    );
    return result.rows;
  }
}
