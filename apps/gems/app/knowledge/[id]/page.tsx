'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function KnowledgeEntryDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: entry, isLoading } = useQuery(['knowledge-entry', id], async () => {
    const res = await api.get(`/knowledge/entries/${id}`);
    return res.data?.entry ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000 });

  if (isLoading) return <p className="text-sm text-gray-500">Carregando...</p>;
  if (!entry) return <p className="text-sm text-red-600">Entrada não encontrada.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{entry.title}</h1>
        <Link href="/knowledge" className="text-sm text-blue-600 hover:underline">Voltar</Link>
      </div>
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
          <dt className="text-gray-600">Tipo</dt><dd className="font-medium">{entry.entry_type?.replace(/_/g, ' ')}</dd>
          <dt className="text-gray-600">Categoria</dt><dd className="font-medium">{entry.category ?? '-'}</dd>
          <dt className="text-gray-600">Verificado</dt><dd className="font-medium">{entry.is_verified ? 'Sim' : 'Não'}</dd>
          <dt className="text-gray-600">Criado em</dt><dd className="font-medium">{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '-'}</dd>
        </dl>
        {entry.summary && <div className="mb-4"><h3 className="text-xs font-medium text-gray-500 mb-1">Resumo</h3><p className="text-sm text-gray-800">{entry.summary}</p></div>}
        <div><h3 className="text-xs font-medium text-gray-500 mb-1">Conteúdo</h3><div className="text-sm text-gray-800 whitespace-pre-wrap">{entry.content}</div></div>
        {entry.tags && entry.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {entry.tags.map((t: string) => <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t}</span>)}
          </div>
        )}
      </section>
    </div>
  );
}
