-- Migration 060: Partner Offices (Escritórios Parceiros)
-- Manages law firms and partner offices that use or collaborate with the platform

CREATE TABLE IF NOT EXISTS partner_offices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  cnpj          VARCHAR(18),
  email         TEXT,
  phone         VARCHAR(30),
  address       TEXT,
  city          TEXT,
  state         CHAR(2),
  responsible_name  TEXT,
  responsible_email TEXT,
  specialty     TEXT,                        -- e.g. Imobiliário, Trabalhista, Tributário
  status        TEXT NOT NULL DEFAULT 'ATIVO'
                  CHECK (status IN ('ATIVO', 'INATIVO', 'SUSPENSO')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_partner_offices_tenant ON partner_offices(tenant_id) WHERE deleted_at IS NULL;

-- Demo seed data for system tenant
INSERT INTO partner_offices (tenant_id, name, cnpj, email, phone, address, city, state, responsible_name, responsible_email, specialty, status)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Ferreira & Associados Advocacia',
   '12.345.678/0001-90',
   'contato@ferreiraadvocacia.com.br',
   '(11) 3456-7890',
   'Av. Paulista, 1000, 5º andar',
   'São Paulo', 'SP',
   'Dr. Carlos Ferreira',
   'carlos@ferreiraadvocacia.com.br',
   'Imobiliário', 'ATIVO'),

  ('00000000-0000-0000-0000-000000000001',
   'Silva Lima Advogados',
   '98.765.432/0001-10',
   'juridico@silvalima.adv.br',
   '(11) 2345-6789',
   'Rua Consolação, 300, sala 42',
   'São Paulo', 'SP',
   'Dra. Ana Lima',
   'ana@silvalima.adv.br',
   'Tributário', 'ATIVO'),

  ('00000000-0000-0000-0000-000000000001',
   'Mendes & Costa Consultoria Jurídica',
   '55.666.777/0001-88',
   'mc@mendescosta.com.br',
   '(21) 9876-5432',
   'Av. Rio Branco, 200, 10º andar',
   'Rio de Janeiro', 'RJ',
   'Dr. Paulo Mendes',
   'paulo@mendescosta.com.br',
   'Leilões e Recuperação de Ativos', 'ATIVO'),

  ('00000000-0000-0000-0000-000000000001',
   'Escritório Ramos & Partners',
   '11.222.333/0001-44',
   'ramos@ramospartners.adv.br',
   '(31) 3333-4444',
   'Rua da Bahia, 500',
   'Belo Horizonte', 'MG',
   'Dr. Roberto Ramos',
   'roberto@ramospartners.adv.br',
   'Direito Imobiliário', 'INATIVO')
ON CONFLICT DO NOTHING;
