-- Insert system tenant if missing (required for sign-up / register).
-- Run once: see scripts/ensure-system-tenant.sh or use psql/docker exec.
-- Supports tenants.id (002 schema).
INSERT INTO tenants (id, name, status, config_hard_gates)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'System Tenant',
    'ACTIVE',
    '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
