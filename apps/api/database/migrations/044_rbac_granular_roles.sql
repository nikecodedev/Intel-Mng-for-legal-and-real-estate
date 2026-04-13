-- Migration 044: Add granular RBAC roles (Spec Ausente #1)
-- Roles: ADVOGADO, ANALISTA_LEILOES, GESTOR_IMOBILIARIO, FINANCEIRO

INSERT INTO roles (name, description, is_system_role, tenant_id)
VALUES
  ('ADVOGADO',           'Acesso ao módulo jurídico — casos legais, FPDN, QG4', TRUE, NULL),
  ('ANALISTA_LEILOES',   'Acesso ao módulo de leilões — análise de ativos e lances',  TRUE, NULL),
  ('GESTOR_IMOBILIARIO', 'Acesso ao módulo imobiliário — ativos, regularização, CAPEX', TRUE, NULL),
  ('FINANCEIRO',         'Acesso ao módulo financeiro — transações, contas, relatórios', TRUE, NULL)
ON CONFLICT DO NOTHING;

-- Seed permissions for ADVOGADO
INSERT INTO role_permissions (role_id, permission, tenant_id)
SELECT r.id, p.permission, NULL
FROM roles r
CROSS JOIN (VALUES
  ('documents:read'),('documents:create'),('documents:update'),
  ('legal_cases:read'),('legal_cases:create'),('legal_cases:update'),('legal_cases:override')
) AS p(permission)
WHERE r.name = 'ADVOGADO'
ON CONFLICT DO NOTHING;

-- Seed permissions for ANALISTA_LEILOES
INSERT INTO role_permissions (role_id, permission, tenant_id)
SELECT r.id, p.permission, NULL
FROM roles r
CROSS JOIN (VALUES
  ('auctions:read'),('auctions:create'),('auctions:update'),('auctions:bid')
) AS p(permission)
WHERE r.name = 'ANALISTA_LEILOES'
ON CONFLICT DO NOTHING;

-- Seed permissions for GESTOR_IMOBILIARIO
INSERT INTO role_permissions (role_id, permission, tenant_id)
SELECT r.id, p.permission, NULL
FROM roles r
CROSS JOIN (VALUES
  ('assets:read'),('assets:create'),('assets:update'),
  ('documents:read'),('finance:read')
) AS p(permission)
WHERE r.name = 'GESTOR_IMOBILIARIO'
ON CONFLICT DO NOTHING;

-- Seed permissions for FINANCEIRO
INSERT INTO role_permissions (role_id, permission, tenant_id)
SELECT r.id, p.permission, NULL
FROM roles r
CROSS JOIN (VALUES
  ('finance:read'),('finance:create'),('finance:update'),
  ('reports:read'),('reports:create')
) AS p(permission)
WHERE r.name = 'FINANCEIRO'
ON CONFLICT DO NOTHING;
