import { DocumentFactModel } from '../models/document-fact.js';
import { GeneratedDocumentModel } from '../models/generated-document.js';
import { DocumentModel } from '../models/document.js';
import { TenantRequiredError } from '../utils/errors.js';

export class GeneratedDocumentValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'MISSING_FACT' | 'SOURCE_NOT_CPO_APPROVED'
  ) {
    super(message);
    this.name = 'GeneratedDocumentValidationError';
  }
}

/**
 * Validate that all required fact IDs exist and that every source document
 * is CPO-approved. Use req.context.tenant_id only.
 */
export async function validateFactsForGeneration(
  tenantId: string,
  sourceFactIds: string[]
): Promise<{ valid: boolean; missingFactIds: string[]; nonApprovedDocumentIds: string[] }> {
  if (!tenantId) {
    throw new TenantRequiredError('validateFactsForGeneration');
  }
  const missingFactIds: string[] = [];
  const nonApprovedDocumentIds: string[] = [];

  if (sourceFactIds.length === 0) {
    return { valid: false, missingFactIds: [], nonApprovedDocumentIds: [] };
  }

  const facts = await DocumentFactModel.findByIds(sourceFactIds, tenantId);
  const foundIds = new Set(facts.map((f) => f.id));
  for (const id of sourceFactIds) {
    if (!foundIds.has(id)) {
      missingFactIds.push(id);
    }
  }

  const documentIds = [...new Set(facts.map((f) => f.document_id))];
  for (const docId of documentIds) {
    const doc = await DocumentModel.findById(docId, tenantId);
    if (!doc) {
      nonApprovedDocumentIds.push(docId);
      continue;
    }
    const isCpoApproved = doc.status_cpo === 'VERDE' || doc.cpo_approved_at != null;
    if (!isCpoApproved) {
      nonApprovedDocumentIds.push(docId);
    }
  }

  const valid = missingFactIds.length === 0 && nonApprovedDocumentIds.length === 0;
  return { valid, missingFactIds, nonApprovedDocumentIds };
}

/**
 * Create a generated document. Blocks if any required fact is missing or
 * any source document is not CPO-approved. Use req.context.tenant_id only.
 */
export async function createGeneratedDocument(
  tenantId: string,
  content: string,
  generatedBy: string,
  sourceFactIds: string[]
): Promise<{ id: string }> {
  if (!tenantId) {
    throw new TenantRequiredError('createGeneratedDocument');
  }

  const validation = await validateFactsForGeneration(tenantId, sourceFactIds);
  if (!validation.valid) {
    if (validation.missingFactIds.length > 0) {
      throw new GeneratedDocumentValidationError(
        `Cannot generate document: required facts not found: ${validation.missingFactIds.join(', ')}`,
        'MISSING_FACT'
      );
    }
    if (validation.nonApprovedDocumentIds.length > 0) {
      throw new GeneratedDocumentValidationError(
        `Cannot generate document: source documents are not CPO-approved: ${validation.nonApprovedDocumentIds.join(', ')}`,
        'SOURCE_NOT_CPO_APPROVED'
      );
    }
  }

  const gen = await GeneratedDocumentModel.create({
    tenant_id: tenantId,
    content,
    generated_by: generatedBy,
    source_fact_ids: sourceFactIds,
  });
  return { id: gen.id };
}
