-- Migration 045: Grant AUDITOR role permissions (Spec Parcial #2)
-- Permissions: audit:read, audit:list, reports:read

INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'AUDITOR'
  AND p.name IN ('audit:read', 'audit:list', 'reports:read')
ON CONFLICT DO NOTHING;
