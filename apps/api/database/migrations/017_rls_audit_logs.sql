-- ============================================
-- Row Level Security (RLS) for audit_logs
-- Defense-in-depth: ensures DB-level tenant isolation for audit reads
-- ============================================
-- The API enforces tenant_id in application code. This migration enables RLS
-- so that when the application sets app.current_tenant_id per request/connection,
-- SELECT returns only that tenant's rows. INSERT remains allowed (append-only).
-- UPDATE/DELETE are already blocked by triggers.
--
-- To use RLS for SELECT: set the session variable before querying audit_logs,
-- e.g. SET app.current_tenant_id = 'tenant-uuid'; (see OPERATIONS.md).
-- ============================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: only rows for the current tenant (when app.current_tenant_id is set)
DROP POLICY IF EXISTS audit_logs_tenant_select ON audit_logs;
CREATE POLICY audit_logs_tenant_select
  ON audit_logs
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- INSERT: allow (application supplies tenant_id from validated context)
DROP POLICY IF EXISTS audit_logs_tenant_insert ON audit_logs;
CREATE POLICY audit_logs_tenant_insert
  ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- No UPDATE/DELETE policies: triggers already block modifications

COMMENT ON TABLE audit_logs IS 'Immutable append-only audit log; RLS restricts SELECT by app.current_tenant_id when set';
