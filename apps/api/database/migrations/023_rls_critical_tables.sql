-- ============================================
-- Row Level Security (RLS) for critical tables
-- Defense-in-depth: ensures DB-level tenant isolation as safety net
-- ============================================
-- The API enforces tenant_id in application code (middleware). This migration
-- enables RLS so that when app.current_tenant_id is SET per request/connection,
-- queries are restricted to that tenant's rows. If the session variable is NOT
-- set (empty or NULL), the policy evaluates to FALSE and no rows are returned,
-- preventing accidental cross-tenant leakage when middleware is bypassed.
--
-- Pattern matches 017_rls_audit_logs.sql: SELECT restricted by session var,
-- INSERT allowed (application supplies tenant_id from validated context).
-- ============================================

-- ============================================
-- DOCUMENTS
-- ============================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_tenant_select ON documents;
CREATE POLICY documents_tenant_select
  ON documents
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS documents_tenant_insert ON documents;
CREATE POLICY documents_tenant_insert
  ON documents
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS documents_tenant_update ON documents;
CREATE POLICY documents_tenant_update
  ON documents
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS documents_tenant_delete ON documents;
CREATE POLICY documents_tenant_delete
  ON documents
  FOR DELETE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- FINANCIAL TRANSACTIONS
-- ============================================
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_transactions_tenant_select ON financial_transactions;
CREATE POLICY financial_transactions_tenant_select
  ON financial_transactions
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS financial_transactions_tenant_insert ON financial_transactions;
CREATE POLICY financial_transactions_tenant_insert
  ON financial_transactions
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS financial_transactions_tenant_update ON financial_transactions;
CREATE POLICY financial_transactions_tenant_update
  ON financial_transactions
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- DOCUMENT EXTRACTIONS
-- ============================================
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_extractions_tenant_select ON document_extractions;
CREATE POLICY document_extractions_tenant_select
  ON document_extractions
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS document_extractions_tenant_insert ON document_extractions;
CREATE POLICY document_extractions_tenant_insert
  ON document_extractions
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS document_extractions_tenant_update ON document_extractions;
CREATE POLICY document_extractions_tenant_update
  ON document_extractions
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- DOCUMENT FACTS
-- ============================================
ALTER TABLE document_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_facts_tenant_select ON document_facts;
CREATE POLICY document_facts_tenant_select
  ON document_facts
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS document_facts_tenant_insert ON document_facts;
CREATE POLICY document_facts_tenant_insert
  ON document_facts
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS document_facts_tenant_update ON document_facts;
CREATE POLICY document_facts_tenant_update
  ON document_facts
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- DOCUMENT QUALITY FLAGS
-- ============================================
ALTER TABLE document_quality_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_quality_flags_tenant_select ON document_quality_flags;
CREATE POLICY document_quality_flags_tenant_select
  ON document_quality_flags
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS document_quality_flags_tenant_insert ON document_quality_flags;
CREATE POLICY document_quality_flags_tenant_insert
  ON document_quality_flags
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS document_quality_flags_tenant_update ON document_quality_flags;
CREATE POLICY document_quality_flags_tenant_update
  ON document_quality_flags
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- AUCTION ASSETS
-- ============================================
ALTER TABLE auction_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auction_assets_tenant_select ON auction_assets;
CREATE POLICY auction_assets_tenant_select
  ON auction_assets
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS auction_assets_tenant_insert ON auction_assets;
CREATE POLICY auction_assets_tenant_insert
  ON auction_assets
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS auction_assets_tenant_update ON auction_assets;
CREATE POLICY auction_assets_tenant_update
  ON auction_assets
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- REAL ESTATE ASSETS
-- ============================================
ALTER TABLE real_estate_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS real_estate_assets_tenant_select ON real_estate_assets;
CREATE POLICY real_estate_assets_tenant_select
  ON real_estate_assets
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS real_estate_assets_tenant_insert ON real_estate_assets;
CREATE POLICY real_estate_assets_tenant_insert
  ON real_estate_assets
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS real_estate_assets_tenant_update ON real_estate_assets;
CREATE POLICY real_estate_assets_tenant_update
  ON real_estate_assets
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- INVESTOR USERS
-- ============================================
ALTER TABLE investor_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS investor_users_tenant_select ON investor_users;
CREATE POLICY investor_users_tenant_select
  ON investor_users
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS investor_users_tenant_insert ON investor_users;
CREATE POLICY investor_users_tenant_insert
  ON investor_users
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS investor_users_tenant_update ON investor_users;
CREATE POLICY investor_users_tenant_update
  ON investor_users
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- GENERATED DOCUMENTS
-- ============================================
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generated_documents_tenant_select ON generated_documents;
CREATE POLICY generated_documents_tenant_select
  ON generated_documents
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS generated_documents_tenant_insert ON generated_documents;
CREATE POLICY generated_documents_tenant_insert
  ON generated_documents
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS generated_documents_tenant_update ON generated_documents;
CREATE POLICY generated_documents_tenant_update
  ON generated_documents
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- WORKFLOW TRIGGERS
-- ============================================
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_triggers_tenant_select ON workflow_triggers;
CREATE POLICY workflow_triggers_tenant_select
  ON workflow_triggers
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS workflow_triggers_tenant_insert ON workflow_triggers;
CREATE POLICY workflow_triggers_tenant_insert
  ON workflow_triggers
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS workflow_triggers_tenant_update ON workflow_triggers;
CREATE POLICY workflow_triggers_tenant_update
  ON workflow_triggers
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- KNOWLEDGE ENTRIES
-- ============================================
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_entries_tenant_select ON knowledge_entries;
CREATE POLICY knowledge_entries_tenant_select
  ON knowledge_entries
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS knowledge_entries_tenant_insert ON knowledge_entries;
CREATE POLICY knowledge_entries_tenant_insert
  ON knowledge_entries
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS knowledge_entries_tenant_update ON knowledge_entries;
CREATE POLICY knowledge_entries_tenant_update
  ON knowledge_entries
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- QUALITY GATES
-- ============================================
ALTER TABLE quality_gates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_gates_tenant_select ON quality_gates;
CREATE POLICY quality_gates_tenant_select
  ON quality_gates
  FOR SELECT
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS quality_gates_tenant_insert ON quality_gates;
CREATE POLICY quality_gates_tenant_insert
  ON quality_gates
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS quality_gates_tenant_update ON quality_gates;
CREATE POLICY quality_gates_tenant_update
  ON quality_gates
  FOR UPDATE
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON POLICY documents_tenant_select ON documents IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY financial_transactions_tenant_select ON financial_transactions IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY document_extractions_tenant_select ON document_extractions IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY document_facts_tenant_select ON document_facts IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY document_quality_flags_tenant_select ON document_quality_flags IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY auction_assets_tenant_select ON auction_assets IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY real_estate_assets_tenant_select ON real_estate_assets IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY investor_users_tenant_select ON investor_users IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY generated_documents_tenant_select ON generated_documents IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY workflow_triggers_tenant_select ON workflow_triggers IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY knowledge_entries_tenant_select ON knowledge_entries IS 'RLS: restrict SELECT to current tenant session';
COMMENT ON POLICY quality_gates_tenant_select ON quality_gates IS 'RLS: restrict SELECT to current tenant session';
