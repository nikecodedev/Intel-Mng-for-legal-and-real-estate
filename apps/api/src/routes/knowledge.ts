import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError } from '../utils/errors.js';
import { KnowledgeEntryModel, KnowledgeEntryType, OutcomeType } from '../models/knowledge-entry.js';
import { DocumentTemplateModel } from '../models/document-template.js';
import { KnowledgeSearchService } from '../services/knowledge-search.js';
import { TemplateSuccessTrackingService } from '../services/template-success-tracking.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const createKnowledgeEntrySchema = z.object({
  body: z.object({
    entry_type: z.enum(['LEGAL_THESIS', 'CASE_OUTCOME', 'LEGAL_PRECEDENT', 'LEGAL_OPINION']),
    title: z.string().min(1),
    summary: z.string().optional(),
    content: z.string().min(1),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    source_case_ids: z.array(z.string().uuid()).optional(),
    source_document_ids: z.array(z.string().uuid()).optional(),
    jurisdiction: z.string().optional(),
    court_level: z.string().optional(),
    decision_date: z.string().date().optional(),
    case_number: z.string().optional(),
    judge_name: z.string().optional(),
    outcome_type: z.enum(['FAVORABLE', 'UNFAVORABLE', 'MIXED', 'SETTLED']).optional(),
    outcome_summary: z.string().optional(),
    key_legal_points: z.array(z.string()).optional(),
  }),
});

const createTemplateSchema = z.object({
  body: z.object({
    template_name: z.string().min(1),
    template_type: z.string().min(1),
    description: z.string().optional(),
    template_content: z.string().min(1),
    template_structure: z.record(z.unknown()).optional(),
    variables: z.record(z.unknown()).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    use_cases: z.array(z.string()).optional(),
    source_knowledge_entry_ids: z.array(z.string().uuid()).optional(),
    source_case_ids: z.array(z.string().uuid()).optional(),
  }),
});

// ============================================
// Knowledge Entries Routes
// ============================================

/**
 * POST /knowledge/entries
 * Create new knowledge entry
 */
router.post(
  '/entries',
  authenticate,
  requirePermission('knowledge:create'),
  validateRequest(createKnowledgeEntrySchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const entry = await KnowledgeEntryModel.create(
      {
        tenant_id: tenantContext.tenantId,
        ...req.body,
      },
      userId
    );

    // Audit knowledge entry creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'knowledge.entry.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'knowledge_entry',
      resourceId: entry.id,
      description: `Created knowledge entry: ${entry.title}`,
      details: {
        entry_type: entry.entry_type,
        category: entry.category,
        source_cases: entry.source_case_ids.length,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      entry,
    });
  })
);

/**
 * GET /knowledge/entries
 * List knowledge entries
 */
router.get(
  '/entries',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const entry_type = req.query.entry_type as KnowledgeEntryType | undefined;
    const category = req.query.category as string | undefined;
    const outcome_type = req.query.outcome_type as OutcomeType | undefined;
    const is_verified = req.query.is_verified === 'true' ? true : req.query.is_verified === 'false' ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { entries, total } = await KnowledgeEntryModel.list(tenantContext.tenantId, {
      entry_type,
      category,
      outcome_type,
      is_verified,
      limit,
      offset,
    });

    res.json({
      success: true,
      entries,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /knowledge/entries/:id
 * Get single knowledge entry
 */
router.get(
  '/entries/:id',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const entry = await KnowledgeEntryModel.findById(id, tenantContext.tenantId);
    if (!entry) {
      throw new NotFoundError('Knowledge entry');
    }

    // Increment view count
    await KnowledgeEntryModel.incrementViewCount(id, tenantContext.tenantId);

    res.json({
      success: true,
      entry,
    });
  })
);

// ============================================
// Semantic Search Routes
// ============================================

/**
 * POST /knowledge/search
 * Semantic search over past cases and legal outcomes
 */
router.post(
  '/search',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { query, entry_type, category, outcome_type, min_relevance_score, limit, use_cache } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Search query is required');
    }

    const searchResults = await KnowledgeSearchService.search(tenantContext.tenantId, query, {
      entry_type,
      category,
      outcome_type,
      min_relevance_score,
      limit: limit || 50,
      use_cache: use_cache !== false,
    });

    // Audit search
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.READ,
      eventType: 'knowledge.search',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: 'knowledge_entry',
      description: `Semantic search performed: "${query}"`,
      details: {
        query,
        result_count: searchResults.total,
        cached: searchResults.cached,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      query,
      results: searchResults.results,
      total: searchResults.total,
      cached: searchResults.cached,
    });
  })
);

/**
 * POST /knowledge/search/past-cases
 * Search past cases linked to knowledge entries
 */
router.post(
  '/search/past-cases',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { query, limit } = req.body;

    if (!query || typeof query !== 'string') {
      throw new Error('Search query is required');
    }

    const results = await KnowledgeSearchService.searchPastCases(tenantContext.tenantId, query, {
      limit: limit || 50,
    });

    res.json({
      success: true,
      query,
      case_ids: results.case_ids,
      entries: results.entries,
      count: results.case_ids.length,
    });
  })
);

/**
 * POST /knowledge/search/outcomes
 * Search legal outcomes
 */
router.post(
  '/search/outcomes',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { query, outcome_type, limit } = req.body;

    if (!query || typeof query !== 'string') {
      throw new Error('Search query is required');
    }

    const results = await KnowledgeSearchService.searchLegalOutcomes(
      tenantContext.tenantId,
      query,
      outcome_type,
      { limit: limit || 50 }
    );

    res.json({
      success: true,
      query,
      results,
      count: results.length,
    });
  })
);

// ============================================
// Document Templates Routes
// ============================================

/**
 * POST /knowledge/templates
 * Create new document template
 */
router.post(
  '/templates',
  authenticate,
  requirePermission('knowledge:create'),
  validateRequest(createTemplateSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const template = await DocumentTemplateModel.create(
      {
        tenant_id: tenantContext.tenantId,
        ...req.body,
      },
      userId
    );

    // Audit template creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'knowledge.template.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'document_template',
      resourceId: template.id,
      description: `Created document template: ${template.template_name}`,
      details: {
        template_type: template.template_type,
        category: template.category,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      template,
    });
  })
);

/**
 * GET /knowledge/templates
 * List document templates (prioritized by success rate)
 */
router.get(
  '/templates',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const template_type = req.query.template_type as string | undefined;
    const category = req.query.category as string | undefined;
    const recommended_only = req.query.recommended_only === 'true';
    const min_success_rate = req.query.min_success_rate 
      ? parseFloat(req.query.min_success_rate as string) 
      : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { templates, total } = await DocumentTemplateModel.list(tenantContext.tenantId, {
      template_type,
      category,
      recommended_only,
      min_success_rate,
      limit,
      offset,
    });

    res.json({
      success: true,
      templates,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /knowledge/templates/recommended
 * Get recommended templates (high success rate)
 */
router.get(
  '/templates/recommended',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const template_type = req.query.template_type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const templates = await TemplateSuccessTrackingService.getRecommendedTemplates(
      tenantContext.tenantId,
      template_type,
      limit
    );

    res.json({
      success: true,
      templates,
      count: templates.length,
    });
  })
);

/**
 * GET /knowledge/templates/:id
 * Get single template
 */
router.get(
  '/templates/:id',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const template = await DocumentTemplateModel.findById(id, tenantContext.tenantId);
    if (!template) {
      throw new NotFoundError('Document template');
    }

    res.json({
      success: true,
      template,
    });
  })
);

/**
 * POST /knowledge/templates/:id/use
 * Record template usage
 */
router.post(
  '/templates/:id/use',
  authenticate,
  requirePermission('knowledge:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;
    const { case_id, document_id } = req.body;

    await TemplateSuccessTrackingService.recordTemplateUsage(
      id,
      tenantContext.tenantId,
      userId,
      case_id,
      document_id
    );

    // Audit template usage
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'knowledge.template.use',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'document_template',
      resourceId: id,
      description: `Template used in ${case_id ? 'case' : 'document'}`,
      details: {
        case_id,
        document_id,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      message: 'Template usage recorded',
    });
  })
);

/**
 * POST /knowledge/templates/:id/outcome
 * Record template outcome (success/failure)
 */
router.post(
  '/templates/:id/outcome',
  authenticate,
  requirePermission('knowledge:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const { outcome_type, outcome_date, outcome_notes } = req.body;

    if (!outcome_type || !['SUCCESS', 'FAILURE', 'PARTIAL'].includes(outcome_type)) {
      throw new Error('Invalid outcome_type. Must be SUCCESS, FAILURE, or PARTIAL');
    }

    await TemplateSuccessTrackingService.recordTemplateOutcome(
      id,
      tenantContext.tenantId,
      outcome_type,
      outcome_date,
      outcome_notes
    );

    // Audit outcome recording
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'knowledge.template.outcome',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'document_template',
      resourceId: id,
      description: `Template outcome recorded: ${outcome_type}`,
      details: {
        outcome_type,
        outcome_date,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      message: 'Template outcome recorded',
    });
  })
);

/**
 * GET /knowledge/templates/:id/metrics
 * Get template success metrics
 */
router.get(
  '/templates/:id/metrics',
  authenticate,
  requirePermission('knowledge:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const metrics = await TemplateSuccessTrackingService.getTemplateMetrics(id, tenantContext.tenantId);
    if (!metrics) {
      throw new NotFoundError('Document template');
    }

    res.json({
      success: true,
      metrics,
    });
  })
);

export default router;
