'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge, DateDisplay, BlockLoader } from '@/components/ui';

interface LegalCase {
  id: string;
  case_number: string;
  title: string;
  client_name: string | null;
  status: string;
  qg4_score: number | null;
  deadline: string | null;
  assigned_lawyer_id: string | null;
  created_at: string;
}

async function fetchCases(params: { status?: string; client?: string; deadline?: string }) {
  const { data } = await api.get<{ success: boolean; data: { cases: LegalCase[] } }>('/legal-cases', { params });
  return data?.data?.cases ?? [];
}

export default function LegalCasesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState('');

  const { data: cases, isLoading, error } = useQuery(
    ['legal-cases', statusFilter, clientFilter, deadlineFilter],
    () => fetchCases({
      status: statusFilter || undefined,
      client: clientFilter || undefined,
      deadline: deadlineFilter || undefined,
    }),
    { staleTime: 30_000 }
  );

  if (isLoading) return <BlockLoader message="Carregando processos..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Processos</h2>
        <Link
          href="/legal/cases/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo Processo
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            <option value="ABERTO">Aberto</option>
            <option value="EM_ANDAMENTO">Em Andamento</option>
            <option value="AGUARDANDO">Aguardando</option>
            <option value="ENCERRADO">Encerrado</option>
            <option value="ARQUIVADO">Arquivado</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cliente</label>
          <input
            type="text"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            placeholder="Nome do cliente"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Prazo ate</label>
          <input
            type="date"
            value={deadlineFilter}
            onChange={(e) => setDeadlineFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Tabela */}
      {error || !cases?.length ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhum processo encontrado. Crie um novo processo para comecar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N. Processo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Titulo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">QG4</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prazo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/legal/cases/${c.id}`} className="text-blue-600 hover:underline">
                      {c.case_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.client_name || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <StatusBadge variant="generic" value={c.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {c.qg4_score != null ? `${Number(c.qg4_score).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {c.deadline ? <DateDisplay value={c.deadline} style="short" /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
