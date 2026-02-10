import { db } from '../models/database.js';
import { FinancialTransactionModel } from '../models/financial-transaction.js';
import { logger } from '../utils/logger.js';

export interface BankTransaction {
  bank_transaction_id: string;
  transaction_date: string; // ISO date
  transaction_type: 'DEBIT' | 'CREDIT';
  amount_cents: number;
  currency: string;
  description: string;
  memo?: string;
}

export interface BankReconciliationRecord {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  bank_name: string | null;
  account_number: string | null;
  import_source: 'OFX' | 'CSV' | 'MANUAL';
  import_file_name: string | null;
  import_date: Date;
  imported_by: string | null;
  bank_transaction_id: string;
  transaction_date: Date;
  transaction_type: 'DEBIT' | 'CREDIT';
  amount_cents: number;
  currency: string;
  description: string;
  memo: string | null;
  is_reconciled: boolean;
  reconciled_transaction_id: string | null;
  reconciled_at: Date | null;
  reconciled_by: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Bank Reconciliation Service
 * Handles OFX/CSV import and automatic transaction matching
 */
export class BankReconciliationService {
  /**
   * Parse CSV file content
   */
  static parseCSV(csvContent: string): BankTransaction[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const transactions: BankTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        logger.warn('Skipping CSV row with mismatched columns', { row: i, values });
        continue;
      }

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      // Try to extract transaction data (flexible column names)
      const dateStr = row.date || row.transaction_date || row['transaction date'];
      const amountStr = row.amount || row.value || row.amount_cents;
      const description = row.description || row.memo || row.note || row.details || '';
      const type = row.type || row.transaction_type || (parseFloat(amountStr || '0') < 0 ? 'DEBIT' : 'CREDIT');

      if (!dateStr || !amountStr) {
        logger.warn('Skipping CSV row with missing required fields', { row: i });
        continue;
      }

      const amount = Math.abs(Math.round(parseFloat(amountStr) * 100)); // Convert to cents
      const transactionType = type.toUpperCase().includes('DEBIT') || parseFloat(amountStr) < 0 
        ? 'DEBIT' 
        : 'CREDIT';

      transactions.push({
        bank_transaction_id: row.id || row.transaction_id || `CSV-${i}-${Date.now()}`,
        transaction_date: dateStr,
        transaction_type: transactionType,
        amount_cents: amount,
        currency: row.currency || 'BRL',
        description: description,
        memo: row.memo || row.note || null,
      });
    }

    return transactions;
  }

  /**
   * Parse OFX file content (simplified - full OFX parser would be more complex)
   */
  static parseOFX(ofxContent: string): BankTransaction[] {
    // Simplified OFX parser - in production, use a proper OFX library
    const transactions: BankTransaction[] = [];
    
    // Extract STMTTRN blocks (transaction records)
    const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;

    while ((match = stmttrnRegex.exec(ofxContent)) !== null) {
      const block = match[1];
      
      // Extract fields from OFX block
      const trntypeMatch = block.match(/<TRNTYPE>([^<]+)/i);
      const dtpostedMatch = block.match(/<DTPOSTED>([^<]+)/i);
      const trnamtMatch = block.match(/<TRNAMT>([^<]+)/i);
      const fitidMatch = block.match(/<FITID>([^<]+)/i);
      const memoMatch = block.match(/<MEMO>([^<]+)/i);
      const nameMatch = block.match(/<NAME>([^<]+)/i);

      if (!dtpostedMatch || !trnamtMatch || !fitidMatch) {
        logger.warn('Skipping OFX transaction with missing required fields');
        continue;
      }

      const amount = parseFloat(trnamtMatch[1]);
      const transactionType = amount < 0 ? 'DEBIT' : 'CREDIT';
      
      // Parse OFX date (format: YYYYMMDDHHMMSS or YYYYMMDD)
      const dateStr = dtpostedMatch[1];
      let formattedDate: string;
      if (dateStr.length === 14) {
        formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      } else if (dateStr.length === 8) {
        formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      } else {
        logger.warn('Invalid OFX date format', { date: dateStr });
        continue;
      }

      transactions.push({
        bank_transaction_id: fitidMatch[1],
        transaction_date: formattedDate,
        transaction_type: transactionType,
        amount_cents: Math.abs(Math.round(amount * 100)),
        currency: 'BRL', // Default, should be extracted from OFX
        description: nameMatch ? nameMatch[1] : '',
        memo: memoMatch ? memoMatch[1] : null,
      });
    }

    return transactions;
  }

  /**
   * Import bank transactions from file
   */
  static async importBankTransactions(
    tenantId: string,
    userId: string,
    bankAccountId: string,
    bankName: string | null,
    accountNumber: string | null,
    fileContent: string,
    fileName: string,
    fileType: 'OFX' | 'CSV'
  ): Promise<{ imported: number; matched: number; unmatched: number }> {
    // Parse file based on type
    let transactions: BankTransaction[];
    try {
      if (fileType === 'OFX') {
        transactions = this.parseOFX(fileContent);
      } else {
        transactions = this.parseCSV(fileContent);
      }
    } catch (error) {
      logger.error('Failed to parse bank file', { error, fileType, fileName });
      throw new Error(`Failed to parse ${fileType} file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    let imported = 0;
    let matched = 0;
    let unmatched = 0;

    for (const transaction of transactions) {
      try {
        // Check if transaction already exists
        const existing = await db.query<{ id: string }>(
          `SELECT id FROM bank_reconciliation 
           WHERE tenant_id = $1 AND bank_transaction_id = $2`,
          [tenantId, transaction.bank_transaction_id]
        );

        if (existing.rows.length > 0) {
          logger.debug('Bank transaction already imported', {
            bank_transaction_id: transaction.bank_transaction_id,
          });
          continue;
        }

        // Insert bank reconciliation record
        const result = await db.query<{ id: string }>(
          `INSERT INTO bank_reconciliation 
           (tenant_id, bank_account_id, bank_name, account_number, import_source,
            import_file_name, imported_by, bank_transaction_id, transaction_date,
            transaction_type, amount_cents, currency, description, memo, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [
            tenantId,
            bankAccountId,
            bankName,
            accountNumber,
            fileType,
            fileName,
            userId,
            transaction.bank_transaction_id,
            transaction.transaction_date,
            transaction.transaction_type,
            transaction.amount_cents,
            transaction.currency,
            transaction.description,
            transaction.memo || null,
            JSON.stringify(transaction),
          ]
        );

        imported++;

        // Try to auto-match with existing transactions
        const matchResult = await this.autoMatchTransaction(
          tenantId,
          result.rows[0].id,
          transaction
        );

        if (matchResult.matched) {
          matched++;
        } else {
          unmatched++;
        }
      } catch (error) {
        logger.error('Failed to import bank transaction', {
          error,
          transaction: transaction.bank_transaction_id,
        });
      }
    }

    return { imported, matched, unmatched };
  }

  /**
   * Auto-match bank transaction with existing financial transaction
   */
  static async autoMatchTransaction(
    tenantId: string,
    bankReconciliationId: string,
    bankTransaction: BankTransaction
  ): Promise<{ matched: boolean; transactionId?: string; confidence?: number }> {
    // Try to match by amount and date (within 7 days)
    const startDate = new Date(bankTransaction.transaction_date);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(bankTransaction.transaction_date);
    endDate.setDate(endDate.getDate() + 7);

    const matches = await db.query<{
      id: string;
      transaction_date: Date;
      amount_cents: number;
      description: string;
    }>(
      `SELECT id, transaction_date, amount_cents, description
       FROM financial_transactions
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND is_reconciled = false
         AND ABS(amount_cents - $2) <= 1
         AND transaction_date BETWEEN $3 AND $4
         AND payment_status = 'PAID'`,
      [
        tenantId,
        bankTransaction.amount_cents,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
      ]
    );

    if (matches.rows.length === 0) {
      return { matched: false };
    }

    // Use first match (could be improved with better matching logic)
    const match = matches.rows[0];
    const confidence = 0.8; // Basic confidence score

    // Reconcile the transaction
    await db.query(
      `UPDATE financial_transactions 
       SET is_reconciled = true,
           reconciled_at = CURRENT_TIMESTAMP,
           bank_transaction_id = $1
       WHERE id = $2 AND tenant_id = $3`,
      [bankTransaction.bank_transaction_id, match.id, tenantId]
    );

    await db.query(
      `UPDATE bank_reconciliation 
       SET is_reconciled = true,
           reconciled_transaction_id = $1,
           reconciled_at = CURRENT_TIMESTAMP,
           match_confidence = $2,
           match_reason = 'Auto-matched by amount and date'
       WHERE id = $3 AND tenant_id = $4`,
      [match.id, confidence, bankReconciliationId, tenantId]
    );

    return { matched: true, transactionId: match.id, confidence };
  }

  /**
   * Manually reconcile bank transaction with financial transaction
   */
  static async manualReconcile(
    tenantId: string,
    bankReconciliationId: string,
    transactionId: string,
    userId: string
  ): Promise<void> {
    await db.query(
      `UPDATE financial_transactions 
       SET is_reconciled = true,
           reconciled_at = CURRENT_TIMESTAMP,
           reconciled_by = $1
       WHERE id = $2 AND tenant_id = $3`,
      [userId, transactionId, tenantId]
    );

    await db.query(
      `UPDATE bank_reconciliation 
       SET is_reconciled = true,
           reconciled_transaction_id = $1,
           reconciled_at = CURRENT_TIMESTAMP,
           reconciled_by = $2,
           match_confidence = 1.0,
           match_reason = 'Manually reconciled'
       WHERE id = $3 AND tenant_id = $4`,
      [transactionId, userId, bankReconciliationId, tenantId]
    );
  }

  /**
   * Get unreconciled bank transactions
   */
  static async getUnreconciled(
    tenantId: string,
    bankAccountId?: string,
    limit = 50,
    offset = 0
  ): Promise<{ transactions: BankReconciliationRecord[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1', 'is_reconciled = false'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (bankAccountId) {
      conditions.push(`bank_account_id = $${paramCount++}`);
      values.push(bankAccountId);
    }

    const whereClause = conditions.join(' AND ');

    // Get total
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM bank_reconciliation WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    values.push(limit, offset);

    const result = await db.query<BankReconciliationRecord>(
      `SELECT * FROM bank_reconciliation 
       WHERE ${whereClause}
       ORDER BY transaction_date DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      transactions: result.rows,
      total,
    };
  }
}
