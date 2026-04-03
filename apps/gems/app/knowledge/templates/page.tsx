'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function KnowledgeTemplatesPage() {
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery(['knowledge-templates', filter], async () => {
    const params: Record<string, string | number> = { limit: 50, offset: 0 };
    if (filter) params.template_type = filter;
    const res = await api.get('/knowledge/templates', { params });
    return { templates: res.data?.templates ?? [], total: res.data?.total ?? 0 };
  }, { staleTime: 60_000 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Modelos de Documento</h1>
        <Link href="/knowledge/templates/new" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Novo Modelo</Link>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{data?.total ?? 0} modelos</p>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">
          <option value="">Todos os tipos</option>
          <option value="PETITION">Petição</option>
          <option value="LEGAL_DOCUMENT">Documento Legal</option>
          <option value="CHECKLIST">Checklist</option>
        </select>
      </div>
      {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : !data?.templates?.length ? (
        <p className="text-sm text-gray-500">Nenhum modelo encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Categoria</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Usos</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.templates.map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900"><Link href={`/knowledge/templates/${t.id}`} className="text-blue-600 hover:underline">{t.template_name}</Link></td>
                  <td className="px-4 py-3 text-gray-600">{t.template_type}</td>
                  <td className="px-4 py-3 text-gray-600">{t.category ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.usage_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <Link href={`/knowledge/templates/${t.id}`} className="text-xs text-blue-600 hover:underline">Ver</Link>
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
