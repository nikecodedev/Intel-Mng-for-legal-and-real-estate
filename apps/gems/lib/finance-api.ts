/**
 * Finance module API. Validation errors from backend are surfaced for forms.
 */

import { api, getApiErrorMessage, isApiError } from '@/lib/api';

export { getApiErrorMessage, isApiError };

export type TransactionType = 'PAYABLE' | 'RECEIVABLE' | 'EXPENSE' | 'INCOME' | 'TRANSFER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'OVERDUE';

export interface FinancialTransaction {
  id: string;
  transaction_number: string;
  transaction_type: TransactionType;
  transaction_category: string | null;
  amount_cents: number;
  currency: string;
  transaction_date: string;
  due_date: string | null;
  paid_date: string | null;
  process_id: string | null;
  real_estate_asset_id: string | null;
  client_id: string | null;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  proof_document_id: string | null;
  description: string;
  notes: string | null;
  vendor_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionsListResponse {
  success: boolean;
  transactions: FinancialTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionResponse {
  success: boolean;
  transaction: FinancialTransaction;
}

export interface CreateTransactionInput {
  transaction_type: TransactionType;
  amount_cents: number;
  currency?: string;
  transaction_date: string;
  due_date?: string;
  process_id?: string;
  real_estate_asset_id?: string;
  client_id?: string;
  payment_method?: string;
  payment_reference?: string;
  vendor_name?: string;
  description: string;
  notes?: string;
  tags?: string[];
}

/** Backend validation error: message + optional field details */
export function getFinanceValidationError(error: unknown): { message: string; details?: Record<string, string> } {
  const msg = getApiErrorMessage(error);
  if (!isApiError(error)) return { message: msg };
  const data = error.response?.data as { error?: { details?: unknown } } | undefined;
  const details = data?.error?.details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return { message: msg, details: details as Record<string, string> };
  }
  return { message: msg };
}

export interface ListTransactionsParams {
  transaction_type?: TransactionType;
  payment_status?: PaymentStatus;
  process_id?: string;
  real_estate_asset_id?: string;
  client_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export function fetchTransactions(params: ListTransactionsParams = {}): Promise<TransactionsListResponse> {
  return api.get<TransactionsListResponse>('/finance/transactions', { params }).then((r) => r.data);
}

export function fetchTransactionById(id: string): Promise<FinancialTransaction> {
  return api.get<TransactionResponse>(`/finance/transactions/${id}`).then((r) => {
    if (!r.data?.success || !r.data?.transaction) throw new Error('Invalid response');
    return r.data.transaction;
  });
}

export function createTransaction(input: CreateTransactionInput): Promise<FinancialTransaction> {
  return api.post<TransactionResponse>('/finance/transactions', input).then((r) => {
    if (!r.data?.success || !r.data?.transaction) throw new Error('Invalid response');
    return r.data.transaction;
  });
}

export function markPayment(
  transactionId: string,
  body: { paid_date: string; payment_method: string; payment_reference?: string; proof_document_id: string }
): Promise<FinancialTransaction> {
  return api.post<TransactionResponse>(`/finance/transactions/${transactionId}/mark-payment`, body).then((r) => {
    if (!r.data?.success || !r.data?.transaction) throw new Error('Invalid response');
    return r.data.transaction;
  });
}
