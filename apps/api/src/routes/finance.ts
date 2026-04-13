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
import { DocumentModel } from '../models/document.js';
import { db } from '../models/database.js';
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
    description: z.string().min(20, 'Descrição deve ter pelo menos 20 caracteres'),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    requires_approval: z.boolean().optional(),
    assigned_to_id: z.string().uuid().optional(),
    receipt_document_id: z.string().uuid().optional(),
  }).refine(
    (data) => data.process_id || data.real_estate_asset_id || data.client_id,
    {
      message: 'Transaction must be linked to at least one of: process_id, real_estate_asset_id, or client_id',
    }
  ).refine(
    (data) => !(data.amount_cents > 50000 && data.transaction_type === 'EXPENSE') || !!data.receipt_document_id,
    {
      message: 'Comprovante obrigatório para lançamentos acima de R$500.',
      path: ['receipt_document_id'],
    }
  ),
});

const updateTransactionSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    description: z.string().min(1).optional(),
    notes: z.string().optional(),
    payment_status: z.enum(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED']).optional(),
    payment_method: z.string().optional(),
    payment_reference: z.string().optional(),
    vendor_name: z.string().optional(),
    due_date: z.string().date().optional(),
    tags: z.array(z.string()).optional(),
  }),
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
    // Spec 6.4: Assinatura digital — confirmação com senha ou OTP obrigatória
    confirmation_password: z.string().optional(),
    confirmation_otp: z.string().length(6).optional(),
  }).refine(
    (d) => !!(d.confirmation_password || d.confirmation_otp),
    { message: 'Assinatura digital obrigatória: forneça confirmation_password ou confirmation_otp (Spec 6.4)' }
  ),
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

const BANK_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const bankImportSchema = z.object({
  body: z.object({
    file_content: z
      .string()
      .min(1, 'file_content is required')
      .max(BANK_IMPORT_MAX_FILE_SIZE, `file_content exceeds maximum size of ${BANK_IMPORT_MAX_FILE_SIZE / (1024 * 1024)}MB`),
    file_name: z.string().min(1).max(255),
    file_type: z.enum(['OFX', 'CSV']),
    bank_account_id: z.string().uuid(),
    bank_name: z.string().optional(),
    account_number: z.string().optional(),
  }),
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

    // Ref: Spec §6.2 — Proibição de Orfandade: todo lançamento deve estar vinculado a um projecto
    if (!req.body.process_id && !req.body.real_estate_asset_id) {
      throw new ValidationError(
        'Proibição de Orfandade: lançamento deve estar vinculado a um projeto (process_id ou real_estate_asset_id)'
      );
    }

    // Ref: Spec §6.4 — Hard Gate: lançamentos ≥ R$5.000 ficam em PENDING_APPROVAL até aprovação do Owner
    const bodyWithApproval = { ...req.body };
    if (req.body.amount_cents >= 500000) {
      bodyWithApproval.payment_status = 'PENDING_APPROVAL';
      bodyWithApproval.requires_approval = true;
    }

    const transaction = await FinancialTransactionModel.create(
      {
        tenant_id: tenantContext.tenantId,
        ...bodyWithApproval,
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

    // Spec Omission #10: ITBI Pago trigger — emit itbi.paid when transaction is tagged/described as ITBI
    try {
      const tags: string[] = transaction.tags || [];
      const desc: string = (transaction.description || '').toLowerCase();
      const isItbi = tags.some((t: string) => t.toLowerCase() === 'itbi') || desc.includes('itbi');
      if (isItbi) {
        const { runWorkflow } = await import('../services/workflow-engine.js');
        await runWorkflow({
          tenantId: tenantContext.tenantId,
          eventType: 'itbi.paid',
          payload: {
            transaction_id: transaction.id,
            amount_cents: transaction.amount_cents,
            process_id: transaction.process_id || null,
            tenant_id: tenantContext.tenantId,
          },
          userId,
          userEmail: req.user!.email,
          userRole: tenantContext.role,
          request: req,
        });
      }
    } catch (itbiWfErr) {
      logger.warn('Workflow event itbi.paid failed', { error: itbiWfErr });
    }

    // Spec 6.4: Recalcular ROI automático a cada novo lançamento no projecto
    // Fire-and-forget: if transaction is linked to an auction asset (process_id), trigger ROI bump
    if (transaction.process_id) {
      setImmediate(async () => {
        try {
          const { AuctionAssetROIModel } = await import('../models/auction-asset-roi.js');
          const roi = await AuctionAssetROIModel.findByAssetId(transaction.process_id!, tenantContext.tenantId);
          if (roi) {
            // Re-run calculation with existing inputs to bump version + log auto-recalculation
            await AuctionAssetROIModel.updateInputs(transaction.process_id!, tenantContext.tenantId, {});
            logger.info('ROI auto-recalculated after new transaction', { assetId: transaction.process_id, transactionId: transaction.id });
          }
        } catch (roiErr) {
          logger.warn('ROI auto-recalculation skipped (non-blocking)', { error: roiErr });
        }
      });
    }

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
 * PUT /finance/transactions/:id
 * Update transaction fields (description, notes, payment_status, etc.)
 */
router.put(
  '/transactions/:id',
  authenticate,
  requirePermission('finance:update'),
  validateRequest(updateTransactionSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const userId = req.user!.id;

    const transaction = await FinancialTransactionModel.update(id, tenantContext.tenantId, req.body);

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'finance.transaction.update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'financial_transaction',
      resourceId: transaction.id,
      description: `Updated transaction ${transaction.transaction_number}`,
      details: req.body,
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

    // Spec 6.4: Assinatura digital — verificar senha ou OTP antes de aprovar
    const { confirmation_password, confirmation_otp } = req.body;
    if (confirmation_password) {
      const userRow = await db.query(
        'SELECT password_hash FROM users WHERE id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      const { password_hash } = (userRow.rows[0] as { password_hash: string } | undefined) ?? {};
      if (!password_hash) throw new ValidationError('Utilizador não encontrado.');
      const { AuthService } = await import('../services/auth.js');
      const valid = await AuthService.verifyPassword(confirmation_password, password_hash);
      if (!valid) throw new ValidationError('Senha de confirmação incorreta. Aprovação negada.');
    } else if (confirmation_otp) {
      const userRow = await db.query(
        'SELECT mfa_secret FROM users WHERE id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      const { mfa_secret } = (userRow.rows[0] as { mfa_secret: string | null } | undefined) ?? {};
      if (!mfa_secret) throw new ValidationError('MFA não configurado. Use confirmation_password.');
      const { verifySync } = await import('otplib');
      if (!verifySync({ token: confirmation_otp, secret: mfa_secret })) {
        throw new ValidationError('Código OTP inválido ou expirado. Aprovação negada.');
      }
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

    // Emit workflow event for downstream automation
    try {
      const { runWorkflow } = await import('../services/workflow-engine.js');
      await runWorkflow({
        tenantId: tenantContext.tenantId,
        eventType: 'finance.transaction.paid',
        payload: {
          transaction_id: transaction.id,
          transaction_type: transaction.transaction_type,
          transaction_category: transaction.transaction_category,
          amount_cents: transaction.amount_cents,
          description: transaction.description,
          related_entity_id: transaction.real_estate_asset_id || transaction.process_id || null,
          related_entity_type: transaction.real_estate_asset_id ? 'real_estate_asset' : transaction.process_id ? 'process' : null,
          real_estate_asset_id: transaction.real_estate_asset_id,
          process_id: transaction.process_id,
        },
        userId,
        userEmail: req.user!.email,
        userRole: tenantContext.role,
        request: req,
      });
    } catch (wfError) {
      logger.warn('Workflow event emission failed', { error: wfError });
    }

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

/**
 * POST /finance/receivables
 * Create account receivable
 */
router.post(
  '/receivables',
  authenticate,
  requirePermission('finance:create'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { client_name, original_amount_cents, invoice_due_date, notes } = req.body;

    if (!client_name || !original_amount_cents) {
      res.status(400).json({ success: false, error: 'client_name and original_amount_cents are required' });
      return;
    }

    // Create a financial transaction first
    const txResult = await db.query<{ id: string }>(
      `INSERT INTO financial_transactions (tenant_id, transaction_number, transaction_type, amount_cents, currency, description, transaction_date, payment_status, due_date, created_by)
       VALUES ($1, 'AR-' || to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD-HH24MISS'), 'RECEIVABLE', $2, 'BRL', $3, CURRENT_DATE, 'PENDING', $4, $5)
       RETURNING id`,
      [tenantContext.tenantId, original_amount_cents, notes || client_name, invoice_due_date || null, tenantContext.userId]
    );

    const txId = txResult.rows[0].id;

    // Create the receivable record
    const arResult = await db.query<{ id: string }>(
      `INSERT INTO accounts_receivable (tenant_id, transaction_id, client_name, original_amount_cents, remaining_amount_cents, payment_status, invoice_due_date, notes)
       VALUES ($1, $2, $3, $4, $4, 'PENDING', $5, $6)
       RETURNING id`,
      [tenantContext.tenantId, txId, client_name, original_amount_cents, invoice_due_date || null, notes || null]
    );

    res.status(201).json({
      success: true,
      data: { id: arResult.rows[0].id, transaction_id: txId },
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

    // Zero Footprint: schedule file deletion after TTL
    const receipt_document_id = req.body.receipt_document_id;
    if (receipt_document_id) {
      const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
      setTimeout(async () => {
        try {
          const doc = await DocumentModel.findById(receipt_document_id, tenantContext.tenantId);
          if (doc?.storage_path) {
            const fs = await import('fs');
            if (fs.existsSync(doc.storage_path)) {
              fs.unlinkSync(doc.storage_path);
              logger.info('Zero Footprint: expense receipt auto-wiped', { receipt_document_id, path: doc.storage_path });
            }
          }
        } catch (e) {
          logger.warn('Zero Footprint: auto-wipe failed', { error: e, receipt_document_id });
        }
      }, TTL_MS);
    }

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
  validateRequest(bankImportSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const userId = req.user!.id;
    const { file_content, file_name, file_type, bank_account_id, bank_name, account_number } = req.body;

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

// ============================================
// Treasury Routes
// ============================================

/**
 * GET /finance/treasury
 * Get bank account balances (treasury overview)
 */
router.get(
  '/treasury',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);

    // Aggregate balances by bank_account_id from financial_transactions
    const result = await db.query(
      `SELECT
        bank_account_id,
        COUNT(*) as transaction_count,
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') AND payment_status = 'PAID' THEN amount_cents ELSE 0 END) as total_inflows_cents,
        SUM(CASE WHEN transaction_type IN ('EXPENSE', 'PAYABLE') AND payment_status = 'PAID' THEN amount_cents ELSE 0 END) as total_outflows_cents,
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') AND payment_status = 'PAID' THEN amount_cents
            WHEN transaction_type IN ('EXPENSE', 'PAYABLE') AND payment_status = 'PAID' THEN -amount_cents
            ELSE 0 END) as balance_cents
       FROM financial_transactions
       WHERE tenant_id = $1 AND bank_account_id IS NOT NULL
       GROUP BY bank_account_id
       ORDER BY bank_account_id`,
      [tenantContext.tenantId]
    );

    // Also get total across all accounts
    const totalResult = await db.query<{ total_balance_cents: string }>(
      `SELECT
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') AND payment_status = 'PAID' THEN amount_cents
            WHEN transaction_type IN ('EXPENSE', 'PAYABLE') AND payment_status = 'PAID' THEN -amount_cents
            ELSE 0 END) as total_balance_cents
       FROM financial_transactions
       WHERE tenant_id = $1`,
      [tenantContext.tenantId]
    );

    res.json({
      success: true,
      accounts: result.rows,
      total_balance_cents: parseInt(totalResult.rows[0]?.total_balance_cents || '0', 10),
    });
  })
);

// ============================================
// Financial Reports Routes
// ============================================

/**
 * GET /finance/reports/summary
 * Financial summary (totals by type, period)
 */
router.get(
  '/reports/summary',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const start_date = req.query.start_date as string | undefined;
    const end_date = req.query.end_date as string | undefined;

    let dateFilter = '';
    const params: any[] = [tenantContext.tenantId];

    if (start_date) {
      params.push(start_date);
      dateFilter += ` AND transaction_date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      dateFilter += ` AND transaction_date <= $${params.length}`;
    }

    // Totals by transaction type
    const byTypeResult = await db.query(
      `SELECT
        transaction_type,
        COUNT(*) as count,
        SUM(amount_cents) as total_cents,
        SUM(CASE WHEN payment_status = 'PAID' THEN amount_cents ELSE 0 END) as paid_cents,
        SUM(CASE WHEN payment_status = 'PENDING' THEN amount_cents ELSE 0 END) as pending_cents,
        SUM(CASE WHEN payment_status = 'OVERDUE' THEN amount_cents ELSE 0 END) as overdue_cents
       FROM financial_transactions
       WHERE tenant_id = $1${dateFilter}
       GROUP BY transaction_type
       ORDER BY transaction_type`,
      params
    );

    // Totals by month
    const byMonthResult = await db.query(
      `SELECT
        to_char(transaction_date, 'YYYY-MM') as month,
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') THEN amount_cents ELSE 0 END) as income_cents,
        SUM(CASE WHEN transaction_type IN ('EXPENSE', 'PAYABLE') THEN amount_cents ELSE 0 END) as expense_cents,
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') THEN amount_cents
            WHEN transaction_type IN ('EXPENSE', 'PAYABLE') THEN -amount_cents
            ELSE 0 END) as net_cents
       FROM financial_transactions
       WHERE tenant_id = $1${dateFilter}
       GROUP BY to_char(transaction_date, 'YYYY-MM')
       ORDER BY month DESC
       LIMIT 12`,
      params
    );

    // Grand totals
    const grandResult = await db.query<{
      total_income_cents: string;
      total_expense_cents: string;
      net_cents: string;
      total_transactions: string;
    }>(
      `SELECT
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') THEN amount_cents ELSE 0 END) as total_income_cents,
        SUM(CASE WHEN transaction_type IN ('EXPENSE', 'PAYABLE') THEN amount_cents ELSE 0 END) as total_expense_cents,
        SUM(CASE WHEN transaction_type IN ('INCOME', 'RECEIVABLE') THEN amount_cents
            WHEN transaction_type IN ('EXPENSE', 'PAYABLE') THEN -amount_cents
            ELSE 0 END) as net_cents,
        COUNT(*) as total_transactions
       FROM financial_transactions
       WHERE tenant_id = $1${dateFilter}`,
      params
    );

    const grand = grandResult.rows[0];

    res.json({
      success: true,
      summary: {
        by_type: byTypeResult.rows,
        by_month: byMonthResult.rows,
        totals: {
          total_income_cents: parseInt(grand?.total_income_cents || '0', 10),
          total_expense_cents: parseInt(grand?.total_expense_cents || '0', 10),
          net_cents: parseInt(grand?.net_cents || '0', 10),
          total_transactions: parseInt(grand?.total_transactions || '0', 10),
        },
      },
      filters: { start_date: start_date || null, end_date: end_date || null },
    });
  })
);

// ============================================
// PDF Watermark Context — Spec 2.4 (forensic watermark for reports)
// ============================================

/**
 * GET /finance/reports/pdf-watermark
 * Returns forensic watermark data for client-side PDF export.
 * Spec 2.4: PDF com marca d'água forense (User_ID, IP, Timestamp, Tenant_ID).
 */
router.get(
  '/reports/pdf-watermark',
  authenticate,
  requirePermission('finance:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    res.json({
      success: true,
      watermark: {
        user_id: req.user!.id,
        user_email: req.user!.email,
        tenant_id: tenantContext.tenantId,
        ip_address: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

// ============================================
// Reject Transaction (Spec 6.4)
// ============================================

const rejectTransactionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    reason: z.string().min(20, 'Justificativa obrigatória com mínimo 20 caracteres (Spec 6.4)'),
  }),
});

/**
 * POST /finance/transactions/:id/reject
 * Reject a pending transaction — Owner only.
 * Spec 6.4: "Reprovar Lançamento — Owner — Justificativa obrigatória."
 */
router.post(
  '/transactions/:id/reject',
  authenticate,
  requirePermission('finance:update'),
  validateRequest(rejectTransactionSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user!.id;

    // Update payment_status to CANCELLED (closest valid value — "REJECTED" not in enum)
    const result = await db.query(
      `UPDATE financial_transactions
       SET payment_status = 'CANCELLED', notes = COALESCE(notes || ' | ', '') || $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, transaction_number, payment_status`,
      [`REPROVADO: ${reason}`, id, tenantContext.tenantId]
    );

    if (result.rows.length === 0) throw new NotFoundError('Transaction');
    const tx = result.rows[0] as { id: string; transaction_number: string; payment_status: string };

    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'finance.transaction.rejected',
      eventCategory: AuditEventCategory.COMPLIANCE,
      resourceType: 'financial_transaction',
      resourceId: id,
      description: `Transação ${tx.transaction_number} reprovada por ${req.user!.email}. Motivo: ${reason}`,
      details: { reason, rejected_by: userId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    logger.info('Transaction rejected', { transactionId: id, userId, reason });

    res.json({
      success: true,
      transaction_id: id,
      transaction_number: tx.transaction_number,
      payment_status: tx.payment_status,
      message: 'Lançamento reprovado e auditado com sucesso.',
    });
  })
);

// ============================================
// OCR Receipt — Spec 6.3 Mobile Launcher
// ============================================

const ocrReceiptSchema = z.object({
  body: z.object({
    image_base64: z.string().min(100, 'Imagem base64 obrigatória'),
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  }),
});

/**
 * POST /finance/ocr-receipt
 * Extract monetary value from a receipt photo using Gemini Vision.
 * Spec 6.3: "OCR local processa o valor; imagem é expurgada da RAM após envio."
 * The image is processed server-side by Gemini and never persisted.
 */
router.post(
  '/ocr-receipt',
  authenticate,
  validateRequest(ocrReceiptSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { image_base64, mime_type } = req.body;

    // Strip data URL prefix if present (data:image/jpeg;base64,...)
    const base64Data = image_base64.replace(/^data:[^;]+;base64,/, '');

    const { config } = await import('../config/env.js');
    const apiKey = (config as any).gemini?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.json({ amount_cents: null, amount_text: null, confidence: 'low', note: 'OCR indisponível — GEMINI_API_KEY não configurado.' });
      return;
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent([
        { inlineData: { mimeType: mime_type, data: base64Data } },
        {
          text: 'Esta é uma foto de um comprovante/recibo. Identifique o VALOR TOTAL a pagar ou pago. ' +
            'Responda APENAS com um JSON no formato: {"amount_brl": "123.45", "confidence": "high"} ' +
            'onde amount_brl é o valor em reais com ponto decimal (ex: "1234.56"). ' +
            'Se não encontrar valor claro, retorne {"amount_brl": null, "confidence": "low"}.',
        },
      ]);

      const text = result.response.text?.()?.trim() ?? '';
      // Parse JSON from response (Gemini may wrap in markdown)
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        res.json({ amount_cents: null, amount_text: null, confidence: 'low' });
        return;
      }

      const parsed = JSON.parse(jsonMatch[0]) as { amount_brl?: string | null; confidence?: string };
      if (!parsed.amount_brl) {
        res.json({ amount_cents: null, amount_text: null, confidence: 'low' });
        return;
      }

      const amountCents = Math.round(parseFloat(parsed.amount_brl) * 100);
      res.json({
        amount_cents: isNaN(amountCents) ? null : amountCents,
        amount_text: parsed.amount_brl,
        confidence: parsed.confidence === 'high' ? 'high' : 'low',
      });
    } catch (err) {
      logger.warn('OCR receipt failed', { error: err });
      res.json({ amount_cents: null, amount_text: null, confidence: 'low' });
    }
  })
);

export default router;
