'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

const ROLES = ['OWNER', 'ADMIN', 'ADVOGADO', 'ADVOGADO_SENIOR', 'ANALISTA_LEILOES', 'GESTOR_IMOBILIARIO', 'FINANCEIRO', 'INVESTIDOR', 'AUDITOR'];
const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário', ADMIN: 'Administrador', ADVOGADO: 'Advogado', ADVOGADO_SENIOR: 'Advogado Sênior',
  ANALISTA_LEILOES: 'Analista de Leilões', GESTOR_IMOBILIARIO: 'Gestor Imobiliário', FINANCEIRO: 'Financeiro',
  INVESTIDOR: 'Investidor', AUDITOR: 'Auditor',
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'ADVOGADO', password: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading } = useQuery('admin-users', async () => {
    const res = await api.get('/auth/users', { params: { limit: 200 } });
    return res.data?.users ?? res.data?.data ?? [];
  }, { staleTime: 60_000, retry: false });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      await api.post('/auth/register', { ...form });
      setMsg({ type: 'success', text: 'Utilizador criado.' });
      setShowCreate(false);
      setForm({ email: '', first_name: '', last_name: '', role: 'ADVOGADO', password: '' });
      queryClient.invalidateQueries('admin-users');
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao criar utilizador.' });
    } finally { setLoading(false); }
  }

  return (
    <DashboardLayout title="Gestão de Utilizadores">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Utilizadores</h1>
          <button onClick={() => setShowCreate(!showCreate)} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Novo Utilizador</button>
        </div>

        {msg && <div className={`rounded-lg border p-3 text-sm ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

        {showCreate && (
          <form onSubmit={handleCreate} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <h3 className="text-sm font-medium text-blue-800">Novo Utilizador</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-600 mb-1">Nome</label><input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Sobrenome</label><input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">E-mail</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Senha</label><input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={8} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs text-gray-600 mb-1">Perfil</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-50">{loading ? 'Criando...' : 'Criar'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">Cancelar</button>
            </div>
          </form>
        )}

        {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : !data || data.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum utilizador encontrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nome</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">E-mail</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Perfil</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Ativo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{ROLE_LABELS[u.role] || u.role || '—'}</span></td>
                    <td className="px-4 py-3"><span className={`inline-block w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}`} /></td>
                    <td className="px-4 py-3 text-gray-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
