-- Migration 049: Add projeto_id to financial_transactions and real_estate_assets
-- Spec §9: CAPEX auto-link must use explicit projeto_id field, not process_id alias.

-- Add projeto_id to financial_transactions
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS projeto_id UUID;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_projeto
  ON financial_transactions(projeto_id) WHERE projeto_id IS NOT NULL;

COMMENT ON COLUMN financial_transactions.projeto_id IS
  'Spec §9: explicit project link for CAPEX auto-transactions (distinct from process_id/case link)';

-- Add projeto_id to real_estate_assets so CAPEX auto-link has a source
ALTER TABLE real_estate_assets
  ADD COLUMN IF NOT EXISTS projeto_id UUID;

CREATE INDEX IF NOT EXISTS idx_real_estate_assets_projeto
  ON real_estate_assets(projeto_id) WHERE projeto_id IS NOT NULL;

COMMENT ON COLUMN real_estate_assets.projeto_id IS
  'Spec §9: project reference for CAPEX auto-transaction linking';
