'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge, DateDisplay, BlockLoader } from '@/components/ui';

interface LegalCaseDetail {
  id: string;
  case_number: string;
  title: string;
  client_name: string | null;
  status: string;
  qg4_score: number | null;
  deadline: string | null;
  assigned_lawyer_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface LinkedDocument {
  id: string;
  title: string;
  document_number: string;
  status_cpo: string | null;
  created_at: string;
}

async function fetchCase(id: string) {
  const { data } = await api.get<{ success: boolean; data: { case: LegalCaseDetail; documents: LinkedDocument[] } }>(`/legal-cases/${id}`);
  return data?.data;
}

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.id as string;

  const { data, isLoading, error } = useQuery(
    ['legal-case', caseId],
    () => fetchCase(caseId),
    { staleTime: 30_000, enabled: !!caseId }
  );

  if (isLoading) return <BlockLoader message="Carregando processo..." />;

  if (error || !data?.case) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Processo nao encontrado.
      </div>
    );
  }

  const c = data.case;
  const documents = data.documents ?? [];

  const qg4Color = c.qg4_score != null
    ? Number(c.qg4_score) >= 0.90 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
    : 'text-gray-500 bg-gray-50';

  return (
    <div className="space-y-6">
      {/* Cabecalho */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{c.title}</h2>
            <StatusBadge variant="generic" value={c.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">Processo: {c.case_number}</p>
        </div>
        <Link href="/legal/cases" className="text-sm text-blue-600 hover:underline">
          ← Voltar
        </Link>
      </div>

      {/* Dashboard 360 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase">Informacoes</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Cliente</dt>
              <dd className="text-gray-900">{c.client_name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Prazo</dt>
              <dd className="text-gray-900">{c.deadline ? <DateDisplay value={c.deadline} style="short" /> : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Advogado</dt>
              <dd className="text-gray-900">{c.assigned_lawyer_id?.slice(0, 8) || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Criado em</dt>
              <dd className="text-gray-900"><DateDisplay value={c.created_at} style="short" /></dd>
            </div>
          </dl>
          {c.description && (
            <p className="mt-2 text-sm text-gray-600 border-t pt-2">{c.description}</p>
          )}
        </div>

        {/* QG4 Score */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase">Score QG4</h3>
          <div className={`text-3xl font-bold rounded p-3 text-center ${qg4Color}`}>
            {c.qg4_score != null ? Number(c.qg4_score).toFixed(2) : 'N/A'}
          </div>
          {c.qg4_score != null && Number(c.qg4_score) < 0.90 && (
            <p className="text-xs text-red-600 text-center">Score abaixo do minimo (0.90)</p>
          )}
          <div className="pt-2">
            <Link
              href={`/legal/cases/${caseId}/qg4`}
              className="block text-center rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
            >
              Ver Calculo QG4
            </Link>
          </div>
        </div>

        {/* Links rapidos */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase">Acoes</h3>
          <div className="space-y-2">
            <Link
              href={`/legal/cases/${caseId}/fpdn`}
              className="block rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-center"
            >
              Analise FPDN
            </Link>
            <Link
              href={`/legal/cases/${caseId}/qg4`}
              className="block rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-center"
            >
              Motor QG4
            </Link>
          </div>
        </div>
      </div>

      {/* Documentos vinculados */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Documentos Vinculados</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum documento vinculado a este processo.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status CPO</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm">
                    <Link href={`/legal/documents/${doc.id}`} className="text-blue-600 hover:underline">
                      {doc.title || doc.document_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <StatusBadge variant="cpo" value={doc.status_cpo} />
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <DateDisplay value={doc.created_at} style="short" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
