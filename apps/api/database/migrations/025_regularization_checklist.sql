-- ============================================
-- Migration 025: Regularization checklist with completion tracking
-- ============================================

CREATE TABLE IF NOT EXISTS regularization_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  real_estate_asset_id UUID NOT NULL REFERENCES real_estate_assets(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  item_category VARCHAR(100) NOT NULL DEFAULT 'GENERAL',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, real_estate_asset_id, item_name)
);

CREATE INDEX IF NOT EXISTS idx_reg_checklist_asset ON regularization_checklists(tenant_id, real_estate_asset_id);

-- Enable RLS
ALTER TABLE regularization_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regularization_checklists_tenant_select ON regularization_checklists;
CREATE POLICY regularization_checklists_tenant_select ON regularization_checklists FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS regularization_checklists_tenant_insert ON regularization_checklists;
CREATE POLICY regularization_checklists_tenant_insert ON regularization_checklists FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS regularization_checklists_tenant_update ON regularization_checklists;
CREATE POLICY regularization_checklists_tenant_update ON regularization_checklists FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
