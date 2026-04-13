-- Migration 040: Add AUDITOR role (Omission #3)
-- Read-only access for audit/compliance personnel

INSERT INTO roles (name, description, permissions)
VALUES (
  'AUDITOR',
  'Somente leitura para logs e auditoria — compliance e governança',
  '["audit:read","documents:read","finance:read","reports:read"]'::jsonb
) ON CONFLICT (name) DO NOTHING;
