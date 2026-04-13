-- ============================================
-- Migration 027: Database Health Fixes
-- Addresses all issues from audit report
-- ============================================

-- 1. Fix asset_code UNIQUE to be per-tenant (cross-tenant collision)
ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_asset_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_real_estate_assets_tenant_code
  ON real_estate_assets(tenant_id, asset_code);

-- 2. Fix transaction_number UNIQUE to be per-tenant
ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_transaction_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_tx_tenant_number
  ON financial_transactions(tenant_id, transaction_number);

-- 3. Fix SHA-256 race condition — add advisory lock to hash function
CREATE OR REPLACE FUNCTION set_audit_log_hash() RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
BEGIN
  -- Advisory lock per tenant to prevent race conditions on concurrent writes
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));

  SELECT current_hash INTO prev_hash
  FROM audit_logs
  WHERE tenant_id = NEW.tenant_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF prev_hash IS NULL THEN
    prev_hash := encode(sha256('GENESIS'::bytea), 'hex');
  END IF;

  NEW.previous_hash := prev_hash;
  NEW.current_hash := encode(
    sha256((prev_hash || NEW.payload_evento::text || NEW.created_at::text)::bytea),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Fix SOLD trigger to check checklist completion (not just state visit)
CREATE OR REPLACE FUNCTION check_real_estate_transition() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.current_state = 'READY' AND NEW.current_state IN ('SOLD', 'RENTED') THEN
    -- Check asset went through required states
    IF NOT EXISTS (
      SELECT 1 FROM asset_state_transitions
      WHERE real_estate_asset_id = NEW.id AND to_state = 'REGULARIZATION'
    ) THEN
      RAISE EXCEPTION 'Cannot transition to SOLD/RENTED without completing REGULARIZATION';
    END IF;
    -- Check regularization checklist is 100% complete
    IF EXISTS (
      SELECT 1 FROM regularization_checklists
      WHERE real_estate_asset_id = NEW.id AND tenant_id = NEW.tenant_id AND is_completed = false
    ) THEN
      RAISE EXCEPTION 'Cannot transition to SOLD/RENTED: regularization checklist not 100%% complete';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_real_estate_transition ON real_estate_assets;
CREATE TRIGGER enforce_real_estate_transition
  BEFORE UPDATE OF current_state ON real_estate_assets
  FOR EACH ROW EXECUTE FUNCTION check_real_estate_transition();

-- 5. Add ITBI workflow trigger with update_state action
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ITBI Payment → Asset Em Registro',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'update_state',
  '{"new_state": "REGULARIZATION", "reason": "ITBI paid — automatic transition to regularization"}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- 6. Add RLS to remaining tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'workflow_tasks', 'workflow_notifications',
      'asset_state_transitions', 'asset_costs',
      'auction_bids', 'roi_calculation_versions',
      'accounts_payable', 'accounts_receivable',
      'expense_capture', 'vacancy_monitoring',
      'semantic_search_cache', 'dashboard_configs',
      'dashboard_kpi_cache', 'dashboard_user_preferences',
      'refresh_tokens', 'user_permissions', 'user_roles'
    )
    AND NOT rowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_select ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_select ON %I FOR SELECT USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      tbl, tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_insert ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_insert ON %I FOR INSERT WITH CHECK (true)',
      tbl, tbl
    );
    RAISE NOTICE 'RLS enabled on %', tbl;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RLS loop error: %', SQLERRM;
END $$;

-- 7. Add missing FK indexes
CREATE INDEX IF NOT EXISTS idx_fin_tx_created_by ON financial_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_fin_tx_approved_by ON financial_transactions(approved_by);
CREATE INDEX IF NOT EXISTS idx_fin_tx_proof_doc ON financial_transactions(proof_document_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_process ON financial_transactions(process_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_asset ON financial_transactions(real_estate_asset_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_client ON financial_transactions(client_id);

-- 8. Add composite index for financial queries
CREATE INDEX IF NOT EXISTS idx_fin_tx_tenant_status_date ON financial_transactions(tenant_id, payment_status, created_at DESC);

-- 9. Add TEXT length constraints where needed
-- (Can't change column type easily, but add CHECK constraints)
ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS chk_description_length;
ALTER TABLE financial_transactions ADD CONSTRAINT chk_description_length CHECK (length(description) <= 10000);

-- 10. Fix task_type constraint on workflow_tasks
ALTER TABLE workflow_tasks DROP CONSTRAINT IF EXISTS chk_task_type;
DO $$
BEGIN
  ALTER TABLE workflow_tasks ADD CONSTRAINT chk_task_type
    CHECK (task_type IN ('review', 'approval', 'action', 'notification', 'document', 'inspection', 'registration'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add task_type constraint: %', SQLERRM;
END $$;
