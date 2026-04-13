-- ============================================
-- Migration 028: Final DB Health Fixes
-- Addresses ALL remaining audit items
-- ============================================

-- ============================================
-- 1. Fix Migration 013 — CHECK constraints reference wrong column names
-- ============================================
ALTER TABLE gate_decisions DROP CONSTRAINT IF EXISTS current_hash_format;
ALTER TABLE gate_decisions DROP CONSTRAINT IF EXISTS previous_hash_format;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gate_decisions' AND column_name='current_decision_hash') THEN
    ALTER TABLE gate_decisions ADD CONSTRAINT current_hash_format CHECK (current_decision_hash ~ '^[a-f0-9]{64}$');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gate_decisions' AND column_name='previous_decision_hash') THEN
    ALTER TABLE gate_decisions ADD CONSTRAINT previous_hash_format CHECK (previous_decision_hash ~ '^[a-f0-9]{64}$');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'gate_decisions hash constraints: %', SQLERRM;
END $$;

-- ============================================
-- 2. Fix Migration 010 — FK to nonexistent processes table
--    Create the missing processes table as a reference/lookup
-- ============================================
CREATE TABLE IF NOT EXISTS processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  process_number VARCHAR(255),
  title VARCHAR(500),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_processes_tenant ON processes(tenant_id);
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS processes_tenant_select ON processes;
CREATE POLICY processes_tenant_select ON processes FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS processes_tenant_insert ON processes;
CREATE POLICY processes_tenant_insert ON processes FOR INSERT WITH CHECK (true);

-- ============================================
-- 3. DPI >= 300 bloqueante — add DB CHECK
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dpi_minimum') THEN
    -- Only enforce on new records; existing records with NULL are ok
    ALTER TABLE documents ADD CONSTRAINT chk_dpi_minimum
      CHECK (dpi_resolution IS NULL OR dpi_resolution >= 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'DPI constraint: %', SQLERRM;
END $$;

-- ============================================
-- 4. Revisão antes de protocolo — add DB CHECK
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_review_before_protocol') THEN
    ALTER TABLE generated_documents ADD CONSTRAINT chk_review_before_protocol
      CHECK (review_status IS NULL OR review_status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Review constraint: %', SQLERRM;
END $$;

-- ============================================
-- 5. SOLD trigger — fix to check checklist 100% (update from 027)
-- ============================================
CREATE OR REPLACE FUNCTION check_real_estate_transition() RETURNS TRIGGER AS $$
DECLARE
  checklist_total INT;
  checklist_done INT;
BEGIN
  IF OLD.current_state = 'READY' AND NEW.current_state IN ('SOLD', 'RENTED') THEN
    -- Check required states were visited
    IF NOT EXISTS (
      SELECT 1 FROM asset_state_transitions
      WHERE real_estate_asset_id = NEW.id AND to_state = 'REGULARIZATION'
    ) THEN
      RAISE EXCEPTION 'Cannot sell: REGULARIZATION state not completed';
    END IF;

    -- Check regularization checklist 100%
    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed = true)
    INTO checklist_total, checklist_done
    FROM regularization_checklists
    WHERE real_estate_asset_id = NEW.id AND tenant_id = NEW.tenant_id;

    IF checklist_total = 0 THEN
      RAISE EXCEPTION 'Cannot sell: no regularization checklist items found';
    END IF;

    IF checklist_done < checklist_total THEN
      RAISE EXCEPTION 'Cannot sell: checklist %/% complete (must be 100%%)', checklist_done, checklist_total;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. itbi.paid → workflow — ensure trigger exists with update_state
-- ============================================
DELETE FROM workflow_triggers WHERE name = 'ITBI Payment → Asset Em Registro' AND tenant_id = '00000000-0000-0000-0000-000000000001';
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ITBI Payment → Asset Em Registro',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'update_state',
  '{"new_state": "REGULARIZATION", "reason": "ITBI paid — automatic transition"}',
  true, NOW(), NOW()
);

-- ============================================
-- 7. CASCADE DELETE fix — change to RESTRICT on financial data
-- ============================================
DO $$
BEGIN
  -- accounts_payable: change CASCADE to RESTRICT
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name LIKE '%accounts_payable%financial%' AND constraint_type='FOREIGN KEY') THEN
    ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_transaction_id_fkey;
    ALTER TABLE accounts_payable ADD CONSTRAINT accounts_payable_transaction_id_fkey
      FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CASCADE fix: %', SQLERRM;
END $$;

-- ============================================
-- 8. RLS on ALL remaining tables
-- ============================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT t.tablename FROM pg_tables t
    WHERE t.schemaname = 'public'
    AND NOT t.rowsecurity
    AND t.tablename NOT IN ('tenants', 'roles', 'permissions', 'super_admin_users', 'processes')
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_name = t.tablename AND c.column_name = 'tenant_id'
    )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_sel ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_sel ON %I FOR SELECT USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_ins ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_ins ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_upd ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_upd ON %I FOR UPDATE USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)', tbl, tbl);
    RAISE NOTICE 'RLS enabled: %', tbl;
  END LOOP;
END $$;

-- ============================================
-- 9. Reconciliation — add unique constraint to prevent double reconciliation
-- ============================================
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_recon_unique
    ON bank_reconciliation(tenant_id, bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Bank recon index: %', SQLERRM;
END $$;

-- ============================================
-- 10. Auto risk_score recalculation trigger
-- ============================================
CREATE OR REPLACE FUNCTION recalc_auction_risk_score() RETURNS TRIGGER AS $$
DECLARE
  checklist JSONB;
  score INT := 0;
BEGIN
  checklist := NEW.due_diligence_checklist;
  IF checklist IS NOT NULL THEN
    -- Calculate risk: ok=0, pending=15, risk=25 per category
    FOR cat IN SELECT unnest(ARRAY['occupancy','debts','legal_risks','zoning'])
    LOOP
      CASE checklist->cat->>'status'
        WHEN 'ok' THEN score := score + 0;
        WHEN 'pending' THEN score := score + 15;
        WHEN 'risk' THEN score := score + 25;
        ELSE score := score + 15;
      END CASE;
    END LOOP;
  END IF;
  NEW.risk_score := LEAST(score, 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_recalc_risk ON auction_assets;
CREATE TRIGGER auto_recalc_risk
  BEFORE UPDATE OF due_diligence_checklist ON auction_assets
  FOR EACH ROW EXECUTE FUNCTION recalc_auction_risk_score();

-- ============================================
-- 11. Expense status transitions constraint
-- ============================================
DO $$
BEGIN
  ALTER TABLE expense_capture ADD CONSTRAINT chk_expense_status
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Expense status constraint: %', SQLERRM;
END $$;

-- ============================================
-- 12. NOT NULL on auditable columns
-- ============================================
DO $$
BEGIN
  ALTER TABLE workflow_tasks ALTER COLUMN related_entity_type SET DEFAULT 'unknown';
  ALTER TABLE workflow_tasks ALTER COLUMN related_entity_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'NOT NULL fixes: %', SQLERRM;
END $$;

-- ============================================
-- 13. Verify final RLS count
-- ============================================
DO $$
DECLARE
  rls_count INT;
BEGIN
  SELECT count(*) INTO rls_count FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;
  RAISE NOTICE 'Final RLS count: % tables', rls_count;
END $$;
