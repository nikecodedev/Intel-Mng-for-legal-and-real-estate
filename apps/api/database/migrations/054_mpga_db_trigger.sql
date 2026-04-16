-- Migration 054: MPGA Hard Gate at DB level (Spec §3.5 / Divergência #3)
-- Adds a DB trigger on auction_bids that enforces MPGA block at insert time.
-- No INSERT into auction_bids is allowed when:
--   a) risk_score >= 50 (high risk), OR
--   b) certidoes_negativas = false (irregular clearance certificates), OR
--   c) mpga_risk_score is set and >= 70 (dedicated MPGA score)
--
-- This guarantees the gate cannot be bypassed even via direct DB access.

-- 1. Add dedicated mpga_risk_score to auction_assets (Divergência #6)
ALTER TABLE auction_assets
  ADD COLUMN IF NOT EXISTS mpga_risk_score INTEGER,
  ADD COLUMN IF NOT EXISTS mpga_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mpga_evaluated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mpga_blocked_reason TEXT;

ALTER TABLE auction_assets
  ADD CONSTRAINT valid_mpga_risk_score CHECK (mpga_risk_score IS NULL OR (mpga_risk_score >= 0 AND mpga_risk_score <= 100));

COMMENT ON COLUMN auction_assets.mpga_risk_score IS 'Dedicated MPGA risk score (0-100). >= 70 blocks bidding at DB level (Spec §3.5)';
COMMENT ON COLUMN auction_assets.mpga_evaluated_at IS 'Timestamp of last MPGA evaluation';
COMMENT ON COLUMN auction_assets.mpga_blocked_reason IS 'Human-readable reason for MPGA block';

-- 2. DB trigger function that enforces MPGA hard gate on bid INSERT
CREATE OR REPLACE FUNCTION fn_enforce_mpga_hard_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_risk_score        INTEGER;
  v_certidoes         BOOLEAN;
  v_mpga_risk_score   INTEGER;
BEGIN
  SELECT
    risk_score,
    certidoes_negativas,
    mpga_risk_score
  INTO
    v_risk_score,
    v_certidoes,
    v_mpga_risk_score
  FROM auction_assets
  WHERE id = NEW.auction_asset_id
    AND tenant_id = NEW.tenant_id;

  -- Hard Gate 1: certidões negativas blocked
  IF v_certidoes = false THEN
    RAISE EXCEPTION 'MPGA_HARD_GATE: certidões negativas irregulares — lance bloqueado (Spec §3.5)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Hard Gate 2: generic risk_score >= 50 blocked
  IF v_risk_score >= 50 THEN
    RAISE EXCEPTION 'MPGA_HARD_GATE: risco elevado (risk_score=%) — lance bloqueado (Spec §3.5)', v_risk_score
      USING ERRCODE = 'P0001';
  END IF;

  -- Hard Gate 3: dedicated MPGA score >= 70 blocked
  IF v_mpga_risk_score IS NOT NULL AND v_mpga_risk_score >= 70 THEN
    RAISE EXCEPTION 'MPGA_HARD_GATE: MPGA risk score elevado (mpga_risk_score=%) — lance bloqueado (Spec §3.5)', v_mpga_risk_score
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger to auction_bids
DROP TRIGGER IF EXISTS trg_mpga_hard_gate ON auction_bids;
CREATE TRIGGER trg_mpga_hard_gate
  BEFORE INSERT ON auction_bids
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_mpga_hard_gate();

COMMENT ON FUNCTION fn_enforce_mpga_hard_gate() IS 'Enforces MPGA Hard Gate at DB level — blocks bid inserts when risk is HIGH or certidoes are irregular (Spec §3.5)';
