-- Migration 050: Add domain and tenant_code columns to tenants table
-- Required by auth.ts:123 subdomain tenant resolution query.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tenant_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS subdomain VARCHAR(100),
  ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'Starter',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Populate tenant_code from name for existing rows (slug-style)
UPDATE tenants
SET tenant_code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g'))
WHERE tenant_code IS NULL;

-- Populate domain from name for existing rows
UPDATE tenants
SET domain = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g')) || '.gems.local'
WHERE domain IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain      ON tenants(domain)      WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_tenant_code ON tenants(tenant_code) WHERE tenant_code IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_tenants_subdomain   ON tenants(subdomain)   WHERE subdomain IS NOT NULL;

COMMENT ON COLUMN tenants.domain      IS 'Primary domain for tenant subdomain resolution (auth login)';
COMMENT ON COLUMN tenants.tenant_code IS 'Short alphanumeric code for subdomain lookup';
COMMENT ON COLUMN tenants.subdomain   IS 'Subdomain prefix (e.g. acme in acme.gems.app)';
COMMENT ON COLUMN tenants.plan        IS 'Subscription plan: Starter/Professional/Enterprise/Custom';
