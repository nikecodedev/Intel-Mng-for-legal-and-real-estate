-- Migration 052: asset_listings table
-- Used by real-estate-assets.ts POST /:id/publish to record active property listings.

CREATE TABLE IF NOT EXISTS asset_listings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  real_estate_asset_id  UUID NOT NULL REFERENCES real_estate_assets(id) ON DELETE CASCADE,
  listing_type          VARCHAR(20) NOT NULL DEFAULT 'VENDA',  -- VENDA | ALUGUEL
  asking_price_cents    BIGINT,
  description           TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | SOLD | RENTED
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT asset_listings_type_check CHECK (listing_type IN ('VENDA', 'ALUGUEL', 'LEILAO')),
  CONSTRAINT asset_listings_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SOLD', 'RENTED'))
);

-- Unique: one active listing per asset per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_listings_active
  ON asset_listings(tenant_id, real_estate_asset_id, status)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_asset_listings_tenant ON asset_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_listings_asset  ON asset_listings(real_estate_asset_id);

COMMENT ON TABLE asset_listings IS 'Active and historical property listings for real estate assets';
