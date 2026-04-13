'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

/**
 * Spec §4.4 — Autorização de Lance F3 (pré-lance)
 * Formulário dedicado com:
 *   - Teto Autorizado (Owner) — valor máximo do lance
 *   - Certidões Anexadas — checkbox obrigatório
 *   - Justificativa — mínimo 200 caracteres
 *
 * Diferente do Override de Lance (exceção pós-bloqueio),
 * este é o formulário de autorização pré-lance obrigatório.
 */
export default function AuthorizeBidPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [tetoAutorizado, setTetoAutorizado] = useState('');
  const [certidoesAnexadas, setCertidoesAnexadas] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [documentoId, setDocumentoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const justificativaOk = justificativa.length >= 200;
  const tetoOk = parseFloat(tetoAutorizado) > 0;
  const canSubmit = tetoOk && certidoesAnexadas && justificativaOk && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const payload: Record<string, unknown> = {
        teto_autorizado: Math.round(parseFloat(tetoAutorizado) * 100),
        certidoes_anexadas: true,
        justificativa,
      };
      if (documentoId.trim()) {
        payload.documento_autorizacao_id = documentoId.trim();
      }

      const res = await api.post<{ auth_id: string; message: string }>(
        `/auctions/assets/${id}/authorize-bid`,
        payload
      );

      setSuccess(
        `Autorização registrada com sucesso (ID: ${res.data.auth_id}). ` +
        'O lance foi pré-autorizado conforme Spec §4.4.'
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Falha ao registrar autorização. Verifique os dados e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout title="Autorização de Lance F3">
      <div className="max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Autorização de Lance — F3</h1>
            <p className="mt-1 text-sm text-gray-500">
              Spec §4.4 — Formulário pré-lance obrigatório. Distinto do override de exceção.
            </p>
          </div>
          <Link
            href={`/auctions/${id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Voltar ao ativo
          </Link>
        </div>

        {/* Info banner */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <strong>O que é isto?</strong> A Autorização de Lance F3 é o formulário pré-lance
          da spec §4.4. Define o teto financeiro autorizado pelo Owner, confirma que as
          certidões foram anexadas e exige justificativa mínima de 200 caracteres. Não
          confundir com o Override de Lance, que é mecanismo de exceção pós-bloqueio.
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">

          {/* Teto Autorizado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teto Autorizado pelo Owner <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Valor máximo (R$) que o responsável está autorizado a lançar neste ativo.
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={tetoAutorizado}
                onChange={(e) => setTetoAutorizado(e.target.value)}
                placeholder="0,00"
                required
                className="w-full rounded border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {tetoAutorizado && !tetoOk && (
              <p className="mt-1 text-xs text-red-600">Valor deve ser maior que zero.</p>
            )}
          </div>

          {/* Certidões Anexadas */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={certidoesAnexadas}
                onChange={(e) => setCertidoesAnexadas(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                required
              />
              <div>
                <span className="block text-sm font-medium text-gray-700">
                  Certidões Anexadas <span className="text-red-500">*</span>
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Confirmo que todas as certidões negativas obrigatórias foram verificadas e
                  estão anexadas ao processo (matrícula, IPTU, condomínio, tributos federais).
                </span>
              </div>
            </label>
            {!certidoesAnexadas && (
              <p className="mt-2 ml-7 text-xs text-amber-600">
                Obrigatório confirmar certidões antes de autorizar o lance (Spec §4.4).
              </p>
            )}
          </div>

          {/* Documento de autorização (opcional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID do Documento de Autorização{' '}
              <span className="text-xs text-gray-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={documentoId}
              onChange={(e) => setDocumentoId(e.target.value)}
              placeholder="UUID do documento anexado"
              className="w-full rounded border border-gray-300 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Justificativa */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Justificativa <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs font-mono ${justificativaOk ? 'text-green-600' : 'text-gray-400'}`}>
                {justificativa.length}/200 mínimo
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Descreva o fundamento da autorização: análise de risco, estratégia de lance,
              condições do imóvel e motivação para o teto definido. Mínimo 200 caracteres.
            </p>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={6}
              required
              placeholder="Descreva a justificativa para autorização deste lance, incluindo análise de risco, condições do imóvel, estratégia de aquisição e teto definido..."
              className={`w-full rounded border px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                justificativa.length > 0 && !justificativaOk
                  ? 'border-amber-400 bg-amber-50'
                  : justificativaOk
                  ? 'border-green-400'
                  : 'border-gray-300'
              }`}
            />
            {justificativa.length > 0 && !justificativaOk && (
              <p className="mt-1 text-xs text-amber-600">
                Faltam {200 - justificativa.length} caracteres para o mínimo obrigatório.
              </p>
            )}
          </div>

          {/* Feedback */}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded border border-green-200 bg-green-50 p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">Autorização Registrada</p>
              <p className="text-xs text-green-700">{success}</p>
              <Link
                href={`/auctions/${id}`}
                className="inline-block mt-1 rounded bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700"
              >
                Voltar ao Ativo
              </Link>
            </div>
          )}

          {/* Submit */}
          {!success && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-400">
                A autorização é registrada em <strong>override_events</strong> com trilha de auditoria completa.
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {loading ? 'Registrando...' : 'Autorizar Lance F3'}
              </button>
            </div>
          )}
        </form>

        {/* Spec reference */}
        <p className="text-xs text-gray-400">
          Spec §4.4 — Autorização de Lance. Registros persistidos em{' '}
          <code className="bg-gray-100 px-1 rounded">override_events</code> com{' '}
          <code className="bg-gray-100 px-1 rounded">override_type = bid_authorization_f3</code>.
        </p>
      </div>
    </DashboardLayout>
  );
}
