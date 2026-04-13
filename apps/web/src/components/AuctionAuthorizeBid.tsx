'use client';

import React, { useState } from 'react';

/**
 * Spec §4.4 — Autorização de Lance F3 (pré-lance)
 * Formulário dedicado para OWNER assinar teto financeiro + confirmar certidões.
 * Chama: POST /api/v1/auctions/assets/:id/authorize-bid
 */

interface AuctionAuthorizeBidProps {
  assetId: string;
  apiBaseUrl?: string;
  authToken?: string;
  onSuccess?: (authId: string) => void;
  onCancel?: () => void;
}

interface AuthorizeResponse {
  auth_id: string;
  message: string;
}

export function AuctionAuthorizeBid({
  assetId,
  apiBaseUrl = '/api/v1',
  authToken,
  onSuccess,
  onCancel,
}: AuctionAuthorizeBidProps) {
  const [tetoAutorizado, setTetoAutorizado] = useState('');
  const [certidoesAnexadas, setCertidoesAnexadas] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [documentoId, setDocumentoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const tetoOk = parseFloat(tetoAutorizado) > 0;
  const justOk = justificativa.length >= 200;
  const canSubmit = tetoOk && certidoesAnexadas && justOk && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload: Record<string, unknown> = {
        teto_autorizado: Math.round(parseFloat(tetoAutorizado) * 100),
        certidoes_anexadas: true,
        justificativa,
      };
      if (documentoId.trim()) {
        payload.documento_autorizacao_id = documentoId.trim();
      }

      const res = await fetch(`${apiBaseUrl}/auctions/assets/${assetId}/authorize-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((errData.error as string) || (errData.message as string) || `HTTP ${res.status}`);
      }

      const data = await res.json() as AuthorizeResponse;
      setSuccessMsg(`Autorização registrada — ID: ${data.auth_id}`);
      onSuccess?.(data.auth_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar autorização.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, fontFamily: 'sans-serif', fontSize: 14, color: '#1a1a1a' }}>
      <h2 style={{ marginBottom: 4 }}>Autorização de Lance — F3</h2>
      <p style={{ color: '#666', marginBottom: 16, fontSize: 12 }}>
        Spec §4.4 — Formulário pré-lance obrigatório para OWNER assinar teto + certidões.
      </p>

      {/* Info */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#1e40af' }}>
        <strong>O que é?</strong> Define o teto financeiro autorizado pelo Owner antes do lance,
        confirma certidões negativas e exige justificativa mínima de 200 caracteres.
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Teto Autorizado */}
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Teto Autorizado pelo Owner <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <p style={{ color: '#666', fontSize: 12, margin: '0 0 6px' }}>
            Valor máximo (R$) autorizado para o lance neste ativo.
          </p>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}>R$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={tetoAutorizado}
              onChange={e => setTetoAutorizado(e.target.value)}
              placeholder="0,00"
              required
              style={{ width: '100%', padding: '8px 10px 8px 36px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
            />
          </div>
          {tetoAutorizado && !tetoOk && (
            <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0' }}>Valor deve ser maior que zero.</p>
          )}
        </div>

        {/* Certidões */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '12px 14px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={certidoesAnexadas}
              onChange={e => setCertidoesAnexadas(e.target.checked)}
              required
              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }}
            />
            <div>
              <span style={{ fontWeight: 600 }}>
                Certidões Negativas Anexadas <span style={{ color: '#dc2626' }}>*</span>
              </span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                Confirmo que matrícula, IPTU, condomínio e tributos federais foram verificados e estão anexados ao processo.
              </p>
            </div>
          </label>
          {!certidoesAnexadas && (
            <p style={{ color: '#d97706', fontSize: 12, margin: '8px 0 0 26px' }}>
              Obrigatório confirmar certidões antes de autorizar o lance (Spec §4.4).
            </p>
          )}
        </div>

        {/* Documento ID (opcional) */}
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            ID do Documento de Autorização <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 12 }}>(opcional)</span>
          </label>
          <input
            type="text"
            value={documentoId}
            onChange={e => setDocumentoId(e.target.value)}
            placeholder="UUID do documento anexado"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
        </div>

        {/* Justificativa */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontWeight: 600 }}>
              Justificativa <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: justOk ? '#16a34a' : '#9ca3af' }}>
              {justificativa.length}/200 mínimo
            </span>
          </div>
          <p style={{ color: '#666', fontSize: 12, margin: '0 0 6px' }}>
            Análise de risco, estratégia de lance, condições do imóvel e motivação para o teto definido.
          </p>
          <textarea
            value={justificativa}
            onChange={e => setJustificativa(e.target.value)}
            rows={5}
            required
            placeholder="Descreva a justificativa para autorização deste lance, incluindo análise de risco, condições do imóvel e estratégia de aquisição..."
            style={{
              width: '100%',
              padding: '8px 10px',
              border: `1px solid ${justificativa.length > 0 && !justOk ? '#f59e0b' : justOk ? '#16a34a' : '#d1d5db'}`,
              borderRadius: 6,
              resize: 'vertical',
              boxSizing: 'border-box',
              background: justificativa.length > 0 && !justOk ? '#fffbeb' : '#fff',
            }}
          />
          {justificativa.length > 0 && !justOk && (
            <p style={{ color: '#d97706', fontSize: 12, margin: '4px 0 0' }}>
              Faltam {200 - justificativa.length} caracteres para o mínimo obrigatório.
            </p>
          )}
        </div>

        {/* Feedback */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 14px', color: '#15803d', fontSize: 13 }}>
            <strong>Autorização Registrada</strong>
            <br />
            {successMsg}
          </div>
        )}

        {/* Actions */}
        {!successMsg && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: '8px 20px',
                background: canSubmit ? '#2563eb' : '#93c5fd',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Registrando...' : 'Autorizar Lance F3'}
            </button>
          </div>
        )}
      </form>

      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
        Spec §4.4 — Registrado em <code>override_events</code> com{' '}
        <code>override_type = bid_authorization_f3</code>. Trilha de auditoria completa.
      </p>
    </div>
  );
}
