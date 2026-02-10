import { Router, Request, Response } from 'express';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError } from '../utils/errors.js';
import { DocumentFactModel } from '../models/document-fact.js';
import { DocumentModel } from '../models/document.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';

const router = Router();

/**
 * GET /facts/:id/source
 * Get source document and location for a fact (proof lineage / jump-back).
 * All queries use req.context.tenant_id only. No downloads.
 */
router.get(
  '/:id/source',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.context!.tenant_id;
    const userId = req.context!.user_id;
    const { id: factId } = req.params;

    const fact = await DocumentFactModel.findById(factId, tenantId);
    if (!fact) {
      throw new NotFoundError('Fact');
    }

    const sourceDocument = await DocumentModel.findById(fact.document_id, tenantId);
    if (!sourceDocument) {
      throw new NotFoundError('Source document');
    }

    // Audit: fact jump-back
    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'fact.jump_back',
      event_category: AuditEventCategory.DATA_ACCESS,
      action: AuditAction.READ,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'document_fact',
      resource_id: factId,
      target_resource_id: fact.document_id,
      description: 'Fact jump-back to source document',
      details: {
        fact_type: fact.fact_type,
        document_id: fact.document_id,
        page_number: fact.page_number,
      },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['legal'],
      retention_category: 'legal',
    });

    res.json({
      success: true,
      data: {
        fact: {
          id: fact.id,
          fact_type: fact.fact_type,
          fact_value: fact.fact_value,
          page_number: fact.page_number,
          bounding_box: fact.bounding_box,
          confidence_score: fact.confidence_score,
        },
        source_document: {
          id: sourceDocument.id,
          document_number: sourceDocument.document_number,
          title: sourceDocument.title,
          status_cpo: sourceDocument.status_cpo,
          ocr_processed: sourceDocument.ocr_processed,
        },
      },
    });
  })
);

export default router;
