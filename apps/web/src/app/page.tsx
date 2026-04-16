import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(135deg, #0f1629 0%, #0c1220 100%)' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', marginBottom: 24, boxShadow: '0 8px 24px rgba(59,130,246,0.3)' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>G</span>
        </div>

        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px' }}>
          GEMS — Portal do Investidor
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, marginBottom: 40 }}>
          Acesso seguro ao seu portfólio de ativos leiloeiros e oportunidades imobiliárias.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link
            href="/dashboard"
            style={{ display: 'block', padding: '14px 0', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none', textAlign: 'center' }}
          >
            Acessar Portal
          </Link>
          <Link
            href="/documents"
            style={{ display: 'block', padding: '14px 0', borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: 15, textDecoration: 'none', textAlign: 'center' }}
          >
            Documentos
          </Link>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 40 }}>
          Acesso restrito a investidores cadastrados. Suporte: suporte@gems.com.br
        </p>
      </div>
    </main>
  );
}
