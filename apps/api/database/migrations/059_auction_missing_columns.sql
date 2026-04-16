-- Migration 059: Add missing columns to auction_assets
-- The auto_recalculate_risk_score trigger (created in 016) references
-- minimum_bid_cents, appraisal_value_cents, total_debt_cents but these
-- columns were never added — blocking ALL inserts into auction_assets.
-- Also adds certidoes_negativas referenced by fn_enforce_mpga_hard_gate.

ALTER TABLE auction_assets
  ADD COLUMN IF NOT EXISTS minimum_bid_cents      BIGINT,
  ADD COLUMN IF NOT EXISTS appraisal_value_cents  BIGINT,
  ADD COLUMN IF NOT EXISTS total_debt_cents       BIGINT,
  ADD COLUMN IF NOT EXISTS certidoes_negativas    BOOLEAN DEFAULT true;

COMMENT ON COLUMN auction_assets.minimum_bid_cents     IS 'Minimum bid amount in cents';
COMMENT ON COLUMN auction_assets.appraisal_value_cents IS 'Appraised market value in cents';
COMMENT ON COLUMN auction_assets.total_debt_cents      IS 'Total outstanding debts in cents';
COMMENT ON COLUMN auction_assets.certidoes_negativas   IS 'All clearance certificates are valid (true = OK, false = irregular)';
