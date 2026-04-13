-- Migration 033: CRM Proposals
-- Proposals for investor/asset deals

CREATE TABLE IF NOT EXISTS crm_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  investor_user_id UUID,
  auction_asset_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  proposed_amount_cents BIGINT,
  status VARCHAR(50) DEFAULT 'DRAFT',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_tenant ON crm_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_status ON crm_proposals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_investor ON crm_proposals(tenant_id, investor_user_id);
