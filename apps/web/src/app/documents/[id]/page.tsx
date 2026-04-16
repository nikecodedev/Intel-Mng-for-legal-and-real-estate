'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/auth';

interface DocumentDetail {
  id: string;
  title: string;
  document_type: string;
  document_number: string | null;
  status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO' | null;
  ocr_processed: boolean;
  created_at: string;
  updated_at: string;
}

const CPO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  VERDE:    { bg: '#dcfce7', text: '#166534', label: 'Aprovado (VERDE)' },
  AMARELO:  { bg: '#fef9c3', text: '#854d0e', label: 'Pendente (AMARELO)' },
  VERMELHO: { bg: '#fee2e2', text: '#991b1b', label: 'Reprovado (VERMELHO)' },
};

export default function DocumentDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const token = getToken();
    setHasToken(!!token);
    if (!token || !id) { setLoading(false); return; }

    apiFetch<{ data: { document: DocumentDetail } }>(`/documents/${id}`)
      .then((result) => {
        if (!result.ok) {
          if (result.expired) { setSessionExpired(true); return; }
          setError(`Erro ${result.status}`);
          return;
        }
        setDoc(result.data?.data?.document ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (hasToken === false || sessionExpired) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#64748b' }}>
          Sessão expirada. <a href="/" style={{ color: '#3b82f6' }}>Voltar ao início</a>
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>G</span>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>GEMS</span>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          <a href="/dashboard" style={styles.navLink}>Painel</a>
          <a href="/documents" style={styles.navLink}>Documentos</a>
        </nav>
      </header>

      <main style={styles.main}>
        <a href="/documents" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>
          ← Voltar à lista
        </a>

        {loading && <p style={{ color: '#94a3b8', marginTop: 24 }}>Carregando documento…</p>}
        {error && <div style={{ ...styles.errorBox, marginTop: 24 }}>{error}</div>}

        {!loading && !error && !doc && (
          <div style={{ ...styles.card, marginTop: 24, textAlign: 'center', color: '#64748b' }}>
            Documento não encontrado.
          </div>
        )}

        {doc && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>{doc.title}</h1>
                {doc.document_number && (
                  <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Nº {doc.document_number}</p>
                )}
              </div>
              {doc.status_cpo && (
                <span style={{ ...styles.badge, background: CPO_COLORS[doc.status_cpo].bg, color: CPO_COLORS[doc.status_cpo].text }}>
                  CPO — {CPO_COLORS[doc.status_cpo].label}
                </span>
              )}
            </div>

            <div style={styles.card}>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                <div>
                  <dt style={styles.dt}>Tipo</dt>
                  <dd style={styles.dd}>{doc.document_type}</dd>
                </div>
                <div>
                  <dt style={styles.dt}>OCR Processado</dt>
                  <dd style={styles.dd}>{doc.ocr_processed ? 'Sim' : 'Não'}</dd>
                </div>
                <div>
                  <dt style={styles.dt}>Criado em</dt>
                  <dd style={styles.dd}>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</dd>
                </div>
                <div>
                  <dt style={styles.dt}>Atualizado em</dt>
                  <dd style={styles.dd}>{new Date(doc.updated_at).toLocaleDateString('pt-BR')}</dd>
                </div>
              </dl>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <a
                href={`/documents/${doc.id}/view`}
                style={styles.btnPrimary}
              >
                Visualizar documento
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:       { minHeight: '100vh', background: '#f8fafc' },
  header:     { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 },
  logo:       { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontWeight: 800, fontSize: 14 },
  navLink:    { color: '#64748b', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  main:       { maxWidth: 860, margin: '0 auto', padding: '32px 24px' },
  card:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px' },
  badge:      { display: 'inline-block', borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  errorBox:   { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', color: '#b91c1c', fontSize: 14 },
  centered:   { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dt:         { fontSize: 12, color: '#94a3b8', fontWeight: 500, marginBottom: 2 },
  dd:         { fontSize: 14, color: '#1e293b', fontWeight: 500, margin: 0 },
  btnPrimary: { display: 'inline-block', padding: '10px 20px', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' },
};
