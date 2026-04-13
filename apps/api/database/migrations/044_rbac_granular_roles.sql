-- Migration 044: Add granular RBAC roles (Spec Ausente #1)
-- Roles: ADVOGADO, ANALISTA_LEILOES, GESTOR_IMOBILIARIO, FINANCEIRO

INSERT INTO roles (name, description, is_system_role, tenant_id)
VALUES
  ('ADVOGADO',           'Acesso ao módulo jurídico — casos legais, FPDN, QG4', TRUE, NULL),
  ('ANALISTA_LEILOES',   'Acesso ao módulo de leilões — análise de ativos e lances',  TRUE, NULL),
  ('GESTOR_IMOBILIARIO', 'Acesso ao módulo imobiliário — ativos, regularização, CAPEX', TRUE, NULL),
  ('FINANCEIRO',         'Acesso ao módulo financeiro — transações, contas, relatórios', TRUE, NULL)
ON CONFLICT DO NOTHING;

-- Seed permissions for ADVOGADO (uses documents:* as legal_cases permissions)
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADVOGADO'
  AND p.name IN ('documents:read','documents:create','documents:update',
                 'quality_gates:read','quality_gates:create','quality_gates:update')
ON CONFLICT DO NOTHING;

-- Seed permissions for ANALISTA_LEILOES
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ANALISTA_LEILOES'
  AND p.name IN ('auctions:read','auctions:create','auctions:update','auctions:bid','auctions:list')
ON CONFLICT DO NOTHING;

-- Seed permissions for GESTOR_IMOBILIARIO
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'GESTOR_IMOBILIARIO'
  AND p.name IN ('assets:read','assets:create','assets:update','assets:list',
                 'documents:read','finance:read')
ON CONFLICT DO NOTHING;

-- Seed permissions for FINANCEIRO
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'FINANCEIRO'
  AND p.name IN ('finance:read','finance:create','finance:update','finance:list',
                 'reports:read','reports:generate','reports:export')
ON CONFLICT DO NOTHING;
