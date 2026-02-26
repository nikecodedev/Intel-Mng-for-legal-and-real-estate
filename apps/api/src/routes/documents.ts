import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { parsePagination } from '../utils/pagination.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { DocumentModel } from '../models/document.js';
import { DocumentExtractionModel } from '../models/document-extraction.js';
import { DocumentQualityFlagModel } from '../models/document-quality-flag.js';
import { DocumentFactModel } from '../models/document-fact.js';
import { DocumentExtractionService, documentExtractionService } from '../services/document-extraction.js';
import { AuditService, AuditAction, AuditEventType } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Multer: store uploaded file to disk for processing (field name: file)
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${path.basename(file.originalname || 'document')}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ============================================
// Schema definitions
// ============================================

const uploadDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(500),
    description: z.union([z.string(), z.undefined()]).optional(),
    document_type: z.string().min(1).max(100),
    category: z.union([z.string(), z.undefined()]).optional(),
    document_date: z.union([z.string(), z.undefined()]).optional(),
    metadata: z.optional(z.unknown()),
    tags: z.optional(z.unknown()),
    confidentiality_level: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).optional(),
  }),
});

const updateDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
    document_date: z.string().datetime().optional(),
    expiration_date: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

const listDocumentsSchema = z.object({
  query: z.object({
    status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
    status_cpo: z.enum(['VERDE', 'AMARELO', 'VERMELHO']).optional(),
    document_type: z.string().optional(),
    limit: z.string().transform(Number).optional(),
    offset: z.string().transform(Number).optional(),
  }),
});

const resolveFlagSchema = z.object({
  body: z.object({
    resolution_action: z.enum(['RESCANNED', 'MANUAL_OVERRIDE', 'DISMISSED', 'REPROCESSED']),
    resolution_notes: z.string().optional(),
  }),
  params: z.object({
    flagId: z.string().uuid(),
  }),
});

const sanitationQueueSchema = z.object({
  query: z.object({
    severity: z.enum(['ERROR', 'WARNING', 'INFO']).optional(),
    flag_type: z.string().optional(),
    limit: z.string().transform(Number).optional(),
    offset: z.string().transform(Number).optional(),
  }),
});

// ============================================
// Document CRUD Routes
// ============================================

/**
 * POST /documents/upload
 * Upload a new document for processing (multipart file or body file_path for testing).
 */
router.post(
  '/upload',
  authenticate,
  requirePermission('documents:create'),
  upload.single('file'),
  validateRequest(uploadDocumentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { title, description, document_type, category, document_date, metadata, tags, confidentiality_level } = req.body;
    const filePath = (req as Request & { file?: multer.File }).file?.path ?? req.body?.file_path;
    if (!filePath) {
      throw new ValidationError('File is required: send multipart field "file" or body file_path');
    }
    const metadataObj =
      typeof metadata === 'string' ? (() => { try { return JSON.parse(metadata); } catch { return undefined; } })() : metadata;
    const tagsArr = typeof tags === 'string' ? (() => { try { return JSON.parse(tags); } catch { return []; } })() : (Array.isArray(tags) ? tags : undefined);

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new ValidationError('File not found');
    }

    // Get file info
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(fileName);

    // Calculate file hash for deduplication
    const fileHash = DocumentExtractionService.calculateFileHash(filePath);

    // Check for duplicates
    const duplicate = await documentExtractionService.checkDuplicate(tenantId, fileHash);
    if (duplicate.isDuplicate) {
      throw new ConflictError(`Duplicate document detected. Existing document ID: ${duplicate.existingDocumentId}`);
    }

    // Generate document number
    const documentNumber = await DocumentModel.generateDocumentNumber(tenantId, 'DOC');

    // Create document record
    const document = await DocumentModel.create({
      tenant_id: tenantId,
      document_number: documentNumber,
      title,
      description,
      document_type,
      category,
      file_name: fileName,
      storage_path: filePath, // In production, would be cloud storage path
      file_size: stats.size,
      mime_type: mimeType,
      file_hash_sha256: fileHash,
      owner_id: userId,
      created_by: userId,
      document_date: document_date ? new Date(document_date) : undefined,
      metadata: metadataObj,
      tags: tagsArr,
      confidentiality_level,
    });

    // Audit log - CREATE
    await AuditService.logDataChange(
      tenantId,
      AuditAction.CREATE,
      'document',
      document.id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { document_number: documentNumber, file_name: fileName, file_size: stats.size },
      documentNumber
    );

    // Queue document processing job (with retry mechanism)
    const { JobQueueService } = await import('../services/job-queue.js');
    await JobQueueService.addJob('document-processing', {
      tenantId,
      documentId: document.id,
      filePath,
      userId,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      timeout: 300000, // 5 minutes for OCR processing
    });

    logger.info('Document uploaded', { 
      tenantId, 
      documentId: document.id, 
      documentNumber,
      fileName 
    });

    res.status(201).json({
      success: true,
      data: {
        id: document.id,
        document_number: document.document_number,
        title: document.title,
        status: document.status,
        status_cpo: document.status_cpo,
        file_name: document.file_name,
        file_size: document.file_size,
        created_at: document.created_at,
        processing: 'queued', // Indicates async processing is starting
      },
    });
  })
);

/**
 * GET /documents
 * List documents for current tenant
 */
router.get(
  '/',
  authenticate,
  requirePermission('documents:list'),
  validateRequest(listDocumentsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { status, status_cpo, document_type } = req.query as Record<string, string>;
    const { limit, offset } = parsePagination(req.query);

    const documents = await DocumentModel.findAllByTenant(tenantId, {
      status,
      status_cpo,
      document_type,
      limit,
      offset,
    });

    const total = await DocumentModel.countByTenant(tenantId, { status, status_cpo });

    // Audit log - ACCESS (list)
    await AuditService.logAccess(
      tenantId,
      'document',
      null,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { operation: 'list', filters: { status, status_cpo, document_type }, count: documents.length }
    );

    res.json({
      success: true,
      data: {
        documents: documents.map(formatDocumentResponse),
        pagination: { total, limit, offset },
      },
    });
  })
);

/**
 * GET /documents/:id/viewer-context
 * Returns watermark data and optional fact highlight context for the secure viewer.
 * No direct file URL. Requires tenant_id + documents:read. Logs ACCESS.
 */
const viewerContextSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ fact_id: z.string().uuid().optional() }),
});
router.get(
  '/:id/viewer-context',
  authenticate,
  requirePermission('documents:read'),
  validateRequest(viewerContextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id: documentId } = req.params;
    const factId = req.query.fact_id as string | undefined;

    const document = await DocumentModel.findById(documentId, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    let fact_context: { page_number: number; bounding_box: { x: number; y: number; width: number; height: number } } | null = null;
    if (factId) {
      const fact = await DocumentFactModel.findById(factId, tenantId);
      if (fact && fact.document_id === documentId) {
        fact_context = {
          page_number: fact.page_number ?? 1,
          bounding_box: fact.bounding_box ?? { x: 0, y: 0, width: 1, height: 0.05 },
        };
      }
    }

    const ip = req.ip ?? req.socket?.remoteAddress ?? '';

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'document.viewer_context',
      event_category: AuditEventCategory.DATA_ACCESS,
      action: AuditAction.READ,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'document',
      resource_id: documentId,
      description: 'Document viewer context (watermark + fact highlight)',
      details: { document_number: document.document_number, fact_id: factId ?? null },
      ip_address: ip,
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
        watermark: {
          user_email: req.user!.email,
          user_id: userId,
          ip_address: ip,
          timestamp: new Date().toISOString(),
        },
        fact_context,
      },
    });
  })
);

/**
 * GET /documents/:id/viewer-asset
 * Streams document file for embedded viewer only. No direct file URL; access requires auth + tenant + RBAC.
 * Disable caching; inline disposition. Logs ACCESS. Only serves if storage_path is set and file exists.
 */
router.get(
  '/:id/viewer-asset',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const storagePath = document.storage_path;
    if (!storagePath || typeof storagePath !== 'string') {
      throw new ValidationError('Document has no storage path');
    }

    // Prevent path traversal: resolve under base and ensure result stays under base
    const baseDir = path.resolve(process.cwd());
    const resolvedPath = path.isAbsolute(storagePath)
      ? path.resolve(storagePath)
      : path.resolve(baseDir, storagePath);
    const normalizedResolved = path.normalize(resolvedPath);
    const relative = path.relative(baseDir, normalizedResolved);
    if (storagePath.includes('..') || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ValidationError('Invalid storage path');
    }

    if (!fs.existsSync(normalizedResolved)) {
      throw new NotFoundError('Document file');
    }

    const mime = document.mime_type || getMimeType(document.file_name);

    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'document.viewer_asset',
      event_category: AuditEventCategory.DATA_ACCESS,
      action: AuditAction.READ,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'document',
      resource_id: id,
      description: 'Document viewer asset stream (no download URL)',
      details: { document_number: document.document_number },
      ip_address: req.ip ?? req.socket?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_id: req.headers['x-request-id'] as string | undefined,
      session_id: req.headers['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['legal'],
      retention_category: 'legal',
    });

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline'); // display in viewer, not attachment
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(normalizedResolved);
    stream.on('error', (err) => {
      logger.error('Viewer asset stream error', { err, documentId: id });
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  })
);

/**
 * GET /documents/:id/secure-view
 * Secure view of document content (no download). Returns metadata and viewable content only.
 * All queries use req.context.tenant_id only.
 */
router.get(
  '/:id/secure-view',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const extraction = await DocumentExtractionModel.findByDocumentId(id, tenantId);

    // Audit: document view (no download)
    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'document.view',
      event_category: AuditEventCategory.DATA_ACCESS,
      action: AuditAction.READ,
      user_id: userId,
      user_email: req.user!.email,
      user_role: req.context?.role,
      resource_type: 'document',
      resource_id: id,
      description: 'Document secure view (no download)',
      details: {
        document_number: document.document_number,
        secure_view: true,
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
        document: {
          id: document.id,
          document_number: document.document_number,
          title: document.title,
          document_type: document.document_type,
          status_cpo: document.status_cpo,
          ocr_processed: document.ocr_processed,
        },
        viewable_content: {
          ocr_text: document.ocr_text ?? null,
          extraction_summary: extraction
            ? {
                process_number: extraction.process_number,
                court: extraction.court,
                parties_count: extraction.parties?.length ?? 0,
                monetary_values_count: extraction.monetary_values?.length ?? 0,
              }
            : null,
        },
      },
    });
  })
);

/**
 * GET /documents/:id/facts
 * List facts for a document (proof lineage).
 */
router.get(
  '/:id/facts',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const facts = await DocumentFactModel.findByDocumentId(id, tenantId);
    res.json({
      success: true,
      data: facts.map((f) => ({
        id: f.id,
        document_id: f.document_id,
        fact_type: f.fact_type,
        fact_value: f.fact_value,
        page_number: f.page_number,
        bounding_box: f.bounding_box,
        confidence_score: f.confidence_score,
        created_at: f.created_at,
      })),
    });
  })
);

/**
 * GET /documents/:id
 * Get document by ID
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Get extraction data if available
    const extraction = await DocumentExtractionModel.findByDocumentId(id, tenantId);

    // Get quality flags
    const qualityFlags = await DocumentQualityFlagModel.findByDocumentId(id, tenantId);

    // Audit log - ACCESS
    await AuditService.logAccess(
      tenantId,
      'document',
      id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { accessed_fields: ['all'] }
    );

    res.json({
      success: true,
      data: {
        document: formatDocumentResponse(document),
        extraction: extraction ? formatExtractionResponse(extraction) : null,
        quality_flags: qualityFlags.map(formatQualityFlagResponse),
      },
    });
  })
);

/**
 * PUT /documents/:id
 * Update document metadata
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('documents:update'),
  validateRequest(updateDocumentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;
    const updates = req.body;

    const existing = await DocumentModel.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Document');
    }

    const updated = await DocumentModel.update(id, tenantId, {
      ...updates,
      updated_by: userId,
      document_date: updates.document_date ? new Date(updates.document_date) : undefined,
      expiration_date: updates.expiration_date ? new Date(updates.expiration_date) : undefined,
    });

    // Audit log - UPDATE
    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      'document',
      id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { updated_fields: Object.keys(updates) },
      existing.document_number
    );

    res.json({
      success: true,
      data: formatDocumentResponse(updated!),
    });
  })
);

/**
 * DELETE /documents/:id
 * Soft delete document
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('documents:delete'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const existing = await DocumentModel.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Document');
    }

    await DocumentModel.delete(id, tenantId, userId);

    // Audit log - DELETE
    await AuditService.logDataChange(
      tenantId,
      AuditAction.DELETE,
      'document',
      id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { document_number: existing.document_number },
      existing.document_number
    );

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  })
);

/**
 * POST /documents/:id/reprocess
 * Reprocess document (after quality issues resolved)
 */
router.post(
  '/:id/reprocess',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    if (!document.storage_path) {
      throw new ValidationError('Document file path not available');
    }

    // Start reprocessing
    const result = await documentExtractionService.reprocessDocument(
      tenantId,
      id,
      document.storage_path,
      userId
    );

    // Audit log
    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      'document',
      id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { action: 'reprocess', result: result.status_cpo },
      document.document_number
    );

    res.json({
      success: true,
      data: {
        document_id: id,
        status_cpo: result.status_cpo,
        dpi_result: result.dpi_result,
        ocr_result: result.ocr_result,
        quality_flags: result.quality_flags,
        in_sanitation_queue: result.in_sanitation_queue,
      },
    });
  })
);

/**
 * POST /documents/:id/approve
 * Approve document CPO
 */
router.post(
  '/:id/approve',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const updated = await DocumentModel.approveCPO(id, tenantId, userId);

    // Audit log
    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      'document',
      id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { action: 'cpo_approve' },
      document.document_number
    );

    res.json({
      success: true,
      data: formatDocumentResponse(updated!),
    });
  })
);

// ============================================
// Extraction Routes
// ============================================

/**
 * GET /documents/:id/extraction
 * Get extraction data for a document
 */
router.get(
  '/:id/extraction',
  authenticate,
  requirePermission('documents:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const extraction = await DocumentExtractionModel.findByDocumentId(id, tenantId);
    if (!extraction) {
      throw new NotFoundError('Extraction data not available');
    }

    // Audit log
    await AuditService.logAccess(
      tenantId,
      'document_extraction',
      extraction.id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { document_id: id }
    );

    res.json({
      success: true,
      data: formatExtractionResponse(extraction),
    });
  })
);

/**
 * PUT /documents/:id/extraction
 * Update extraction with manual corrections
 */
router.put(
  '/:id/extraction',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { id } = req.params;
    const corrections = req.body;

    const document = await DocumentModel.findById(id, tenantId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const extraction = await DocumentExtractionModel.findByDocumentId(id, tenantId);
    if (!extraction) {
      throw new NotFoundError('Extraction data not available');
    }

    // Apply corrections
    const updated = await DocumentExtractionModel.applyCorrections(
      extraction.id,
      tenantId,
      corrections,
      userId
    );

    // Audit log
    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      'document_extraction',
      extraction.id,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { corrections: Object.keys(corrections) },
      document.document_number
    );

    res.json({
      success: true,
      data: formatExtractionResponse(updated!),
    });
  })
);

// ============================================
// Sanitation Queue Routes
// ============================================

/**
 * GET /documents/sanitation-queue
 * Get documents in sanitation queue
 */
router.get(
  '/sanitation-queue',
  authenticate,
  requirePermission('documents:list'),
  validateRequest(sanitationQueueSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { severity, flag_type } = req.query as Record<string, string>;
    const { limit, offset } = parsePagination(req.query);

    const queueItems = await DocumentQualityFlagModel.getSanitationQueue(tenantId, {
      severity: severity as 'ERROR' | 'WARNING' | 'INFO' | undefined,
      flag_type: flag_type as any,
      limit,
      offset,
    });

    const counts = await DocumentQualityFlagModel.countByStatus(tenantId);
    const severityCounts = await DocumentQualityFlagModel.countBySeverity(tenantId);

    // Audit log
    await AuditService.logAccess(
      tenantId,
      'sanitation_queue',
      null,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { operation: 'list', count: queueItems.length }
    );

    res.json({
      success: true,
      data: {
        items: queueItems,
        summary: {
          by_status: counts,
          by_severity: severityCounts,
        },
        pagination: {
          total: counts.PENDING + counts.IN_REVIEW + counts.ESCALATED,
          limit,
          offset,
        },
      },
    });
  })
);

/**
 * POST /documents/sanitation-queue/:flagId/resolve
 * Resolve a quality flag
 */
router.post(
  '/sanitation-queue/:flagId/resolve',
  authenticate,
  requirePermission('documents:update'),
  validateRequest(resolveFlagSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { flagId } = req.params;
    const { resolution_action, resolution_notes } = req.body;

    const flag = await DocumentQualityFlagModel.findById(flagId, tenantId);
    if (!flag) {
      throw new NotFoundError('Quality flag');
    }

    const resolved = await DocumentQualityFlagModel.resolve(
      flagId,
      tenantId,
      resolution_action,
      resolution_notes || null,
      userId
    );

    if (!resolved) {
      throw new Error('Failed to resolve flag');
    }

    // Audit log
    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      'document_quality_flag',
      flagId,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { action: 'resolve', resolution_action },
      flag.document_id
    );

    res.json({
      success: true,
      message: 'Quality flag resolved',
    });
  })
);

/**
 * POST /documents/sanitation-queue/:flagId/escalate
 * Escalate a quality flag
 */
router.post(
  '/sanitation-queue/:flagId/escalate',
  authenticate,
  requirePermission('documents:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = getTenantContext(req);
    const { flagId } = req.params;
    const { notes } = req.body;

    const flag = await DocumentQualityFlagModel.findById(flagId, tenantId);
    if (!flag) {
      throw new NotFoundError('Quality flag');
    }

    const escalated = await DocumentQualityFlagModel.escalate(flagId, tenantId, notes || '');

    // Audit log
    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      'document_quality_flag',
      flagId,
      userId,
      req.user!.email,
      req.context?.role,
      req,
      { action: 'escalate' },
      flag.document_id
    );

    res.json({
      success: true,
      data: formatQualityFlagResponse(escalated!),
    });
  })
);

// ============================================
// Helper Functions
// ============================================

/**
 * Get MIME type from file name
 */
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Process document asynchronously
 */
async function processDocumentAsync(
  tenantId: string,
  documentId: string,
  filePath: string,
  userId: string
): Promise<void> {
  try {
    await documentExtractionService.processDocument(tenantId, documentId, filePath, userId);
  } catch (error) {
    logger.error('Async document processing failed', { error, tenantId, documentId });
  }
}

/**
 * Format document for response
 */
function formatDocumentResponse(doc: any) {
  return {
    id: doc.id,
    document_number: doc.document_number,
    title: doc.title,
    description: doc.description,
    document_type: doc.document_type,
    category: doc.category,
    file_name: doc.file_name,
    file_size: doc.file_size,
    mime_type: doc.mime_type,
    status: doc.status,
    status_cpo: doc.status_cpo,
    cpo_approval_required: doc.cpo_approval_required,
    ocr_processed: doc.ocr_processed,
    ocr_confidence: doc.ocr_confidence,
    dpi_processed: doc.dpi_processed,
    dpi_resolution: doc.dpi_resolution,
    metadata: doc.metadata,
    tags: doc.tags,
    document_date: doc.document_date,
    created_by: doc.created_by,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

/**
 * Format extraction for response
 */
function formatExtractionResponse(ext: any) {
  return {
    id: ext.id,
    document_id: ext.document_id,
    process_number: ext.process_number,
    court: ext.court,
    court_type: ext.court_type,
    court_state: ext.court_state,
    parties: ext.parties,
    monetary_values: ext.monetary_values,
    total_monetary_value: ext.total_monetary_value,
    extracted_dates: ext.extracted_dates,
    overall_confidence: ext.overall_confidence,
    field_confidences: ext.field_confidences,
    validation_status: ext.validation_status,
    extraction_warnings: ext.extraction_warnings,
    processed_at: ext.processed_at,
    manual_corrections: ext.manual_corrections,
  };
}

/**
 * Format quality flag for response
 */
function formatQualityFlagResponse(flag: any) {
  return {
    id: flag.id,
    document_id: flag.document_id,
    flag_type: flag.flag_type,
    flag_code: flag.flag_code,
    severity: flag.severity,
    flag_message: flag.flag_message,
    flag_details: flag.flag_details,
    threshold_value: flag.threshold_value,
    actual_value: flag.actual_value,
    queue_status: flag.queue_status,
    queued_at: flag.queued_at,
    resolution_action: flag.resolution_action,
    resolution_notes: flag.resolution_notes,
    resolved_by: flag.resolved_by,
    resolved_at: flag.resolved_at,
  };
}

export default router;
