import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { parsePagination } from '../utils/pagination.js';
import { createGeneratedDocument, generatePetition, GeneratedDocumentValidationError } from '../services/generated-document.js';
import { GeneratedDocumentModel } from '../models/generated-document.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';

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
 * POST /generated-documents/petition
 * Generate a petition using Gemini AI from selected facts.
 * Calls generatePetition() which validates CPO status, fetches knowledge base, and invokes Gemini.
 */
router.post(
  '/petition',
  authenticate,
  requirePermission('documents:create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { petition_type, source_fact_ids } = req.body;

    if (!petition_type || !Array.isArray(source_fact_ids) || source_fact_ids.length === 0) {
      res.status(400).json({ success: false, error: 'petition_type and source_fact_ids are required' });
      return;
    }

    // Build additionalContext from known party/case data if provided in request body
    const { party_info, case_number, court, additional_context } = req.body as {
      party_info?: { author?: string; defendant?: string; cpf_cnpj?: string };
      case_number?: string;
      court?: string;
      additional_context?: string;
    };

    const contextParts: string[] = [];
    if (case_number) contextParts.push(`Número do processo: ${case_number}`);
    if (court)       contextParts.push(`Juízo/Tribunal: ${court}`);
    if (party_info?.author)    contextParts.push(`Autor/Requerente: ${party_info.author}`);
    if (party_info?.defendant) contextParts.push(`Réu/Requerido: ${party_info.defendant}`);
    if (party_info?.cpf_cnpj)  contextParts.push(`CPF/CNPJ do autor: ${party_info.cpf_cnpj}`);
    if (additional_context)    contextParts.push(additional_context);

    try {
      const result = await generatePetition({
        tenantId,
        sourceFactIds: source_fact_ids,
        petitionType: petition_type,
        generatedBy: userId,
        additionalContext: contextParts.length > 0 ? contextParts.join('\n') : undefined,
      });

      // Post-process: substitute known party placeholders from party_info
      let content = result.content;
      if (party_info?.author)    content = content.replace(/\[NOME DO AUTOR\]/gi, party_info.author);
      if (party_info?.defendant) content = content.replace(/\[NOME DO R[ÉE]U\]/gi, party_info.defendant);
      if (party_info?.cpf_cnpj)  content = content.replace(/\[CPF\/CNPJ\]/gi, party_info.cpf_cnpj);
      if (case_number)           content = content.replace(/\[N[ÚU]MERO DO PROCESSO\]/gi, case_number);

      res.status(201).json({
        success: true,
        data: {
          id: result.id,
          content,
          petition_type: petition_type,
          source_facts_count: source_fact_ids.length,
          placeholders_substituted: contextParts.length > 0,
        },
      });
    } catch (err) {
      if (err instanceof GeneratedDocumentValidationError) {
        res.status(400).json({ success: false, error: err.message, code: err.code });
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

/**
 * POST /generated-documents/:id/submit-review
 * Submit a generated document for review. Uses req.context.tenant_id only.
 */
router.post(
  '/:id/submit-review',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const doc = await GeneratedDocumentModel.submitForReview(req.params.id, tenantId);
    res.json({ success: true, data: doc });
  })
);

/**
 * POST /generated-documents/:id/approve
 * Approve a generated document. Uses req.context.tenant_id only.
 */
router.post(
  '/:id/approve',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const doc = await GeneratedDocumentModel.approve(req.params.id, tenantId, userId);
    res.json({ success: true, data: doc });
  })
);

/**
 * POST /generated-documents/:id/reject
 * Reject a generated document with an optional reason. Uses req.context.tenant_id only.
 */
router.post(
  '/:id/reject',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const reason = req.body?.reason || '';
    const doc = await GeneratedDocumentModel.reject(req.params.id, tenantId, userId, reason);
    res.json({ success: true, data: doc });
  })
);

export default router;
