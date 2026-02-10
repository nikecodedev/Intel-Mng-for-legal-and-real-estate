import { Router } from 'express';
import { tenantMiddleware } from '../middleware';
import healthRouter from './health';
import authRouter from './auth';
import rbacExamplesRouter from './rbac-examples';
import processLockRouter from './process-lock-example';
import documentsRouter from './documents';
import factsRouter from './facts';
import generatedDocumentsRouter from './generated-documents';
import auctionsRouter from './auctions';
import workflowRouter from './workflow';
import intelligenceRouter from './intelligence';
import investorRouter from './investor';
import realEstateAssetsRouter from './real-estate-assets';
import financeRouter from './finance';
import crmRouter from './crm';
import matchingRouter from './matching';
import { config } from '../config';

const router = Router();

/**
 * API routes registration
 * All routes are prefixed with /api/{version}
 */

// Tenant isolation (Fonte 73, Fonte 5) - level 0, before any controller. Skips /health, /auth/login, /auth/register, /auth/refresh.
router.use(tenantMiddleware);

// Health check routes
router.use('/health', healthRouter);

// Authentication routes
router.use('/auth', authRouter);

// RBAC example routes (for demonstration)
router.use('/examples', rbacExamplesRouter);

// Process locking example routes
router.use('/processes', processLockRouter);

// Document management routes (Legal Engine)
router.use('/documents', documentsRouter);

// Facts (proof lineage / jump-back)
router.use('/facts', factsRouter);

// Generated documents (from source facts, CPO-gated)
router.use('/generated-documents', generatedDocumentsRouter);

// Auction engine (MPGA workflow)
router.use('/auctions', auctionsRouter);

// Event-driven workflow automation
router.use('/workflow', workflowRouter);

// Rule-bound intelligence (validate, suggest, refuse; no override of CPO/risk/workflow)
router.use('/intelligence', intelligenceRouter);

// Investor Portal (read-only, separate authentication)
router.use('/investor', investorRouter);

// Real Estate Asset Management
router.use('/assets', realEstateAssetsRouter);

// Finance & Accounting
router.use('/finance', financeRouter);

// CRM and Investor Management
router.use('/crm', crmRouter);

// Investor Matching Engine
router.use('/matching', matchingRouter);

// Future: Add more route modules here
// router.use('/users', userRouter);
// router.use('/roles', rolesRouter);
// router.use('/permissions', permissionsRouter);
// router.use('/audit', auditRouter);

/**
 * API info endpoint
 * GET /api/v1
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    version: config.app.apiVersion,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth',
      examples: '/api/v1/examples',
      processes: '/api/v1/processes',
      documents: '/api/v1/documents',
      sanitation_queue: '/api/v1/documents/sanitation-queue',
      facts: '/api/v1/facts',
      generated_documents: '/api/v1/generated-documents',
      auctions: '/api/v1/auctions',
      workflow: '/api/v1/workflow',
      intelligence: '/api/v1/intelligence',
      investor: '/api/v1/investor',
      assets: '/api/v1/assets',
      finance: '/api/v1/finance',
      crm: '/api/v1/crm',
      matching: '/api/v1/matching',
      // Future: Add more endpoints as they're created
    },
  });
});

export default router;
