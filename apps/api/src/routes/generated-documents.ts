import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware';
import { getTenantContext } from '../utils/tenant-context';
import { parsePagination } from '../utils/pagination';
import { createGeneratedDocument, GeneratedDocumentValidationError } from '../services/generated-document';
import { GeneratedDocumentModel } from '../models/generated-document';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit';

const router = Router();

const createGeneratedDocumentSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    source_fact_ids: z.array(z.string().uuid()).min(1),
  }),
});

/**
 * POST /generated-documents
 * Create a generated document from source facts.
 * Blocked if any required fact is missing or any source document is not CPO-approved.
 * Uses req.context.tenant_id only.
 */
router.post(
  '/',
  authenticate,
  requirePermission('documents:create'),
  validateRequest(createGeneratedDocumentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { content, source_fact_ids } = req.body;

    try {
      const { id } = await createGeneratedDocument(tenantId, content, userId, source_fact_ids);

      await AuditService.log({
        tenant_id: tenantId,
        event_type: 'generated_document.create',
        event_category: AuditEventCategory.DATA_MODIFICATION,
        action: AuditAction.CREATE,
        user_id: userId,
        user_email: req.user!.email,
        user_role: req.context?.role,
        resource_type: 'generated_document',
        resource_id: id,
        description: 'Generated document created',
        details: { source_fact_count: source_fact_ids.length },
        ip_address: req.ip ?? req.socket?.remoteAddress,
        user_agent: req.get('user-agent'),
        request_id: req.headers['x-request-id'] as string | undefined,
        session_id: req.headers['x-session-id'] as string | undefined,
        success: true,
        compliance_flags: ['legal'],
        retention_category: 'legal',
      });

      res.status(201).json({
        success: true,
        data: { id },
      });
    } catch (err) {
      if (err instanceof GeneratedDocumentValidationError) {
        res.status(400).json({
          success: false,
          error: err.message,
          code: err.code,
        });
        return;
      }
      throw err;
    }
  })
);

/**
 * GET /generated-documents
 * List generated documents for the tenant. Uses req.context.tenant_id only.
 */
router.get(
  '/',
  authenticate,
  requirePermission('documents:list'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { limit, offset } = parsePagination(req.query, 50, 100);

    const list = await GeneratedDocumentModel.listByTenant(tenantId, { limit, offset });

    res.json({
      success: true,
      data: {
        generated_documents: list.map((g) => ({
          id: g.id,
          content_preview: g.content.slice(0, 200) + (g.content.length > 200 ? '...' : ''),
          generated_by: g.generated_by,
          source_fact_count: g.source_fact_ids.length,
          created_at: g.created_at,
        })),
        pagination: { limit, offset },
      },
    });
  })
);

export default router;
