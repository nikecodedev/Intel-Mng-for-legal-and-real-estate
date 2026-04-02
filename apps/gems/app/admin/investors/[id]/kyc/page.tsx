'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

interface KycData {
  id: string;
  investor_id: string;
  id_document_type?: string;
  id_document_number?: string;
  tax_id?: string;
  address?: string;
  status: string;
  rejection_reason?: string;
  created_at: string;
}

export default function InvestorKycPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();

  const { data: kyc, isLoading } = useQuery(['crm-kyc', id], async () => {
    const res = await api.get(`/crm/kyc/${id}`);
    return (res.data?.kyc ?? res.data?.data ?? res.data) as KycData | null;
  }, { staleTime: 60_000, retry: false });

  // KYC form state
  const [form, setForm] = useState({ id_document_type: 'CPF', id_document_number: '', tax_id: '', address: '' });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Approve/Reject state
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function handleSubmitKyc(e: React.FormEvent) {
    e.preventDefault();
    setSubmitLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/crm/kyc', { investor_id: id, ...form });
      setSuccess('KYC enviado.');
      queryClient.invalidateQueries(['crm-kyc', id]);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao enviar KYC.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleApprove() {
    setActionLoading(true); setError('');
    try {
      await api.put(`/crm/kyc/${kyc?.id}/status`, { status: 'APPROVED' });
      setSuccess('KYC aprovado.');
      queryClient.invalidateQueries(['crm-kyc', id]);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao aprovar.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setError('Por favor, informe o motivo.'); return; }
    setActionLoading(true); setError('');
    try {
      await api.put(`/crm/kyc/${kyc?.id}/status`, { status: 'REJECTED', reason: rejectReason });
      setSuccess('KYC rejeitado.');
      queryClient.invalidateQueries(['crm-kyc', id]);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao rejeitar.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">KYC — Investidor</h1>
        <Link href={`/admin/investors/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao investidor</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

      {isLoading ? <p className="text-sm text-gray-500">Carregando KYC...</p> : kyc && kyc.id ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-500">KYC Atual</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Situação</dt>
            <dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kyc.status === 'APPROVED' ? 'bg-green-100 text-green-700' : kyc.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{kyc.status}</span></dd>
            <dt className="text-gray-600">Tipo de Documento</dt><dd className="font-medium">{kyc.id_document_type ?? '-'}</dd>
            <dt className="text-gray-600">Número do Documento</dt><dd className="font-medium">{kyc.id_document_number ?? '-'}</dd>
            <dt className="text-gray-600">CPF/CNPJ</dt><dd className="font-medium">{kyc.tax_id ?? '-'}</dd>
            <dt className="text-gray-600">Endereço</dt><dd className="font-medium">{kyc.address ?? '-'}</dd>
          </dl>
          {kyc.rejection_reason && <p className="text-sm text-red-600">Motivo da rejeição: {kyc.rejection_reason}</p>}

          {kyc.status === 'PENDING' && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
              <button onClick={handleApprove} disabled={actionLoading} className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">Aprovar</button>
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Motivo da rejeição..." className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()} className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">Rejeitar</button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmitKyc} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-500">Enviar KYC</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tipo de Documento</label>
              <select value={form.id_document_type} onChange={e => setForm(p => ({ ...p, id_document_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="RG">RG</option><option value="PASSPORT">Passaporte</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Número do Documento</label>
              <input value={form.id_document_number} onChange={e => setForm(p => ({ ...p, id_document_number: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tax ID (CPF/CNPJ)</label>
              <input value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Endereço</label>
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={submitLoading} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{submitLoading ? 'Enviando...' : 'Enviar KYC'}</button>
        </form>
      )}
    </div>
  );
}
