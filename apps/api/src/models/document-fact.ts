import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * Bounding box in normalized coordinates (e.g. 0-1 or page-relative)
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentFact {
  id: string;
  tenant_id: string;
  document_id: string;
  fact_type: string;
  fact_value: string;
  page_number: number | null;
  bounding_box: BoundingBox | null;
  confidence_score: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDocumentFactInput {
  tenant_id: string;
  document_id: string;
  fact_type: string;
  fact_value: string;
  page_number?: number;
  bounding_box?: BoundingBox;
  confidence_score?: number;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function parseBoundingBox(val: unknown): BoundingBox | null {
  if (!val || typeof val !== 'object') return null;
  const o = val as Record<string, unknown>;
  if (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number'
  ) {
    return { x: o.x, y: o.y, width: o.width, height: o.height };
  }
  return null;
}

function mapRow(row: any): DocumentFact {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    document_id: row.document_id as string,
    fact_type: row.fact_type as string,
    fact_value: row.fact_value as string,
    page_number: row.page_number != null ? Number(row.page_number) : null,
    bounding_box: parseBoundingBox(row.bounding_box),
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export class DocumentFactModel {
  static async findById(id: string, tenantId: string): Promise<DocumentFact | null> {
    requireTenantId(tenantId, 'DocumentFactModel.findById');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM document_facts WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  static async findByDocumentId(documentId: string, tenantId: string): Promise<DocumentFact[]> {
    requireTenantId(tenantId, 'DocumentFactModel.findByDocumentId');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM document_facts WHERE document_id = $1 AND tenant_id = $2 ORDER BY fact_type, created_at`,
      [documentId, tenantId]
    );
    return result.rows.map(mapRow);
  }

  static async findByIds(ids: string[], tenantId: string): Promise<DocumentFact[]> {
    requireTenantId(tenantId, 'DocumentFactModel.findByIds');
    if (ids.length === 0) return [];
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM document_facts WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [ids, tenantId]
    );
    return result.rows.map(mapRow);
  }

  static async create(input: CreateDocumentFactInput): Promise<DocumentFact> {
    requireTenantId(input.tenant_id, 'DocumentFactModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO document_facts (
        tenant_id, document_id, fact_type, fact_value,
        page_number, bounding_box, confidence_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.tenant_id,
        input.document_id,
        input.fact_type,
        input.fact_value,
        input.page_number ?? null,
        input.bounding_box ? JSON.stringify(input.bounding_box) : null,
        input.confidence_score ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  }

  static async createMany(inputs: CreateDocumentFactInput[]): Promise<DocumentFact[]> {
    if (inputs.length === 0) return [];
    const tenantId = inputs[0]?.tenant_id;
    requireTenantId(tenantId, 'DocumentFactModel.createMany');
    const results: DocumentFact[] = [];
    for (const input of inputs) {
      results.push(await this.create(input));
    }
    return results;
  }

  static async deleteByDocumentId(documentId: string, tenantId: string): Promise<number> {
    requireTenantId(tenantId, 'DocumentFactModel.deleteByDocumentId');
    const result = await db.query(
      `DELETE FROM document_facts WHERE document_id = $1 AND tenant_id = $2`,
      [documentId, tenantId]
    );
    return result.rowCount ?? 0;
  }
}
