-- ============================================
-- Migration 008: Investor Portal
-- Secure, read-only investor access to assigned assets
-- ============================================

-- Investor users table (separate from regular users)
-- Separate authentication flow, read-only access only
CREATE TABLE IF NOT EXISTS investor_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Authentication
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    
    -- Security flags
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    
    -- Compliance
    accepted_terms_version VARCHAR(50),
    accepted_terms_at TIMESTAMP WITH TIME ZONE,
    privacy_policy_version VARCHAR(50),
    privacy_policy_accepted_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_investor_email_per_tenant UNIQUE(tenant_id, email) WHERE deleted_at IS NULL,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT failed_attempts_range CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 10)
);

CREATE INDEX idx_investor_users_tenant_id ON investor_users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_investor_users_email ON investor_users(tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_investor_users_active ON investor_users(is_active, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_investor_users_last_activity ON investor_users(last_activity_at) WHERE deleted_at IS NULL;

-- Investor refresh tokens (separate from regular user tokens)
CREATE TABLE IF NOT EXISTS investor_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_user_id UUID NOT NULL REFERENCES investor_users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    user_agent TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX idx_investor_refresh_tokens_investor_id ON investor_refresh_tokens(investor_user_id);
CREATE INDEX idx_investor_refresh_tokens_token ON investor_refresh_tokens(token);
CREATE INDEX idx_investor_refresh_tokens_active ON investor_refresh_tokens(token, expires_at) 
    WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP;

-- Investor asset links (many-to-many: investors can view multiple assets)
-- This table controls which assets an investor can access
CREATE TABLE IF NOT EXISTS investor_asset_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Investor and asset references
    investor_user_id UUID NOT NULL REFERENCES investor_users(id) ON DELETE CASCADE,
    auction_asset_id UUID NOT NULL REFERENCES auction_assets(id) ON DELETE CASCADE,
    
    -- Access control metadata
    granted_by UUID REFERENCES users(id), -- Admin user who granted access
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    access_notes TEXT, -- Optional notes about why access was granted
    
    -- Revocation support
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_investor_asset_link UNIQUE(investor_user_id, auction_asset_id) 
        WHERE revoked_at IS NULL
);

CREATE INDEX idx_investor_asset_links_tenant_id ON investor_asset_links(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_investor_asset_links_investor_id ON investor_asset_links(investor_user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_investor_asset_links_asset_id ON investor_asset_links(auction_asset_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_investor_asset_links_active ON investor_asset_links(investor_user_id, auction_asset_id) 
    WHERE revoked_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER update_investor_users_updated_at 
    BEFORE UPDATE ON investor_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_investor_asset_links_updated_at 
    BEFORE UPDATE ON investor_asset_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE investor_users IS 'Investor portal users - separate from regular users, read-only access only';
COMMENT ON TABLE investor_asset_links IS 'Links investors to auction assets they can view (read-only)';
COMMENT ON TABLE investor_refresh_tokens IS 'JWT refresh tokens for investor authentication';
