-- Migration 045: Grant AUDITOR role permissions (Spec Parcial #2)
-- Permissions: audit:read, audit:list, reports:read

INSERT INTO role_permissions (role_id, permission, tenant_id)
SELECT r.id, p.permission, NULL
FROM roles r
CROSS JOIN (VALUES
  ('audit:read'),
  ('audit:list'),
  ('reports:read')
) AS p(permission)
WHERE r.name = 'AUDITOR'
ON CONFLICT DO NOTHING;
