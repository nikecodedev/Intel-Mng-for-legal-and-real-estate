'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { BlockLoader } from '@/components/ui';

interface FpdnEntry {
  id: string;
  case_id: string;
  fato_alegado: string;
  prova_vinculada_id: string | null;
  prova_vinculada_title: string | null;
  pagina_paragrafo: string | null;
  direito_aplicavel: string[];
  nexo_causal: string;
  created_at: string;
}

interface DocumentOption {
  id: string;
  title: string;
  document_number: string;
}

interface FpdnForm {
  fato_alegado: string;
  prova_vinculada_id: string;
  pagina_paragrafo: string;
  direito_aplicavel: string;
  nexo_causal: string;
}

async function fetchFpdnEntries(caseId: string) {
  const { data } = await api.get<{ success: boolean; data: { entries: FpdnEntry[]; documents: DocumentOption[] } }>(`/legal-cases/${caseId}/fpdn`);
  return data?.data;
}

export default function FpdnPage() {
  const params = useParams();
  const caseId = params.id as string;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FpdnForm>({
    fato_alegado: '',
    prova_vinculada_id: '',
    pagina_paragrafo: '',
    direito_aplicavel: '',
    nexo_causal: '',
  });

  const { data, isLoading } = useQuery(
    ['fpdn', caseId],
    () => fetchFpdnEntries(caseId),
    { staleTime: 30_000, enabled: !!caseId }
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fato_alegado: form.fato_alegado.trim(),
        prova_vinculada_id: form.prova_vinculada_id || null,
        pagina_paragrafo: form.pagina_paragrafo.trim() || null,
        direito_aplicavel: form.direito_aplicavel.split(',').map((s) => s.trim()).filter(Boolean),
        nexo_causal: form.nexo_causal.trim(),
      };
      const { data } = await api.post(`/legal-cases/${caseId}/fpdn`, payload);
      return data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['fpdn', caseId]);
      setForm({ fato_alegado: '', prova_vinculada_id: '', pagina_paragrafo: '', direito_aplicavel: '', nexo_causal: '' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.reset();
    mutation.mutate();
  };

  if (isLoading) return <BlockLoader message="Carregando analise FPDN..." />;

  const entries = data?.entries ?? [];
  const documents = data?.documents ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Analise FPDN</h2>
          <p className="text-sm text-gray-500">Fato - Prova - Direito - Nexo Causal</p>
        </div>
        <Link href={`/legal/cases/${caseId}`} className="text-sm text-blue-600 hover:underline">
          ← Voltar ao Processo
        </Link>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase">Nova Entrada FPDN</h3>

        {mutation.isError && (
          <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
        {mutation.isSuccess && (
          <div className="rounded-md bg-green-50 p-3 text-green-800 text-sm">
            Entrada FPDN adicionada com sucesso.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fato Alegado *</label>
          <textarea
            value={form.fato_alegado}
            onChange={(e) => setForm((f) => ({ ...f, fato_alegado: e.target.value }))}
            rows={3}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
            placeholder="Descreva o fato alegado..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prova Vinculada</label>
            <select
              value={form.prova_vinculada_id}
              onChange={(e) => setForm((f) => ({ ...f, prova_vinculada_id: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione um documento</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title || doc.document_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pagina / Paragrafo</label>
            <input
              type="text"
              value={form.pagina_paragrafo}
              onChange={(e) => setForm((f) => ({ ...f, pagina_paragrafo: e.target.value }))}
              placeholder="Ex: p. 15, par. 3"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Direito Aplicavel</label>
          <input
            type="text"
            value={form.direito_aplicavel}
            onChange={(e) => setForm((f) => ({ ...f, direito_aplicavel: e.target.value }))}
            placeholder="Separado por virgula: Art. 5 CF, Art. 927 CC"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Separe multiplos dispositivos legais com virgula</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nexo Causal *</label>
          <textarea
            value={form.nexo_causal}
            onChange={(e) => setForm((f) => ({ ...f, nexo_causal: e.target.value }))}
            rows={2}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
            placeholder="Explique a relacao causal entre o fato e o direito..."
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isLoading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isLoading ? 'Adicionando...' : 'Adicionar Entrada'}
        </button>
      </form>

      {/* Tabela de entradas existentes */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Entradas FPDN</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma entrada FPDN cadastrada para este processo.</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="rounded border border-gray-200 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {idx + 1}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleDateString('pt-BR')}</span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <span className="block text-xs font-semibold text-red-600 uppercase">Fato</span>
                    <p className="text-sm text-gray-800">{entry.fato_alegado}</p>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-blue-600 uppercase">Prova</span>
                    <p className="text-sm text-gray-800">
                      {entry.prova_vinculada_title || '—'}
                      {entry.pagina_paragrafo && <span className="text-gray-400 ml-1">({entry.pagina_paragrafo})</span>}
                    </p>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-green-600 uppercase">Direito</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.direito_aplicavel?.length > 0 ? entry.direito_aplicavel.map((d, i) => (
                        <span key={i} className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">{d}</span>
                      )) : <span className="text-sm text-gray-400">—</span>}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-purple-600 uppercase">Nexo Causal</span>
                    <p className="text-sm text-gray-800">{entry.nexo_causal}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
