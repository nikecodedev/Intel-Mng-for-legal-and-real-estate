import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'GEMS — Portal do Investidor',
  description: 'Acesso seguro ao seu portfólio de ativos leiloeiros e imobiliários.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc' }}>
        {children}
      </body>
    </html>
  );
}
