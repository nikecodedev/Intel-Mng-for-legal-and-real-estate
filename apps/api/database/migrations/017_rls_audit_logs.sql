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

-- ============================================
-- RLS for all critical tenant-scoped tables
-- Same pattern: SELECT filtered by app.current_tenant_id, INSERT allowed
-- ============================================

-- Helper: create RLS policies for a tenant-scoped table
-- We repeat the pattern for each table to keep the migration explicit and auditable.

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant_select ON documents;
CREATE POLICY documents_tenant_select ON documents FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS documents_tenant_insert ON documents;
CREATE POLICY documents_tenant_insert ON documents FOR INSERT WITH CHECK (true);

-- financial_transactions
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_transactions_tenant_select ON financial_transactions;
CREATE POLICY financial_transactions_tenant_select ON financial_transactions FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS financial_transactions_tenant_insert ON financial_transactions;
CREATE POLICY financial_transactions_tenant_insert ON financial_transactions FOR INSERT WITH CHECK (true);

-- document_extractions
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_extractions_tenant_select ON document_extractions;
CREATE POLICY document_extractions_tenant_select ON document_extractions FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS document_extractions_tenant_insert ON document_extractions;
CREATE POLICY document_extractions_tenant_insert ON document_extractions FOR INSERT WITH CHECK (true);

-- document_facts
ALTER TABLE document_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_facts_tenant_select ON document_facts;
CREATE POLICY document_facts_tenant_select ON document_facts FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS document_facts_tenant_insert ON document_facts;
CREATE POLICY document_facts_tenant_insert ON document_facts FOR INSERT WITH CHECK (true);

-- document_quality_flags
ALTER TABLE document_quality_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_quality_flags_tenant_select ON document_quality_flags;
CREATE POLICY document_quality_flags_tenant_select ON document_quality_flags FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS document_quality_flags_tenant_insert ON document_quality_flags;
CREATE POLICY document_quality_flags_tenant_insert ON document_quality_flags FOR INSERT WITH CHECK (true);

-- auction_assets
ALTER TABLE auction_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auction_assets_tenant_select ON auction_assets;
CREATE POLICY auction_assets_tenant_select ON auction_assets FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS auction_assets_tenant_insert ON auction_assets;
CREATE POLICY auction_assets_tenant_insert ON auction_assets FOR INSERT WITH CHECK (true);

-- real_estate_assets
ALTER TABLE real_estate_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS real_estate_assets_tenant_select ON real_estate_assets;
CREATE POLICY real_estate_assets_tenant_select ON real_estate_assets FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS real_estate_assets_tenant_insert ON real_estate_assets;
CREATE POLICY real_estate_assets_tenant_insert ON real_estate_assets FOR INSERT WITH CHECK (true);

-- investor_users
ALTER TABLE investor_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investor_users_tenant_select ON investor_users;
CREATE POLICY investor_users_tenant_select ON investor_users FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS investor_users_tenant_insert ON investor_users;
CREATE POLICY investor_users_tenant_insert ON investor_users FOR INSERT WITH CHECK (true);

-- generated_documents
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS generated_documents_tenant_select ON generated_documents;
CREATE POLICY generated_documents_tenant_select ON generated_documents FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS generated_documents_tenant_insert ON generated_documents;
CREATE POLICY generated_documents_tenant_insert ON generated_documents FOR INSERT WITH CHECK (true);

-- workflow_triggers
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_triggers_tenant_select ON workflow_triggers;
CREATE POLICY workflow_triggers_tenant_select ON workflow_triggers FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS workflow_triggers_tenant_insert ON workflow_triggers;
CREATE POLICY workflow_triggers_tenant_insert ON workflow_triggers FOR INSERT WITH CHECK (true);

-- knowledge_entries
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_entries_tenant_select ON knowledge_entries;
CREATE POLICY knowledge_entries_tenant_select ON knowledge_entries FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS knowledge_entries_tenant_insert ON knowledge_entries;
CREATE POLICY knowledge_entries_tenant_insert ON knowledge_entries FOR INSERT WITH CHECK (true);

-- quality_gates
ALTER TABLE quality_gates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quality_gates_tenant_select ON quality_gates;
CREATE POLICY quality_gates_tenant_select ON quality_gates FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS quality_gates_tenant_insert ON quality_gates;
CREATE POLICY quality_gates_tenant_insert ON quality_gates FOR INSERT WITH CHECK (true);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant_select ON users;
CREATE POLICY users_tenant_select ON users FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS users_tenant_insert ON users;
CREATE POLICY users_tenant_insert ON users FOR INSERT WITH CHECK (true);

-- workflow_tasks
ALTER TABLE workflow_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_tasks_tenant_select ON workflow_tasks;
CREATE POLICY workflow_tasks_tenant_select ON workflow_tasks FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS workflow_tasks_tenant_insert ON workflow_tasks;
CREATE POLICY workflow_tasks_tenant_insert ON workflow_tasks FOR INSERT WITH CHECK (true);

-- accounts_payable
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_payable_tenant_select ON accounts_payable;
CREATE POLICY accounts_payable_tenant_select ON accounts_payable FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS accounts_payable_tenant_insert ON accounts_payable;
CREATE POLICY accounts_payable_tenant_insert ON accounts_payable FOR INSERT WITH CHECK (true);

-- accounts_receivable
ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_receivable_tenant_select ON accounts_receivable;
CREATE POLICY accounts_receivable_tenant_select ON accounts_receivable FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
DROP POLICY IF EXISTS accounts_receivable_tenant_insert ON accounts_receivable;
CREATE POLICY accounts_receivable_tenant_insert ON accounts_receivable FOR INSERT WITH CHECK (true);
