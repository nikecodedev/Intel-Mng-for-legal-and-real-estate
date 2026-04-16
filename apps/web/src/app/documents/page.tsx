'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/auth';

interface Document {
  id: string;
  title: string;
  document_type: string;
  status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO' | null;
  created_at: string;
}

const CPO_COLORS: Record<string, { bg: string; text: string }> = {
  VERDE:    { bg: '#dcfce7', text: '#166534' },
  AMARELO:  { bg: '#fef9c3', text: '#854d0e' },
  VERMELHO: { bg: '#fee2e2', text: '#991b1b' },
};

export default function DocumentsPage() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const token = getToken();
    setHasToken(!!token);
    if (!token) { setLoading(false); return; }

    apiFetch<{ data: { documents: Document[] } }>('/documents?limit=50')
      .then((result) => {
        if (!result.ok) {
          if (result.expired) { setSessionExpired(true); return; }
          setError(`Erro ${result.status}`);
          return;
        }
        setDocs(result.data?.data?.documents ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (hasToken === false || sessionExpired) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#64748b' }}>Sessão expirada. <a href="/" style={{ color: '#3b82f6' }}>Voltar ao início</a></p>
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
          <a href="/documents" style={{ ...styles.navLink, color: '#3b82f6' }}>Documentos</a>
        </nav>
      </header>

      <main style={styles.main}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Documentos</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Documentos vinculados ao seu portfólio.
        </p>

        {loading && <p style={{ color: '#94a3b8' }}>Carregando documentos…</p>}
        {error   && <div style={styles.errorBox}>{error}</div>}

        {!loading && !error && docs.length === 0 && (
          <div style={styles.emptyBox}>
            <p style={{ color: '#64748b', margin: 0 }}>Nenhum documento disponível.</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {docs.map((doc) => {
            const cpo = doc.status_cpo ? CPO_COLORS[doc.status_cpo] : null;
            return (
              <div key={doc.id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <p style={{ fontWeight: 600, color: '#1e293b', fontSize: 14, margin: 0 }}>{doc.title}</p>
                    <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0' }}>
                      {doc.document_type} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {cpo && (
                    <span style={{ ...styles.badge, background: cpo.bg, color: cpo.text, whiteSpace: 'nowrap' }}>
                      CPO {doc.status_cpo}
                    </span>
                  )}
                </div>
                <a
                  href={`/documents/${doc.id}`}
                  style={{ display: 'inline-block', marginTop: 10, fontSize: 13, color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}
                >
                  Ver documento →
                </a>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:     { minHeight: '100vh', background: '#f8fafc' },
  header:   { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 },
  logo:     { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontWeight: 800, fontSize: 14 },
  navLink:  { color: '#64748b', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  main:     { maxWidth: 900, margin: '0 auto', padding: '32px 24px' },
  card:     { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' },
  badge:    { display: 'inline-block', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  emptyBox: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '32px', textAlign: 'center' },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', color: '#b91c1c', fontSize: 14 },
  centered: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
