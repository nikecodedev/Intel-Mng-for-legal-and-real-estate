-- Migration 034: Asset Works and Liabilities
-- Track renovation/maintenance works and liabilities per real estate asset

CREATE TABLE IF NOT EXISTS asset_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  real_estate_asset_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  work_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'PLANNED',
  estimated_cost_cents BIGINT,
  actual_cost_cents BIGINT,
  start_date DATE,
  end_date DATE,
  contractor_name TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_works_tenant ON asset_works(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_works_asset ON asset_works(tenant_id, real_estate_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_works_status ON asset_works(tenant_id, status);

CREATE TABLE IF NOT EXISTS asset_liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  real_estate_asset_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  liability_type VARCHAR(100),
  amount_cents BIGINT,
  currency VARCHAR(3) DEFAULT 'BRL',
  due_date DATE,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  creditor_name TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_liabilities_tenant ON asset_liabilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_liabilities_asset ON asset_liabilities(tenant_id, real_estate_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_liabilities_status ON asset_liabilities(tenant_id, status);
