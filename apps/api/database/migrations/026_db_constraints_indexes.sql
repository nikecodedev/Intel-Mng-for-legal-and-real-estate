-- ============================================
-- Migration 026: DB constraints and performance indexes
-- ============================================

-- Composite index for financial transaction queries
CREATE INDEX IF NOT EXISTS idx_fin_tx_tenant_status_date ON financial_transactions(tenant_id, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_tx_tenant_type ON financial_transactions(tenant_id, transaction_type);

-- FK indexes for financial_transactions
CREATE INDEX IF NOT EXISTS idx_fin_tx_created_by ON financial_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_fin_tx_approved_by ON financial_transactions(approved_by);
CREATE INDEX IF NOT EXISTS idx_fin_tx_proof_doc ON financial_transactions(proof_document_id);

-- DB-level constraint: auction bid blocked when risk >= 70
CREATE OR REPLACE FUNCTION check_auction_bid_risk() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT risk_score FROM auction_assets WHERE id = NEW.auction_asset_id) >= 70 THEN
    RAISE EXCEPTION 'Bidding blocked: risk score >= 70%%';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_bid_risk_gate ON auction_bids;
CREATE TRIGGER enforce_bid_risk_gate
  BEFORE INSERT ON auction_bids
  FOR EACH ROW EXECUTE FUNCTION check_auction_bid_risk();

-- DB-level constraint: valid state transitions for real estate
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_real_estate_transition ON real_estate_assets;
CREATE TRIGGER enforce_real_estate_transition
  BEFORE UPDATE OF current_state ON real_estate_assets
  FOR EACH ROW EXECUTE FUNCTION check_real_estate_transition();

-- Update workflow_triggers action_type constraint to include update_state
ALTER TABLE workflow_triggers DROP CONSTRAINT IF EXISTS valid_action_type;
ALTER TABLE workflow_triggers ADD CONSTRAINT valid_action_type CHECK (action_type IN ('create_task', 'send_notification', 'block_transition', 'update_state'));
