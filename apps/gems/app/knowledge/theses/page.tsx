'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Thesis {
  id: string;
  title: string;
  entry_type: string;
  summary?: string;
  category?: string;
  is_verified: boolean;
  status?: string; // ATIVA or OBSOLETA
  created_at: string;
}

export default function KnowledgeThesesPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadTheses();
  }, []);

  async function loadTheses() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/knowledge/entries', { params: { entry_type: 'LEGAL_THESIS', limit: 100 } });
      const list = data?.entries ?? data?.data ?? [];
      // Add default status based on is_verified
      const mapped = (Array.isArray(list) ? list : []).map((t: any) => ({
        ...t,
        status: t.status ?? (t.is_verified ? 'ATIVA' : 'OBSOLETA'),
      }));
      setTheses(mapped);
    } catch {
      setError('Nao foi possivel carregar teses.');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(thesis: Thesis) {
    setTogglingId(thesis.id);
    const newStatus = thesis.status === 'ATIVA' ? 'OBSOLETA' : 'ATIVA';
    try {
      await api.put(`/knowledge/entries/${thesis.id}`, {
        is_verified: newStatus === 'ATIVA',
        metadata: { status: newStatus },
      });
      setTheses((prev) =>
        prev.map((t) => (t.id === thesis.id ? { ...t, status: newStatus, is_verified: newStatus === 'ATIVA' } : t))
      );
    } catch {
      setError('Falha ao alterar status da tese.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Teses Juridicas</h1>
        <Link href="/knowledge" className="text-sm text-blue-600 hover:underline">Voltar a Biblioteca</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando teses...</p>
      ) : theses.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Nenhuma tese juridica encontrada.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Titulo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acao</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {theses.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link href={`/knowledge/${t.id}`} className="text-blue-600 hover:underline">{t.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.category ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      t.status === 'ATIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(t)}
                      disabled={togglingId === t.id}
                      className={`rounded px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        t.status === 'ATIVA'
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {togglingId === t.id ? '...' : t.status === 'ATIVA' ? 'Marcar Obsoleta' : 'Marcar Ativa'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Nota: A indexacao automatica de teses via QG4 sera ativada quando o Quality Gate 4 estiver habilitado.
      </p>
    </div>
  );
}
