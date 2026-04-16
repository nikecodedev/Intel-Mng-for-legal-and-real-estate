'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BlockLoader } from '@/components/ui';

interface PartnerOffice {
  id: string;
  name: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  specialty: string | null;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  ATIVO: 'bg-green-100 text-green-800',
  INATIVO: 'bg-gray-100 text-gray-600',
  SUSPENSO: 'bg-red-100 text-red-800',
};

export default function EscritoriosPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', cnpj: '', email: '', phone: '',
    address: '', city: '', state: '',
    responsible_name: '', responsible_email: '',
    specialty: '', notes: '',
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError } = useQuery(
    ['partner-offices', search, statusFilter],
    async () => {
      const res = await api.get('/partner-offices', {
        params: {
          ...(search ? { search } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      });
      return (res.data?.data?.offices ?? []) as PartnerOffice[];
    },
    { staleTime: 30_000 }
  );

  const createMutation = useMutation(
    async (payload: typeof form) => {
      const res = await api.post('/partner-offices', payload);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('partner-offices');
        setShowForm(false);
        setForm({ name: '', cnpj: '', email: '', phone: '', address: '', city: '', state: '', responsible_name: '', responsible_email: '', specialty: '', notes: '' });
        setFormError('');
      },
      onError: (err: any) => {
        setFormError(err?.response?.data?.error?.message ?? 'Erro ao criar escritório.');
      },
    }
  );

  const toggleStatusMutation = useMutation(
    async ({ id, status }: { id: string; status: string }) => {
      await api.patch(`/partner-offices/${id}`, { status });
    },
    { onSuccess: () => queryClient.invalidateQueries('partner-offices') }
  );

  const offices = data ?? [];

  const stats = {
    total: offices.length,
    ativo: offices.filter(o => o.status === 'ATIVO').length,
    inativo: offices.filter(o => o.status === 'INATIVO').length,
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Escritórios Parceiros</h1>
          <p className="text-sm text-gray-500 mt-0.5">Escritórios de advocacia e parceiros jurídicos do tenant.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : '+ Novo Escritório'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Ativos', value: stats.ativo, color: 'text-green-700' },
          { label: 'Inativos', value: stats.inativo, color: 'text-gray-500' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* New Office Form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-4">Novo Escritório Parceiro</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ['name', 'Nome do Escritório *', 'text'],
              ['cnpj', 'CNPJ', 'text'],
              ['email', 'E-mail', 'email'],
              ['phone', 'Telefone', 'text'],
              ['responsible_name', 'Responsável', 'text'],
              ['responsible_email', 'E-mail do Responsável', 'email'],
              ['specialty', 'Especialidade', 'text'],
              ['city', 'Cidade', 'text'],
              ['state', 'UF', 'text'],
            ].map(([field, label, type]) => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Endereço</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isLoading || !form.name.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isLoading ? 'Salvando...' : 'Salvar Escritório'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(''); }}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, responsável ou e-mail..."
          className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os status</option>
          <option value="ATIVO">Ativo</option>
          <option value="INATIVO">Inativo</option>
          <option value="SUSPENSO">Suspenso</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <BlockLoader message="Carregando escritórios..." />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Falha ao carregar escritórios parceiros.
        </div>
      ) : offices.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">Nenhum escritório parceiro cadastrado.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Cadastrar o primeiro escritório
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Escritório</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Responsável</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Especialidade</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Localização</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {offices.map(office => (
                <tr key={office.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{office.name}</p>
                    {office.cnpj && <p className="text-xs text-gray-400">{office.cnpj}</p>}
                    {office.email && (
                      <a href={`mailto:${office.email}`} className="text-xs text-blue-500 hover:underline">
                        {office.email}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{office.responsible_name ?? '—'}</p>
                    {office.responsible_email && (
                      <a href={`mailto:${office.responsible_email}`} className="text-xs text-blue-500 hover:underline">
                        {office.responsible_email}
                      </a>
                    )}
                    {office.phone && <p className="text-xs text-gray-400">{office.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{office.specialty ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {office.city && office.state ? `${office.city} – ${office.state}` : office.city ?? office.state ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[office.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {office.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {office.status === 'ATIVO' ? (
                      <button
                        onClick={() => toggleStatusMutation.mutate({ id: office.id, status: 'INATIVO' })}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleStatusMutation.mutate({ id: office.id, status: 'ATIVO' })}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Ativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
            {offices.length} escritório{offices.length !== 1 ? 's' : ''} encontrado{offices.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
