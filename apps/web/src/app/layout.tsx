import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GEMS — Portal do Investidor',
  description: 'Acesso seguro ao seu portfólio de ativos leiloeiros e imobiliários.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc' }}>
        {children}
      </body>
    </html>
  );
}
