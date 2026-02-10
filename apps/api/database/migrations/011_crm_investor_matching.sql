-- ============================================
-- Migration 011: CRM and Investor Matching Engine
-- KYC enforcement, investor profiles, matching engine
-- ============================================

-- KYC Data table (Know Your Customer - mandatory for investor onboarding)
CREATE TABLE IF NOT EXISTS kyc_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Link to investor
    investor_user_id UUID NOT NULL REFERENCES investor_users(id) ON DELETE CASCADE,
    
    -- Personal information
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    nationality VARCHAR(100),
    tax_id VARCHAR(50), -- CPF/CNPJ
    tax_id_type VARCHAR(20), -- 'CPF', 'CNPJ', 'PASSPORT', 'OTHER'
    
    -- Address information
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    
    -- Contact information
    phone_number VARCHAR(50),
    alternate_email VARCHAR(255),
    
    -- Identity verification documents
    identity_document_type VARCHAR(50), -- 'RG', 'CNH', 'PASSPORT', 'OTHER'
    identity_document_number VARCHAR(100),
    identity_document_front_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    identity_document_back_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    
    -- Proof of address
    proof_of_address_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    
    -- Financial information
    source_of_funds VARCHAR(100), -- 'SALARY', 'INVESTMENT', 'BUSINESS', 'INHERITANCE', 'OTHER'
    annual_income_range VARCHAR(50), -- 'UNDER_50K', '50K_100K', '100K_500K', 'OVER_500K'
    net_worth_range VARCHAR(50), -- 'UNDER_100K', '100K_500K', '500K_1M', 'OVER_1M'
    
    -- KYC status
    kyc_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'
    kyc_level VARCHAR(20) DEFAULT 'BASIC', -- 'BASIC', 'INTERMEDIATE', 'ADVANCED'
    
    -- Review information
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    rejection_reason TEXT,
    
    -- Compliance
    pep_status VARCHAR(20), -- 'NO', 'YES', 'UNKNOWN' (Politically Exposed Person)
    sanctions_check_status VARCHAR(20), -- 'PENDING', 'CLEAR', 'FLAGGED'
    sanctions_check_date TIMESTAMP WITH TIME ZONE,
    
    -- Expiration
    kyc_expires_at TIMESTAMP WITH TIME ZONE, -- KYC must be renewed periodically
    last_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_kyc_status CHECK (
        kyc_status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')
    ),
    CONSTRAINT valid_kyc_level CHECK (
        kyc_level IN ('BASIC', 'INTERMEDIATE', 'ADVANCED')
    ),
    CONSTRAINT valid_pep_status CHECK (
        pep_status IN ('NO', 'YES', 'UNKNOWN')
    ),
    CONSTRAINT valid_sanctions_status CHECK (
        sanctions_check_status IN ('PENDING', 'CLEAR', 'FLAGGED')
    ),
    CONSTRAINT kyc_approved_requires_review CHECK (
        kyc_status != 'APPROVED' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX idx_kyc_data_tenant_id ON kyc_data(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_kyc_data_investor_id ON kyc_data(investor_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_kyc_data_status ON kyc_data(tenant_id, kyc_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_kyc_data_tax_id ON kyc_data(tenant_id, tax_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_kyc_data_expires ON kyc_data(kyc_expires_at) WHERE kyc_expires_at IS NOT NULL;

COMMENT ON TABLE kyc_data IS 'KYC (Know Your Customer) data - mandatory for investor onboarding';
COMMENT ON COLUMN kyc_data.kyc_status IS 'KYC approval status - investors cannot access matching until APPROVED';

-- Investor Preference Profiles table
CREATE TABLE IF NOT EXISTS investor_preference_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Link to investor
    investor_user_id UUID NOT NULL REFERENCES investor_users(id) ON DELETE CASCADE,
    
    -- Budget preferences
    min_budget_cents BIGINT, -- Minimum investment amount in cents
    max_budget_cents BIGINT NOT NULL, -- Maximum investment amount in cents
    preferred_budget_cents BIGINT, -- Preferred investment amount
    
    -- Risk tolerance (0-100 scale)
    risk_tolerance_score INTEGER NOT NULL DEFAULT 50,
    CONSTRAINT valid_risk_tolerance CHECK (risk_tolerance_score >= 0 AND risk_tolerance_score <= 100),
    
    -- Asset type preferences
    preferred_asset_types TEXT[] NOT NULL DEFAULT '{}', -- e.g., ['apartment', 'house', 'commercial']
    excluded_asset_types TEXT[] DEFAULT '{}', -- Asset types to exclude
    
    -- Location preferences
    preferred_locations TEXT[], -- Preferred cities/regions
    excluded_locations TEXT[], -- Locations to exclude
    
    -- Property characteristics
    min_property_size_sqm DECIMAL(10, 2), -- Minimum property size
    max_property_size_sqm DECIMAL(10, 2), -- Maximum property size
    preferred_number_of_rooms INTEGER, -- Preferred number of rooms
    preferred_number_of_bathrooms INTEGER, -- Preferred number of bathrooms
    
    -- Investment criteria
    min_expected_roi_percentage DECIMAL(5, 2), -- Minimum expected ROI
    max_acceptable_risk_score INTEGER, -- Maximum acceptable risk score (0-100)
    
    -- Notification preferences
    auto_notify_enabled BOOLEAN DEFAULT true, -- Auto-notify when match score > threshold
    notification_threshold INTEGER DEFAULT 85, -- Minimum match score to trigger notification (0-100)
    notification_channels TEXT[] DEFAULT ARRAY['email'], -- ['email', 'sms', 'push']
    
    -- Profile status
    is_active BOOLEAN DEFAULT true,
    profile_completed_at TIMESTAMP WITH TIME ZONE, -- When profile was completed
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_budget_range CHECK (
        min_budget_cents IS NULL OR min_budget_cents <= max_budget_cents
    ),
    CONSTRAINT valid_notification_threshold CHECK (
        notification_threshold >= 0 AND notification_threshold <= 100
    ),
    CONSTRAINT valid_max_risk CHECK (
        max_acceptable_risk_score IS NULL OR (max_acceptable_risk_score >= 0 AND max_acceptable_risk_score <= 100)
    )
);

CREATE INDEX idx_investor_preference_profiles_tenant_id ON investor_preference_profiles(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_investor_preference_profiles_investor_id ON investor_preference_profiles(investor_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_investor_preference_profiles_active ON investor_preference_profiles(tenant_id, is_active) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_investor_preference_profiles_budget ON investor_preference_profiles(tenant_id, min_budget_cents, max_budget_cents) WHERE deleted_at IS NULL;
CREATE INDEX idx_investor_preference_profiles_asset_types ON investor_preference_profiles USING GIN(preferred_asset_types) WHERE deleted_at IS NULL;

COMMENT ON TABLE investor_preference_profiles IS 'Investor preference profiles for matching engine';
COMMENT ON COLUMN investor_preference_profiles.risk_tolerance_score IS 'Risk tolerance score 0-100 (0=very conservative, 100=very aggressive)';
COMMENT ON COLUMN investor_preference_profiles.notification_threshold IS 'Minimum match score (0-100) to trigger auto-notification';

-- Match Records table (tracks all match decisions)
CREATE TABLE IF NOT EXISTS match_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Investor and asset references
    investor_user_id UUID NOT NULL REFERENCES investor_users(id) ON DELETE CASCADE,
    auction_asset_id UUID NOT NULL REFERENCES auction_assets(id) ON DELETE CASCADE,
    investor_preference_profile_id UUID REFERENCES investor_preference_profiles(id) ON DELETE SET NULL,
    
    -- Match scoring
    match_score INTEGER NOT NULL, -- Overall match score (0-100)
    CONSTRAINT valid_match_score CHECK (match_score >= 0 AND match_score <= 100),
    
    -- Score breakdown (for transparency)
    budget_score INTEGER, -- Budget match score (0-100)
    risk_score INTEGER, -- Risk match score (0-100)
    asset_type_score INTEGER, -- Asset type match score (0-100)
    location_score INTEGER, -- Location match score (0-100)
    property_characteristics_score INTEGER, -- Property characteristics match score (0-100)
    roi_score INTEGER, -- ROI match score (0-100)
    
    -- Match decision
    match_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'NOTIFIED', 'VIEWED', 'INTERESTED', 'NOT_INTERESTED', 'EXPIRED'
    is_auto_notified BOOLEAN DEFAULT false, -- Whether auto-notification was sent
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    notification_channel VARCHAR(50), -- 'email', 'sms', 'push'
    
    -- Investor response
    investor_viewed_at TIMESTAMP WITH TIME ZONE,
    investor_interest_level VARCHAR(50), -- 'HIGH', 'MEDIUM', 'LOW', 'NONE'
    investor_feedback TEXT,
    
    -- Match metadata
    match_reason TEXT, -- Why this match was created (e.g., 'auto_match', 'manual', 'threshold_exceeded')
    match_algorithm_version VARCHAR(50), -- Version of matching algorithm used
    match_details JSONB DEFAULT '{}'::jsonb, -- Detailed match breakdown
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_match_status CHECK (
        match_status IN ('PENDING', 'NOTIFIED', 'VIEWED', 'INTERESTED', 'NOT_INTERESTED', 'EXPIRED')
    ),
    CONSTRAINT valid_interest_level CHECK (
        investor_interest_level IS NULL OR investor_interest_level IN ('HIGH', 'MEDIUM', 'LOW', 'NONE')
    ),
    CONSTRAINT unique_investor_asset_match UNIQUE(investor_user_id, auction_asset_id, created_at)
);

CREATE INDEX idx_match_records_tenant_id ON match_records(tenant_id);
CREATE INDEX idx_match_records_investor_id ON match_records(investor_user_id);
CREATE INDEX idx_match_records_asset_id ON match_records(auction_asset_id);
CREATE INDEX idx_match_records_score ON match_records(tenant_id, match_score DESC) WHERE match_status != 'EXPIRED';
CREATE INDEX idx_match_records_status ON match_records(tenant_id, match_status);
CREATE INDEX idx_match_records_auto_notified ON match_records(tenant_id, is_auto_notified, match_score) WHERE is_auto_notified = true;
CREATE INDEX idx_match_records_created_at ON match_records(created_at DESC);

COMMENT ON TABLE match_records IS 'Match records - tracks all match decisions between investors and auction assets';
COMMENT ON COLUMN match_records.match_score IS 'Overall match score 0-100 (calculated by matching algorithm)';
COMMENT ON COLUMN match_records.is_auto_notified IS 'Whether investor was auto-notified (when score > threshold)';

-- Triggers for updated_at
CREATE TRIGGER update_kyc_data_updated_at 
    BEFORE UPDATE ON kyc_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_investor_preference_profiles_updated_at 
    BEFORE UPDATE ON investor_preference_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_records_updated_at 
    BEFORE UPDATE ON match_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check if investor can access matching (KYC must be approved)
CREATE OR REPLACE FUNCTION can_investor_access_matching(p_investor_user_id UUID, p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_kyc_status VARCHAR(50);
BEGIN
    SELECT kyc_status INTO v_kyc_status
    FROM kyc_data
    WHERE investor_user_id = p_investor_user_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND kyc_status = 'APPROVED'
      AND (kyc_expires_at IS NULL OR kyc_expires_at > CURRENT_TIMESTAMP)
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN v_kyc_status = 'APPROVED';
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION can_investor_access_matching IS 'Checks if investor has approved KYC and can access matching engine';
