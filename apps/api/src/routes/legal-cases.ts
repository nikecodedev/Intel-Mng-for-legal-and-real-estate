import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError } from '../utils/errors.js';
import { db } from '../models/database.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Types
// ============================================

interface LegalCaseRow {
  id: string;
  tenant_id: string;
  case_number: string;
  title: string;
  client_name: string | null;
  status: string;
  qg4_score: number | null;
  assigned_lawyer_id: string | null;
  deadline: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================
// Schema definitions
// ============================================

const createCaseSchema = z.object({
  body: z.object({
    case_number: z.string().min(1).max(100),
    title: z.string().min(1),
    client_name: z.string().optional(),
    status: z.string().optional(),
    assigned_lawyer_id: z.string().uuid().optional(),
    deadline: z.string().date().optional(),
    description: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

const createFPDNSchema = z.object({
  body: z.object({
    fact_type: z.string().min(1),
    fact_value: z.string().min(1),
    document_id: z.string().uuid(),
    page_number: z.number().int().positive().optional(),
    confidence_score: z.number().min(0).max(100).optional(),
  }),
});

// ============================================
// Legal Cases Routes
// ============================================

/**
 * GET /legal-cases
 * List legal cases for tenant
 */
router.get(
  '/',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const status = req.query.status as string | undefined;

    let query = `SELECT * FROM legal_cases WHERE tenant_id = $1 AND deleted_at IS NULL`;
    const params: any[] = [tenantContext.tenantId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    // Count total
    const countResult = await db.query<{ count: string }>(
      query.replace('SELECT *', 'SELECT COUNT(*) as count'),
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      cases: result.rows,
      total,
      limit,
      offset,
    });
  })
);

/**
 * POST /legal-cases
 * Create a new legal case
 */
router.post(
  '/',
  authenticate,
  requirePermission('documents:create'),
  validateRequest(createCaseSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const { case_number, title, client_name, status, assigned_lawyer_id, deadline, description, metadata } = req.body;

    const result = await db.query<LegalCaseRow>(
      `INSERT INTO legal_cases (tenant_id, case_number, title, client_name, status, assigned_lawyer_id, deadline, description, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantContext.tenantId,
        case_number,
        title,
        client_name || null,
        status || 'ABERTO',
        assigned_lawyer_id || null,
        deadline || null,
        description || null,
        JSON.stringify(metadata || {}),
        userId,
      ]
    );

    const legalCase = result.rows[0];

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'legal_case.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'legal_case',
      resourceId: legalCase.id,
      description: `Created legal case ${case_number}: ${title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      case: legalCase,
    });
  })
);

/**
 * GET /legal-cases/:id
 * Get a single legal case
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const result = await db.query(
      `SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantContext.tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Legal case');
    }

    res.json({
      success: true,
      case: result.rows[0],
    });
  })
);

/**
 * GET /legal-cases/:id/fpdn
 * List FPDN (Ficha de Ponto de Dados Normalizados) entries for a case
 */
router.get(
  '/:id/fpdn',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    // Verify case exists
    const caseResult = await db.query(
      `SELECT id FROM legal_cases WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantContext.tenantId]
    );
    if (caseResult.rows.length === 0) {
      throw new NotFoundError('Legal case');
    }

    // Query document_facts linked to this case
    const result = await db.query(
      `SELECT df.* FROM document_facts df
       WHERE df.tenant_id = $1 AND df.legal_case_id = $2
       ORDER BY df.created_at DESC`,
      [tenantContext.tenantId, id]
    );

    res.json({
      success: true,
      fpdn_entries: result.rows,
      total: result.rows.length,
    });
  })
);

/**
 * POST /legal-cases/:id/fpdn
 * Create an FPDN entry for a case
 */
router.post(
  '/:id/fpdn',
  authenticate,
  requirePermission('documents:create'),
  validateRequest(createFPDNSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    // Verify case exists
    const caseResult = await db.query(
      `SELECT id FROM legal_cases WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantContext.tenantId]
    );
    if (caseResult.rows.length === 0) {
      throw new NotFoundError('Legal case');
    }

    const { fact_type, fact_value, document_id, page_number, confidence_score } = req.body;

    const result = await db.query(
      `INSERT INTO document_facts (tenant_id, document_id, fact_type, fact_value, page_number, confidence_score, legal_case_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantContext.tenantId,
        document_id,
        fact_type,
        fact_value,
        page_number || null,
        confidence_score || null,
        id,
      ]
    );

    const insertedFact = result.rows[0] as { id: string };

    // Spec Omission #5: Compute and store immutable SHA-256 prova_hash
    try {
      const timestamp = new Date().toISOString();
      const prova_hash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ fact_id: insertedFact.id, proof_doc_id: document_id, tenant_id: tenantContext.tenantId, timestamp }))
        .digest('hex');
      await db.query(
        `UPDATE document_facts SET prova_hash = $1 WHERE id = $2`,
        [prova_hash, insertedFact.id]
      );
      (insertedFact as Record<string, unknown>).prova_hash = prova_hash;
    } catch (hashErr) {
      logger.warn('prova_hash update failed (column may not exist yet — run migration 039)', { error: hashErr });
    }

    res.status(201).json({
      success: true,
      fpdn_entry: insertedFact,
    });
  })
);

/**
 * GET /legal-cases/:id/qg4
 * Get QG4 score data for a case
 */
router.get(
  '/:id/qg4',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const result = await db.query<LegalCaseRow>(
      `SELECT id, case_number, title, qg4_score, metadata FROM legal_cases
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantContext.tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Legal case');
    }

    const legalCase = result.rows[0];

    // Fetch related quality gate results if table exists
    let qualityGate = null;
    try {
      const qgResult = await db.query(
        `SELECT * FROM quality_gate_results
         WHERE tenant_id = $1 AND entity_id = $2 AND gate_type = 'QG4'
         ORDER BY created_at DESC LIMIT 1`,
        [tenantContext.tenantId, id]
      );
      qualityGate = qgResult.rows[0] || null;
    } catch {
      // quality_gate_results table may not exist yet
    }

    res.json({
      success: true,
      case_id: legalCase.id,
      case_number: legalCase.case_number,
      title: legalCase.title,
      qg4_score: legalCase.qg4_score,
      quality_gate: qualityGate,
    });
  })
);

/**
 * POST /legal-cases/:id/qg4/calculate
 * Calculate QG4 score for a case
 */
router.post(
  '/:id/qg4/calculate',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify case exists
    const caseResult = await db.query<LegalCaseRow>(
      `SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantContext.tenantId]
    );
    if (caseResult.rows.length === 0) {
      throw new NotFoundError('Legal case');
    }

    const legalCase = caseResult.rows[0];

    // Calculate QG4 score based on document facts completeness
    const factsResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM document_facts
       WHERE tenant_id = $1 AND legal_case_id = $2`,
      [tenantContext.tenantId, id]
    );
    const factsCount = parseInt(factsResult.rows[0]?.count || '0', 10);

    // Spec QG4 formula (Divergence #2):
    // rastreabilidade = facts completeness: min(factsCount / 10, 1.0) * 100
    // fundamentacao = (hasDeadline ? 50 : 0) + (hasDescription ? 50 : 0)
    // coerencia = (hasLawyer ? 50 : 0) + (hasClient ? 50 : 0)
    // Final: Math.round((rastreabilidade * 0.70) + (fundamentacao * 0.20) + (coerencia * 0.10))
    const rastreabilidade = Math.min(factsCount / 10, 1.0) * 100;
    const fundamentacao = (legalCase.deadline ? 50 : 0) + (legalCase.description ? 50 : 0);
    const coerencia = (legalCase.assigned_lawyer_id ? 50 : 0) + (legalCase.client_name ? 50 : 0);
    const qg4Score = Math.round((rastreabilidade * 0.70) + (fundamentacao * 0.20) + (coerencia * 0.10));

    // Legacy breakdown fields kept for compatibility
    const factScore = Math.round(rastreabilidade);
    const hasDeadline = legalCase.deadline ? 50 : 0;
    const hasDescription = legalCase.description ? 50 : 0;
    const hasLawyer = legalCase.assigned_lawyer_id ? 50 : 0;
    const hasClient = legalCase.client_name ? 50 : 0;
    const baseScore = 0;

    // Update the case with the new score
    await db.query(
      `UPDATE legal_cases SET qg4_score = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3`,
      [qg4Score, id, tenantContext.tenantId]
    );

    // Record quality gate result
    try {
      await db.query(
        `INSERT INTO quality_gate_results (tenant_id, entity_id, entity_type, gate_type, score, max_score, passed, details, evaluated_by)
         VALUES ($1, $2, 'legal_case', 'QG4', $3, 100, $4, $5, $6)`,
        [
          tenantContext.tenantId,
          id,
          qg4Score,
          qg4Score >= 90,
          JSON.stringify({
            facts_count: factsCount,
            rastreabilidade: Math.round(rastreabilidade),
            fundamentacao,
            coerencia,
            formula: 'rastreabilidade*0.70 + fundamentacao*0.20 + coerencia*0.10',
            has_deadline: !!legalCase.deadline,
            has_description: !!legalCase.description,
            has_lawyer: !!legalCase.assigned_lawyer_id,
            has_client: !!legalCase.client_name,
          }),
          userId,
        ]
      );
    } catch (err) {
      logger.warn('Failed to record QG4 result in quality_gate_results', { error: err });
    }

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'legal_case.qg4.calculate',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'legal_case',
      resourceId: id,
      description: `Calculated QG4 score ${qg4Score} for case ${legalCase.case_number}`,
      details: { qg4_score: qg4Score, passed: qg4Score >= 90 },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    // Omission #6: Auto-indexação vetorial na Base de Conhecimento quando QG4 >= 90
    if (qg4Score >= 90) {
      try {
        await db.query(
          `INSERT INTO knowledge_entries (tenant_id, title, content, entry_type, status, tags, created_by)
           VALUES ($1, $2, $3, 'CASE_PRECEDENT', 'ATIVA', $4, $5)
           ON CONFLICT DO NOTHING`,
          [
            tenantContext.tenantId,
            `Caso: ${legalCase.title}`,
            legalCase.description || legalCase.title,
            JSON.stringify(['qg4_approved', 'auto_indexed']),
            legalCase.created_by || userId,
          ]
        );
        logger.info('Auto-indexed case in knowledge base', { caseId: id, score: qg4Score });
      } catch (kbErr) { logger.warn('Knowledge auto-index failed', { error: kbErr }); }
    }

    // Emit workflow event: QG4 scored — triggers ADVOGADO_SENIOR escalation if < 0.90
    try {
      const { runWorkflow } = await import('../services/workflow-engine.js');
      await runWorkflow({
        tenantId: tenantContext.tenantId,
        eventType: 'legal_case.qg4.scored',
        payload: {
          case_id: id,
          case_number: legalCase.case_number,
          score: qg4Score / 100, // normalize 0–1 for condition matching
          passed: qg4Score >= 90,
        },
        userId,
        userEmail: req.user!.email,
        userRole: tenantContext.role,
        request: req,
      });

      // Spec Omission #11: emit qg4.score.low if score < 90 (threshold 90)
      if (qg4Score < 90) {
        await runWorkflow({
          tenantId: tenantContext.tenantId,
          eventType: 'qg4.score.low',
          payload: {
            case_id: id,
            score: qg4Score,
            threshold: 90,
          },
          userId,
          userEmail: req.user!.email,
          userRole: tenantContext.role,
          request: req,
        });
      }
    } catch (wfErr) {
      logger.warn('Workflow event legal_case.qg4.scored failed', { error: wfErr });
    }

    res.json({
      success: true,
      case_id: id,
      qg4_score: qg4Score,
      passed: qg4Score >= 90,
      components: {
        rastreabilidade: Math.round(rastreabilidade),
        fundamentacao,
        coerencia,
        formula: 'rastreabilidade*0.70 + fundamentacao*0.20 + coerencia*0.10',
      },
      breakdown: {
        base_score: baseScore,
        fact_score: factScore,
        facts_count: factsCount,
        has_deadline: hasDeadline,
        has_description: hasDescription,
        has_lawyer: hasLawyer,
        has_client: hasClient,
      },
    });
  })
);

// ============================================
// QG4 Override
// ============================================

/**
 * POST /legal-cases/:id/qg4/override
 * Override QG4 gate — bypasses score threshold with OWNER/REVISOR auth + TOTP OTP.
 * Creates an audited override_event so the bypass is fully traceable.
 */
const qg4OverrideSchema = z.object({
  body: z.object({
    otp_code: z.string().length(6, 'Código OTP deve ter exatamente 6 dígitos'),
    justification: z.string().min(10, 'Justificativa obrigatória (mínimo 10 caracteres)'),
  }),
});

router.post(
  '/:id/qg4/override',
  authenticate,
  requirePermission('legal_cases:override'),
  validateRequest(qg4OverrideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { otp_code, justification } = req.body;
    const tenantContext = getTenantContext(req);

    // Fetch case
    const caseResult = await db.query(
      `SELECT id, case_number, title, qg4_score, tenant_id FROM legal_cases WHERE id = $1 AND tenant_id = $2`,
      [id, tenantContext.tenantId]
    );
    if (caseResult.rows.length === 0) throw new NotFoundError('Case');
    const legalCase = caseResult.rows[0] as { id: string; case_number: string; title: string; qg4_score: number | null; tenant_id: string };

    // Verify OTP against user's MFA secret
    const userId = req.user!.id;
    const userRow = await db.query(
      'SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const mfaRow = userRow.rows[0] as { mfa_secret: string | null; mfa_enabled: boolean } | undefined;

    if (!mfaRow?.mfa_secret) {
      res.status(400).json({
        success: false,
        error: 'MFA não configurado. Configure o autenticador antes de usar o override.',
      });
      return;
    }

    // Import verifySync from otplib at runtime (ESM dynamic import)
    const { verifySync } = await import('otplib');
    const otpValid = verifySync({ token: otp_code, secret: mfaRow.mfa_secret });

    if (!otpValid) {
      logger.warn('QG4 override OTP invalid', { userId, caseId: id });
      res.status(401).json({ success: false, error: 'Código OTP inválido ou expirado.' });
      return;
    }

    // Create audited override_event in DB
    const overrideResult = await db.query(
      `INSERT INTO override_events
         (tenant_id, user_id, user_email, override_type, target_entity, target_id, otp_verified, reason, justification, metadata)
       VALUES ($1, $2, $3, 'qg4_override', 'legal_case', $4, TRUE, $5, $5, $6)
       RETURNING id`,
      [
        tenantContext.tenantId,
        userId,
        req.user!.email ?? '',
        id,
        justification,
        JSON.stringify({ qg4_score: legalCase.qg4_score, case_number: legalCase.case_number }),
      ]
    ).catch(async () => {
      // fall back to audit log only if schema differs
      return { rows: [{ id: 'audit-only' }] };
    });

    const overrideId = (overrideResult.rows[0] as { id: string }).id;

    // Mandatory audit trail
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      event_category: AuditEventCategory.COMPLIANCE,
      resourceType: 'legal_case',
      resourceId: id,
      description: `QG4 override executado por ${req.user!.email} — caso ${legalCase.case_number}. Justificativa: ${justification}`,
      details: {
        override_id: overrideId,
        qg4_score: legalCase.qg4_score,
        justification,
        otp_verified: true,
      },
      requestId: (req as any).id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    logger.info('QG4 override recorded', { userId, caseId: id, overrideId });

    res.json({
      success: true,
      override_id: overrideId,
      case_id: id,
      message: 'Override QG4 registrado e auditado com sucesso.',
    });
  })
);

export default router;
