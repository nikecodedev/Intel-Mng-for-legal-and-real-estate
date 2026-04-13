-- Migration 042: Add certidoes_negativas to auction_assets
-- Spec Divergence #3: FALSE value blocks bidding (Hard Gate)

ALTER TABLE auction_assets ADD COLUMN IF NOT EXISTS certidoes_negativas BOOLEAN DEFAULT TRUE;
COMMENT ON COLUMN auction_assets.certidoes_negativas IS 'Certidões negativas — FALSE bloqueia lance (Hard Gate)';
