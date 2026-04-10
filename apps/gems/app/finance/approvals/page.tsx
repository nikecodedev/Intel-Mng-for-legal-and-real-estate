'use client';

import { useQuery, useQueryClient } from 'react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

type ModalMode = 'approve' | 'reject' | null;

interface PendingTx {
  id: string;
  transaction_number: string;
  amount_cents: number;
  description: string;
  transaction_date: string;
}

export default function FinanceApprovalsPage() {
  const queryClient = useQueryClient();
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [activeTx, setActiveTx] = useState<PendingTx | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Approve modal fields — Spec 6.4: assinatura digital
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmOtp, setConfirmOtp] = useState('');
  const [useOtp, setUseOtp] = useState(false);
  const [proofDocId, setProofDocId] = useState('');

  // Reject modal fields
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery('finance-approvals', async () => {
    const res = await api.get('/finance/transactions', { params: { payment_status: 'PENDING', limit: 100 } });
    const all = res.data?.transactions ?? [];
    return all.filter((t: any) => (t.amount_cents ?? 0) >= 500000) as PendingTx[];
  }, { staleTime: 30_000 });

  function openApprove(tx: PendingTx) {
    setActiveTx(tx);
    setModalMode('approve');
    setConfirmPassword(''); setConfirmOtp(''); setUseOtp(false); setProofDocId('');
    setActionMsg(null);
  }

  function openReject(tx: PendingTx) {
    setActiveTx(tx);
    setModalMode('reject');
    setRejectReason('');
    setActionMsg(null);
  }

  function closeModal() { setModalMode(null); setActiveTx(null); }

  async function handleApprove() {
    if (!activeTx) return;
    if (useOtp && confirmOtp.length !== 6) {
      setActionMsg({ type: 'error', text: 'OTP deve ter 6 dígitos.' }); return;
    }
    if (!useOtp && !confirmPassword.trim()) {
      setActionMsg({ type: 'error', text: 'Senha de confirmação obrigatória (Spec 6.4).' }); return;
    }
    if (!proofDocId.trim()) {
      setActionMsg({ type: 'error', text: 'ID do documento comprobatório obrigatório.' }); return;
    }

    setSubmitting(true);
    try {
      await api.post(`/finance/transactions/${activeTx.id}/mark-payment`, {
        paid_date: new Date().toISOString().split('T')[0],
        payment_method: 'APROVACAO_OWNER',
        proof_document_id: proofDocId.trim(),
        ...(useOtp ? { confirmation_otp: confirmOtp } : { confirmation_password: confirmPassword }),
      });
      setActionMsg({ type: 'success', text: `Transação ${activeTx.transaction_number} aprovada com assinatura digital.` });
      queryClient.invalidateQueries('finance-approvals');
      closeModal();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao aprovar.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!activeTx) return;
    if (rejectReason.trim().length < 20) {
      setActionMsg({ type: 'error', text: 'Justificativa mínima de 20 caracteres (Spec 6.4).' }); return;
    }
    setSubmitting(true);
    try {
      await api.post(`/finance/transactions/${activeTx.id}/reject`, { reason: rejectReason.trim() });
      setActionMsg({ type: 'success', text: `Transação ${activeTx.transaction_number} reprovada.` });
      queryClient.invalidateQueries('finance-approvals');
      closeModal();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao reprovar.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Aprovações Pendentes (&gt; R$5.000)</h2>
      <p className="text-sm text-gray-500">Lançamentos acima de R$5.000 que requerem aprovação do Owner com assinatura digital.</p>

      {actionMsg && (
        <div className={`rounded-lg border p-3 text-sm ${actionMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {actionMsg.text}
        </div>
      )}

      {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : !data || data.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-sm text-green-700">Nenhuma aprovação pendente.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Data</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{tx.transaction_number}</td>
                  <td className="px-4 py-3 font-bold text-red-600">
                    R$ {((tx.amount_cents ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{tx.description ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openApprove(tx)}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                      Aprovar
                    </button>
                    <button onClick={() => openReject(tx)}
                      className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700">
                      Reprovar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Approve Modal (Spec 6.4: assinatura digital) ── */}
      {modalMode === 'approve' && activeTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Aprovar Lançamento</h3>
            <p className="text-sm text-gray-500">
              Transação <span className="font-mono">{activeTx.transaction_number}</span> —{' '}
              <strong>R$ {(activeTx.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID do Documento Comprobatório <span className="text-red-500">*</span>
              </label>
              <input type="text" value={proofDocId} onChange={e => setProofDocId(e.target.value)}
                placeholder="UUID do documento já enviado"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono" />
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-600 font-medium">Assinatura digital (Spec 6.4):</span>
              <button onClick={() => setUseOtp(false)}
                className={`px-2 py-0.5 rounded text-xs border ${!useOtp ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                Senha
              </button>
              <button onClick={() => setUseOtp(true)}
                className={`px-2 py-0.5 rounded text-xs border ${useOtp ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                OTP
              </button>
            </div>

            {!useOtp ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha de Confirmação</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código OTP (6 dígitos)</label>
                <input type="text" inputMode="numeric" maxLength={6} value={confirmOtp}
                  onChange={e => setConfirmOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000" className="w-full rounded border border-gray-300 px-3 py-2 text-sm tracking-widest text-center font-mono" />
              </div>
            )}

            {actionMsg?.type === 'error' && (
              <p className="text-sm text-red-600">{actionMsg.text}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={handleApprove} disabled={submitting}
                className="flex-1 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {submitting ? 'Processando...' : 'Confirmar Aprovação'}
              </button>
              <button onClick={closeModal} disabled={submitting}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal (Spec 6.4: justificativa obrigatória) ── */}
      {modalMode === 'reject' && activeTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Reprovar Lançamento</h3>
            <p className="text-sm text-gray-500">
              Transação <span className="font-mono">{activeTx.transaction_number}</span> —{' '}
              <strong>R$ {(activeTx.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Justificativa <span className="text-red-500">*</span>
                <span className="ml-2 text-xs text-gray-400">{rejectReason.length}/20 mín.</span>
              </label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                rows={3} placeholder="Descreva o motivo da reprovação (mínimo 20 caracteres)..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-none" />
            </div>

            {actionMsg?.type === 'error' && (
              <p className="text-sm text-red-600">{actionMsg.text}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={handleReject} disabled={submitting || rejectReason.trim().length < 20}
                className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {submitting ? 'Processando...' : 'Confirmar Reprovação'}
              </button>
              <button onClick={closeModal} disabled={submitting}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
