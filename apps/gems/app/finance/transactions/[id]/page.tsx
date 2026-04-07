'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { StatusBadge, DateDisplay, CurrencyDisplay, BlockLoader } from '@/components/ui';
import {
  fetchTransactionById,
  markPayment,
  updateTransaction,
  getFinanceValidationError,
  type FinancialTransaction,
  type PaymentStatus,
} from '@/lib/finance-api';
import { uploadDocument } from '@/lib/legal-api';

export default function TransactionDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatus>('PENDING');
  const [editNotes, setEditNotes] = useState('');
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: transaction, isLoading, error } = useQuery(
    ['finance-transaction', id],
    () => fetchTransactionById(id),
    { staleTime: 30 * 1000 }
  );

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!proofFile) throw new Error('Please select a proof file');
      const formData = new FormData();
      formData.append('file', proofFile);
      formData.append('title', `Payment proof - ${transaction?.transaction_number ?? id}`);
      formData.append('document_type', 'OTHER');
      const docResult = await uploadDocument(formData);
      return markPayment(id, {
        paid_date: paidDate,
        payment_method: paymentMethod,
        proof_document_id: docResult.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['finance-transaction', id]);
      queryClient.invalidateQueries('finance-transactions');
      setShowMarkPaid(false);
      setProofFile(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      return updateTransaction(id, {
        description: editDescription,
        payment_status: editPaymentStatus,
        notes: editNotes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['finance-transaction', id]);
      queryClient.invalidateQueries('finance-transactions');
      setEditMsg({ type: 'success', text: 'Transacao atualizada com sucesso.' });
      setShowEdit(false);
    },
    onError: (err: unknown) => {
      const ve = getFinanceValidationError(err);
      setEditMsg({ type: 'error', text: ve.message || 'Falha ao atualizar transacao.' });
    },
  });

  const validationError = markPaidMutation.isError ? getFinanceValidationError(markPaidMutation.error) : null;

  if (isLoading) return <BlockLoader message="Carregando transacao..." />;

  if (error || !transaction) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Transacao nao encontrada ou voce nao tem acesso.
      </div>
    );
  }

  const t = transaction as FinancialTransaction;
  const canMarkPaid = t.payment_status === 'PENDING' || t.payment_status === 'OVERDUE' || t.payment_status === 'PARTIAL';

  function openEditForm() {
    setEditDescription(t.description ?? '');
    setEditPaymentStatus(t.payment_status ?? 'PENDING');
    setEditNotes(t.notes ?? '');
    setEditMsg(null);
    setShowEdit(true);
  }

  const paymentStatusLabels: Record<PaymentStatus, string> = {
    PENDING: 'Pendente',
    PAID: 'Pago',
    PARTIAL: 'Parcial',
    OVERDUE: 'Vencido',
    CANCELLED: 'Cancelado',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 font-mono">{t.transaction_number}</h2>
        <Link href="/finance" className="text-sm text-blue-600 hover:underline">
          &larr; Voltar para lista
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Status</h3>
        <div className="flex items-center gap-3">
          <StatusBadge variant="payment" value={t.payment_status} />
          {t.paid_date && (
            <span className="text-sm text-gray-600">Pago em <DateDisplay value={t.paid_date} style="medium" /></span>
          )}
          {t.proof_document_id && (
            <Link
              href={`/legal/documents/${t.proof_document_id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              Ver comprovante
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-500">Detalhes</h3>
          {!showEdit && (
            <button
              type="button"
              onClick={openEditForm}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Editar
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Tipo</dt>
          <dd className="font-medium">{t.transaction_type}</dd>
          <dt className="text-gray-600">Valor</dt>
          <dd className="font-medium"><CurrencyDisplay cents={t.amount_cents} /></dd>
          <dt className="text-gray-600">Data da transacao</dt>
          <dd className="font-medium"><DateDisplay value={t.transaction_date} style="medium" /></dd>
          <dt className="text-gray-600">Data de vencimento</dt>
          <dd className="font-medium"><DateDisplay value={t.due_date} style="medium" /></dd>
          <dt className="text-gray-600">Descricao</dt>
          <dd className="font-medium">{t.description}</dd>
          {t.notes && (
            <>
              <dt className="text-gray-600">Observacoes</dt>
              <dd className="font-medium">{t.notes}</dd>
            </>
          )}
          {t.vendor_name && (
            <>
              <dt className="text-gray-600">Fornecedor</dt>
              <dd className="font-medium">{t.vendor_name}</dd>
            </>
          )}
          {t.process_id && (
            <>
              <dt className="text-gray-600">Processo</dt>
              <dd className="font-medium font-mono text-xs">{t.process_id}</dd>
            </>
          )}
          {t.real_estate_asset_id && (
            <>
              <dt className="text-gray-600">Imovel</dt>
              <dd className="font-medium">
                <Link href={`/real-estate/${t.real_estate_asset_id}`} className="text-blue-600 hover:underline">
                  {t.real_estate_asset_id.slice(0, 8)}...
                </Link>
              </dd>
            </>
          )}
        </dl>
      </section>

      {/* Edit form */}
      {showEdit && (
        <section className="rounded-lg border border-blue-200 bg-blue-50/30 p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Editar Transacao</h3>
          {editMsg && (
            <div className={`mb-4 rounded-lg border p-3 text-sm ${editMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {editMsg.text}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descricao *</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status de pagamento</label>
              <select
                value={editPaymentStatus}
                onChange={(e) => setEditPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {(Object.entries(paymentStatusLabels) as [PaymentStatus, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Observacoes adicionais..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => editMutation.mutate()}
                disabled={!editDescription.trim() || editMutation.isLoading}
                className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editMutation.isLoading ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
              <button
                type="button"
                onClick={() => { setShowEdit(false); setEditMsg(null); }}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </section>
      )}

      {canMarkPaid && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          {!showMarkPaid ? (
            <button
              type="button"
              onClick={() => setShowMarkPaid(true)}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Marcar como pago (enviar comprovante)
            </button>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Marcar como pago</h3>
              {validationError && (
                <div className="rounded-md bg-red-50 p-4 text-red-800 text-sm" role="alert">
                  <p className="font-medium">{validationError.message}</p>
                  {validationError.details && (
                    <ul className="mt-2 list-disc list-inside">
                      {Object.entries(validationError.details).map(([key, val]) => (
                        <li key={key}>{key}: {val}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data do pagamento *</label>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Metodo de pagamento *</label>
                  <input
                    type="text"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    placeholder="Ex: PIX, Transferencia"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comprovante (upload de arquivo) *</label>
                <input
                  ref={proofInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700"
                />
                <p className="mt-1 text-xs text-gray-500">O arquivo sera enviado para documentos; o comprovante e obrigatorio para marcar como pago.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => markPaidMutation.mutate()}
                  disabled={!proofFile || markPaidMutation.isLoading}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {markPaidMutation.isLoading ? 'Enviando e marcando...' : 'Confirmar pagamento'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMarkPaid(false);
                    setProofFile(null);
                    markPaidMutation.reset();
                  }}
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
