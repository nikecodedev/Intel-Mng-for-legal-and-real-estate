'use client';

import { useEffect, useState } from 'react';

interface MatchRecord {
  id: string;
  auction_asset_id: string;
  match_score: number;
  match_status: string;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export default function InvestorDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem('investor_token');
    setToken(t);
    if (!t) { setLoading(false); return; }

    apiFetch<{ data: { matches: MatchRecord[] } }>('/investor/matches', t)
      .then((d) => setMatches(d.data?.matches ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (!token) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#64748b' }}>Sessão expirada. <a href="/" style={{ color: '#3b82f6' }}>Voltar ao início</a></p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.logo}>G</span>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>GEMS</span>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          <a href="/dashboard" style={styles.navLink}>Painel</a>
          <a href="/documents" style={styles.navLink}>Documentos</a>
        </nav>
      </header>

      {/* Content */}
      <main style={styles.main}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Seu Portfólio</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Oportunidades identificadas pelo motor de correspondência de investidores.
        </p>

        {loading && <p style={{ color: '#94a3b8' }}>Carregando oportunidades…</p>}
        {error  && <div style={styles.errorBox}>{error}</div>}

        {!loading && !error && matches.length === 0 && (
          <div style={styles.emptyBox}>
            <p style={{ color: '#64748b', margin: 0 }}>Nenhuma correspondência encontrada ainda.</p>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>
              Atualize seu perfil de preferências para receber sugestões personalizadas.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {matches.map((m) => (
            <div key={m.id} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>
                  Ativo #{m.auction_asset_id.slice(0, 8).toUpperCase()}
                </span>
                <span style={{ ...styles.badge, background: m.match_score >= 80 ? '#dcfce7' : '#fef9c3', color: m.match_score >= 80 ? '#166534' : '#854d0e' }}>
                  Score {m.match_score}%
                </span>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '6px 0 0' }}>
                Status: {m.match_status} · {new Date(m.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
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
