-- Migration 043: Add source_auction_id to real_estate_assets
-- Spec Divergence #8: Arrematação F4 → cria ativo EM_REGULARIZACAO automaticamente

ALTER TABLE real_estate_assets ADD COLUMN IF NOT EXISTS source_auction_id UUID REFERENCES auction_assets(id) ON DELETE SET NULL;
COMMENT ON COLUMN real_estate_assets.source_auction_id IS 'Auction asset that originated this real estate asset (from F4 homologation)';

CREATE INDEX IF NOT EXISTS idx_real_estate_assets_source_auction_id ON real_estate_assets(source_auction_id) WHERE source_auction_id IS NOT NULL;
