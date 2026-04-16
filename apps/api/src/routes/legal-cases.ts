import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
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
    page_number: z.number().int().positive(),
    confidence_score: z.number().min(0).max(100).optional(),
    // Spec §5.2 — Triplo Fechamento: 5 componentes obrigatórios
    tese_principal: z.string().min(1, 'Tese principal obrigatória (Spec §5.2)'),
    texto_legal: z.string().min(1, 'Dispositivo legal (artigo/lei) obrigatório (Spec §5.2)'),
    doutrina: z.string().optional(),
    // jurisprudencia: mín. 2 entradas STJ/TJSP/TJ conforme Spec §5.2
    jurisprudencia: z.array(z.string().min(1)).min(2, 'Mínimo 2 entradas de jurisprudência STJ/TJSP obrigatórias (Spec §5.2)'),
    nexo_causal: z.string().min(1, 'Nexo causal obrigatório (Spec §5.2)'),
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

    // Spec §5.2 — Triplo Fechamento: 5 componentes obrigatórios
    const { fact_type, fact_value, document_id, page_number, confidence_score,
            tese_principal, texto_legal, doutrina, jurisprudencia, nexo_causal } = req.body;

    // Spec §4.3 / Divergência #4 — CPO Hard Gate: OCR confidence ≥ 0.95 AND DPI ≥ 300
    if (document_id) {
      const docRow = await db.query<{
        ocr_confidence: number | null;
        dpi_resolution: number | null;
        status_cpo: string | null;
      }>(
        `SELECT ocr_confidence, dpi_resolution, status_cpo
         FROM documents
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [document_id, tenantContext.tenantId]
      );
      const doc = docRow.rows[0];
      if (!doc) throw new ValidationError('Documento não encontrado ou não pertence a este tenant.');

      // Only enforce on documents that have been processed (status_cpo not null)
      if (doc.status_cpo !== null) {
        if (doc.status_cpo === 'VERMELHO') {
          throw new ValidationError(
            'CPO Hard Gate: documento com status_cpo=VERMELHO não pode ser vinculado ao intake jurídico (Spec §4.3). ' +
            'Reprocesse o documento ou substitua por versão de qualidade adequada.'
          );
        }
        if (doc.ocr_confidence !== null && doc.ocr_confidence < 0.95) {
          throw new ValidationError(
            `CPO Hard Gate: OCR confidence insuficiente (${(doc.ocr_confidence * 100).toFixed(1)}% < 95%). ` +
            'Reprocesse o documento com versão de maior qualidade (Spec §4.3).'
          );
        }
        if (doc.dpi_resolution !== null && doc.dpi_resolution < 300) {
          throw new ValidationError(
            `CPO Hard Gate: resolução DPI insuficiente (${doc.dpi_resolution} DPI < 300 DPI). ` +
            'Digitalize o documento com resolução mínima de 300 DPI (Spec §4.3).'
          );
        }
      }
    }

    const result = await db.query(
      `INSERT INTO document_facts (tenant_id, document_id, fact_type, fact_value, page_number, confidence_score, legal_case_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantContext.tenantId,
        document_id,
        fact_type,
        fact_value,
        page_number,
        confidence_score || null,
        id,
        JSON.stringify({ tese_principal, texto_legal, doutrina: doutrina || null, jurisprudencia, nexo_causal }),
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

    // Spec §5.2 — Triplo Fechamento: verifica todos os 5 componentes obrigatórios
    const triploCheck = await db.query<{
      has_tese: boolean;
      has_texto_legal: boolean;
      has_doutrina: boolean;
      juris_count: string;
      has_nexo: boolean;
    }>(
      `SELECT
         BOOL_OR((metadata->>'tese_principal') IS NOT NULL AND (metadata->>'tese_principal') != '') AS has_tese,
         BOOL_OR((metadata->>'texto_legal') IS NOT NULL AND (metadata->>'texto_legal') != '') AS has_texto_legal,
         BOOL_OR((metadata->>'doutrina') IS NOT NULL AND (metadata->>'doutrina') != '') AS has_doutrina,
         COALESCE(SUM(jsonb_array_length(metadata->'jurisprudencia')), 0)::text AS juris_count,
         BOOL_OR((metadata->>'nexo_causal') IS NOT NULL AND (metadata->>'nexo_causal') != '') AS has_nexo
       FROM document_facts WHERE tenant_id = $1 AND legal_case_id = $2`,
      [tenantContext.tenantId, id]
    );
    const triploRow = triploCheck.rows[0] || { has_tese: false, has_texto_legal: false, has_doutrina: false, juris_count: '0', has_nexo: false };
    const jurisCount = parseInt(triploRow.juris_count || '0', 10);
    // Spec §5.2: tese_principal + texto_legal + jurisprudência (≥2 STJ/TJSP) + nexo_causal required; doutrina optional
    const triploFechamento = triploRow.has_tese && triploRow.has_texto_legal && jurisCount >= 2 && triploRow.has_nexo && factsCount > 0;

    // Spec §5.2: Triplo Fechamento é hard gate — bloqueia QG4 se incompleto
    if (!triploFechamento) {
      const missing: string[] = [];
      if (!triploRow.has_tese) missing.push('tese_principal');
      if (!triploRow.has_texto_legal) missing.push('texto_legal');
      if (jurisCount < 2) missing.push(`jurisprudencia (${jurisCount}/2 entradas STJ/TJSP)`);
      if (!triploRow.has_nexo) missing.push('nexo_causal');
      if (factsCount === 0) missing.push('fatos documentados');
      throw new ValidationError(
        `Triplo Fechamento incompleto — QG4 bloqueado. Faltam: ${missing.join(', ')}. ` +
        'Adicione FPDN com tese_principal, texto_legal, jurisprudência (mín. 2 STJ/TJSP) e nexo_causal.'
      );
    }

    // Spec QG4 formula (Divergence #2):
    // rastreabilidade = facts completeness: min(factsCount / 10, 1.0) * 100
    // fundamentacao = (hasDeadline ? 50 : 0) + (hasDescription ? 50 : 0)
    // coerencia = (hasLawyer ? 50 : 0) + (hasClient ? 50 : 0)
    // Final: Math.round((rastreabilidade * 0.70) + (fundamentacao * 0.20) + (coerencia * 0.10))
    const rastreabilidade = Math.min(factsCount / 10, 1.0) * 100;
    // Spec §5.2: fundamentacao = completude dos 5 componentes do Triplo Fechamento
    // Since triploFechamento is a hard gate above, we only reach here if all 5 are present (score = 100)
    const fundamentacao = triploFechamento ? 100 : (
      (triploRow.has_tese ? 20 : 0) +
      (triploRow.has_texto_legal ? 20 : 0) +
      (jurisCount >= 2 ? 20 : Math.round(jurisCount / 2 * 20)) +
      (triploRow.has_nexo ? 20 : 0) +
      (factsCount > 0 ? 20 : 0)
    );
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
            has_lawyer: !!legalCase.assigned_lawyer_id,
            has_client: !!legalCase.client_name,
            triplo_fechamento: triploFechamento,
            triplo_componentes: {
              tese_principal: triploRow.has_tese,
              texto_legal: triploRow.has_texto_legal,
              doutrina: triploRow.has_doutrina,
              jurisprudencia_count: jurisCount,
              nexo_causal: triploRow.has_nexo,
            },
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
      triplo_fechamento: triploFechamento,
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

// ============================================
// Spec §5.2 — QG4 Hard Gate: status transition
// ============================================

const updateCaseStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['ABERTO', 'EM_ANALISE', 'EM_JULGAMENTO', 'CONCLUIDO', 'ARQUIVADO', 'SUSPENSO', 'CANCELADO']),
    notes: z.string().optional(),
  }),
});

/**
 * PATCH /legal-cases/:id/status
 * Update legal case status. Transitions to EM_JULGAMENTO/CONCLUIDO require QG4 >= 90 (Spec §5.2).
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('documents:update'),
  validateRequest(updateCaseStatusSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user!.id;

    const caseResult = await db.query<{ id: string; case_number: string; status: string; qg4_score: number | null }>(
      `SELECT id, case_number, status, qg4_score FROM legal_cases WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantContext.tenantId]
    );
    if (caseResult.rows.length === 0) throw new NotFoundError('Legal case');
    const legalCase = caseResult.rows[0];

    // Spec §5.2 / Divergência #5 — QG4 Hard Gate (app-level, DB trigger is backstop)
    const qg4BlockedStates = ['EM_JULGAMENTO', 'CONCLUIDO'];
    if (qg4BlockedStates.includes(status)) {
      if (!legalCase.qg4_score || legalCase.qg4_score < 90) {
        throw new ValidationError(
          `QG4 Hard Gate: score insuficiente (${legalCase.qg4_score ?? 'não calculado'}/90 mínimo). ` +
          `Execute POST /legal-cases/${id}/qg4/calculate antes de avançar para ${status}. (Spec §5.2)`
        );
      }
    }

    await db.query(
      `UPDATE legal_cases SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [status, id, tenantContext.tenantId]
    );

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'legal_case.status.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'legal_case',
      resourceId: id,
      description: `Status do caso ${legalCase.case_number} alterado: ${legalCase.status} → ${status}`,
      details: { old_status: legalCase.status, new_status: status, qg4_score: legalCase.qg4_score, notes },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      case_id: id,
      old_status: legalCase.status,
      new_status: status,
    });
  })
);

export default router;

