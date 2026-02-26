import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { FinancialTransactionModel, TransactionType, PaymentStatus } from '../models/financial-transaction.js';
import { AccountsPayableModel } from '../models/accounts-payable.js';
import { AccountsReceivableModel } from '../models/accounts-receivable.js';
import { ExpenseCaptureModel, ExpenseStatus } from '../models/expense-capture.js';
import { BankReconciliationService } from '../services/bank-reconciliation.js';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// Schema definitions
// ============================================

const createTransactionSchema = z.object({
  body: z.object({
    transaction_type: z.enum(['PAYABLE', 'RECEIVABLE', 'EXPENSE', 'INCOME', 'TRANSFER']),
    transaction_category: z.string().optional(),
    amount_cents: z.number().int().positive(),
    currency: z.string().length(3).optional(),
    transaction_date: z.string().date(),
    due_date: z.string().date().optional(),
    process_id: z.string().uuid().optional(),
    real_estate_asset_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    payment_method: z.string().optional(),
    payment_reference: z.string().optional(),
    bank_account_id: z.string().optional(),
    vendor_name: z.string().optional(),
    vendor_tax_id: z.string().optional(),
    description: z.string().min(1),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    requires_approval: z.boolean().optional(),
    assigned_to_id: z.string().uuid().optional(),
  }).refine(
    (data) => data.process_id || data.real_estate_asset_id || data.client_id,
    {
      message: 'Transaction must be linked to at least one of: process_id, real_estate_asset_id, or client_id',
    }
  ),
});

const markPaymentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    paid_date: z.string().date(),
    payment_method: z.string().min(1),
    payment_reference: z.string().optional(),
    proof_document_id: z.string().uuid(), // MANDATORY
    bank_transaction_id: z.string().optional(),
  }),
});

const createExpenseSchema = z.object({
  body: z.object({
    expense_date: z.string().date(),
    amount_cents: z.number().int().positive(),
    currency: z.string().length(3).optional(),
    category: z.string().optional(),
    description: z.string().min(1),
    process_id: z.string().uuid().optional(),
    real_estate_asset_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    captured_via: z.enum(['MOBILE', 'WEB', 'API']).optional(),
    captured_location: z.object({
      lat: z.number().optional(),
      lng: z.number().optional(),
      address: z.string().optional(),
    }).optional(),
    receipt_document_id: z.string().uuid().optional(),
    tags: z.array(z.string()).optional(),
  }).refine(
    (data) => data.process_id || data.real_estate_asset_id || data.client_id,
    {
      message: 'Expense must be linked to at least one of: process_id, real_estate_asset_id, or client_id',
    }
  ),
});

// ============================================
// Financial Transactions Routes
// ============================================

/**
 * POST /finance/transactions
 * Create new financial transaction (no orphan transactions)
 */
router.post(
  '/transactions',
  authenticate,
  requirePermission('finance:create'),
  validateRequest(createTransactionSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const transaction = await FinancialTransactionModel.create(
      {
        tenant_id: tenantContext.tenantId,
        ...req.body,
      },
      userId
    );

    // Audit transaction creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'finance.transaction.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'financial_transaction',
      resourceId: transaction.id,
      description: `Created ${transaction.transaction_type} transaction ${transaction.transaction_number}`,
      details: {
        amount_cents: transaction.amount_cents,
        linked_to: {
          process_id: transaction.process_id,
          asset_id: transaction.real_estate_asset_id,
          client_id: transaction.client_id,
        },
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      transaction,
    });
  })
);

/**
 * GET /finance/transactions
 * List financial transactions
 */
router.get(
  '/transactions',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const transaction_type = req.query.transaction_type as TransactionType | undefined;
    const payment_status = req.query.payment_status as PaymentStatus | undefined;
    const process_id = req.query.process_id as string | undefined;
    const real_estate_asset_id = req.query.real_estate_asset_id as string | undefined;
    const client_id = req.query.client_id as string | undefined;
    const is_reconciled = req.query.is_reconciled === 'true' ? true : req.query.is_reconciled === 'false' ? false : undefined;
    const start_date = req.query.start_date as string | undefined; // ISO date YYYY-MM-DD
    const end_date = req.query.end_date as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { transactions, total } = await FinancialTransactionModel.list(tenantContext.tenantId, {
      transaction_type,
      payment_status,
      process_id,
      real_estate_asset_id,
      client_id,
      is_reconciled,
      start_date,
      end_date,
      limit,
      offset,
    });

    res.json({
      success: true,
      transactions,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /finance/transactions/:id
 * Get single transaction
 */
router.get(
  '/transactions/:id',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;

    const transaction = await FinancialTransactionModel.findById(id, tenantContext.tenantId);
    if (!transaction) {
      throw new NotFoundError('Financial transaction');
    }

    res.json({
      success: true,
      transaction,
    });
  })
);

/**
 * POST /finance/transactions/:id/mark-payment
 * Mark payment as paid (MANDATORY proof document required)
 */
router.post(
  '/transactions/:id/mark-payment',
  authenticate,
  requirePermission('finance:update'),
  validateRequest(markPaymentSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    // Validate proof document is provided
    if (!req.body.proof_document_id) {
      throw new ValidationError('Proof document is required to mark payment as paid');
    }

    const transaction = await FinancialTransactionModel.markPayment(
      id,
      tenantContext.tenantId,
      userId,
      req.body
    );

    // Audit payment marking
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'finance.transaction.mark_payment',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'financial_transaction',
      resourceId: transaction.id,
      description: `Marked transaction ${transaction.transaction_number} as paid`,
      details: {
        paid_date: transaction.paid_date,
        payment_method: transaction.payment_method,
        proof_document_id: transaction.proof_document_id,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      transaction,
    });
  })
);

// ============================================
// Accounts Payable Routes
// ============================================

/**
 * GET /finance/payables
 * List accounts payable
 */
router.get(
  '/payables',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const payment_status = req.query.payment_status as string | undefined;
    const overdue_only = req.query.overdue_only === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { payables, total } = await AccountsPayableModel.list(tenantContext.tenantId, {
      payment_status: payment_status as any,
      overdue_only,
      limit,
      offset,
    });

    res.json({
      success: true,
      payables,
      total,
      limit,
      offset,
    });
  })
);

// ============================================
// Accounts Receivable Routes
// ============================================

/**
 * GET /finance/receivables
 * List accounts receivable
 */
router.get(
  '/receivables',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const payment_status = req.query.payment_status as string | undefined;
    const overdue_only = req.query.overdue_only === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { receivables, total } = await AccountsReceivableModel.list(tenantContext.tenantId, {
      payment_status: payment_status as any,
      overdue_only,
      limit,
      offset,
    });

    res.json({
      success: true,
      receivables,
      total,
      limit,
      offset,
    });
  })
);

// ============================================
// Expense Capture Routes (Mobile-Friendly)
// ============================================

/**
 * POST /finance/expenses
 * Create expense (mobile-friendly, PWA-ready)
 */
router.post(
  '/expenses',
  authenticate,
  requirePermission('finance:create'),
  validateRequest(createExpenseSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    const expense = await ExpenseCaptureModel.create(
      {
        tenant_id: tenantContext.tenantId,
        ...req.body,
      },
      userId
    );

    // Audit expense creation
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.CREATE,
      eventType: 'finance.expense.create',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'expense_capture',
      resourceId: expense.id,
      description: `Created expense: ${expense.description} (${expense.amount_cents / 100} ${expense.currency})`,
      details: {
        captured_via: expense.captured_via,
        category: expense.category,
        linked_to: {
          process_id: expense.process_id,
          asset_id: expense.real_estate_asset_id,
          client_id: expense.client_id,
        },
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.status(201).json({
      success: true,
      expense,
    });
  })
);

/**
 * GET /finance/expenses
 * List expenses
 */
router.get(
  '/expenses',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const status = req.query.status as ExpenseStatus | undefined;
    const category = req.query.category as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const { expenses, total } = await ExpenseCaptureModel.list(tenantContext.tenantId, {
      status,
      category,
      limit,
      offset,
    });

    res.json({
      success: true,
      expenses,
      total,
      limit,
      offset,
    });
  })
);

/**
 * POST /finance/expenses/:id/submit
 * Submit expense for approval
 */
router.post(
  '/expenses/:id/submit',
  authenticate,
  requirePermission('finance:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    const expense = await ExpenseCaptureModel.submit(id, tenantContext.tenantId);

    // Audit expense submission
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'finance.expense.submit',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'expense_capture',
      resourceId: expense.id,
      description: `Submitted expense for approval`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      expense,
    });
  })
);

// ============================================
// Bank Reconciliation Routes
// ============================================

/**
 * POST /finance/bank-reconciliation/import
 * Import bank transactions (OFX/CSV)
 */
router.post(
  '/bank-reconciliation/import',
  authenticate,
  requirePermission('finance:import'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;

    // In production, this would handle file upload via multer or similar
    // For now, expecting file content in request body
    const { file_content, file_name, file_type, bank_account_id, bank_name, account_number } = req.body;

    if (!file_content || !file_name || !file_type || !bank_account_id) {
      throw new ValidationError('Missing required fields: file_content, file_name, file_type, bank_account_id');
    }

    if (file_type !== 'OFX' && file_type !== 'CSV') {
      throw new ValidationError('file_type must be OFX or CSV');
    }

    const result = await BankReconciliationService.importBankTransactions(
      tenantContext.tenantId,
      userId,
      bank_account_id,
      bank_name || null,
      account_number || null,
      file_content,
      file_name,
      file_type
    );

    // Audit import
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.IMPORT,
      eventType: 'finance.bank_reconciliation.import',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'bank_reconciliation',
      description: `Imported ${result.imported} bank transactions from ${file_type} file`,
      details: {
        file_name,
        file_type,
        imported: result.imported,
        matched: result.matched,
        unmatched: result.unmatched,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      result,
    });
  })
);

/**
 * GET /finance/bank-reconciliation/unreconciled
 * Get unreconciled bank transactions
 */
router.get(
  '/bank-reconciliation/unreconciled',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const bank_account_id = req.query.bank_account_id as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await BankReconciliationService.getUnreconciled(
      tenantContext.tenantId,
      bank_account_id,
      limit,
      offset
    );

    res.json({
      success: true,
      ...result,
    });
  })
);

export default router;
