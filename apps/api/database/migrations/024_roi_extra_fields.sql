-- ============================================
-- Migration 024: Add opex, registry fees, insurance to ROI
-- ============================================

ALTER TABLE auction_asset_roi ADD COLUMN IF NOT EXISTS opex_monthly_cents BIGINT DEFAULT 0;
ALTER TABLE auction_asset_roi ADD COLUMN IF NOT EXISTS registry_fees_cents BIGINT DEFAULT 0;
ALTER TABLE auction_asset_roi ADD COLUMN IF NOT EXISTS insurance_cents BIGINT DEFAULT 0;
