-- Migration 055: legal_hold / trava_venda for real_estate_assets (Spec §5.5 / Divergência #7)
-- Adds boolean flags and a DB trigger that blocks any asset listing when either flag is set.

-- 1. Add legal_hold and trava_venda columns
ALTER TABLE real_estate_assets
  ADD COLUMN IF NOT EXISTS legal_hold       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trava_venda      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS trava_venda_reason TEXT,
  ADD COLUMN IF NOT EXISTS legal_hold_set_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trava_venda_set_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legal_hold_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trava_venda_set_at TIMESTAMPTZ;

COMMENT ON COLUMN real_estate_assets.legal_hold IS 'True = asset is under legal hold — all sales/listings blocked (Spec §5.5)';
COMMENT ON COLUMN real_estate_assets.trava_venda IS 'True = sales lock applied — asset cannot be listed for sale (Spec §5.5)';

-- 2. Index for quick lookup of blocked assets
CREATE INDEX IF NOT EXISTS idx_real_estate_assets_legal_hold  ON real_estate_assets(tenant_id, legal_hold)  WHERE legal_hold = true;
CREATE INDEX IF NOT EXISTS idx_real_estate_assets_trava_venda ON real_estate_assets(tenant_id, trava_venda) WHERE trava_venda = true;

-- 3. DB trigger: block INSERT into asset_listings when legal_hold or trava_venda is set
CREATE OR REPLACE FUNCTION fn_enforce_asset_sale_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_legal_hold    BOOLEAN;
  v_trava_venda   BOOLEAN;
  v_matricula     TEXT;
BEGIN
  SELECT legal_hold, trava_venda, matricula_status
  INTO v_legal_hold, v_trava_venda, v_matricula
  FROM real_estate_assets
  WHERE id = NEW.real_estate_asset_id
    AND tenant_id = NEW.tenant_id;

  IF v_legal_hold THEN
    RAISE EXCEPTION 'TRAVA_VENDA: imóvel com legal_hold ativo — listagem bloqueada (Spec §5.5)'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_trava_venda THEN
    RAISE EXCEPTION 'TRAVA_VENDA: trava_venda ativa neste imóvel — listagem bloqueada (Spec §5.5)'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_matricula IN ('EM_REGULARIZACAO', 'COM_ONUS') THEN
    RAISE EXCEPTION 'TRAVA_VENDA: matrícula em status % — listagem bloqueada (Spec §5.5)', v_matricula
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_sale_blocks ON asset_listings;
CREATE TRIGGER trg_asset_sale_blocks
  BEFORE INSERT ON asset_listings
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_asset_sale_blocks();

COMMENT ON FUNCTION fn_enforce_asset_sale_blocks() IS 'Blocks asset_listings INSERT when legal_hold or trava_venda is set (Spec §5.5)';
