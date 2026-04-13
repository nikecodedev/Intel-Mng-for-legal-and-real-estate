-- Migration 040: Add AUDITOR role (Omission #3)
-- Read-only access for audit/compliance personnel
-- Note: permissions stored in role_permissions table, not in roles directly

INSERT INTO roles (name, description, is_system_role, tenant_id)
VALUES (
  'AUDITOR',
  'Somente leitura para logs e auditoria — compliance e governança',
  TRUE,
  NULL
) ON CONFLICT DO NOTHING;
