-- ============================================
-- Migration 014: SaaS Super Admin Module
-- Tenant provisioning, white-label config, storage tracking, quotas
-- ============================================

-- Extend tenants table with additional fields for super admin management
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS 
    -- Tenant identification
    tenant_code VARCHAR(100) UNIQUE, -- Unique tenant identifier (e.g., "acme-corp")
    domain VARCHAR(255), -- Custom domain (e.g., "acme.platform.com")
    
    -- Subscription and billing
    subscription_plan VARCHAR(50) DEFAULT 'STANDARD', -- 'FREE', 'STANDARD', 'PREMIUM', 'ENTERPRISE'
    subscription_status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'TRIAL', 'EXPIRED', 'CANCELLED'
    subscription_start_date DATE,
    subscription_end_date DATE,
    trial_end_date DATE,
    
    -- Contact information
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    billing_email VARCHAR(255),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    
    -- Timestamps
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    suspended_at TIMESTAMP WITH TIME ZONE,
    suspended_by UUID REFERENCES users(id),
    suspension_reason TEXT,
    reactivated_at TIMESTAMP WITH TIME ZONE,
    reactivated_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_subscription_plan CHECK (
        subscription_plan IN ('FREE', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CUSTOM')
    ),
    CONSTRAINT valid_subscription_status CHECK (
        subscription_status IN ('ACTIVE', 'TRIAL', 'EXPIRED', 'CANCELLED', 'SUSPENDED')
    );

CREATE INDEX idx_tenants_code ON tenants(tenant_code) WHERE tenant_code IS NOT NULL;
CREATE INDEX idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_tenants_subscription ON tenants(subscription_plan, subscription_status);
CREATE INDEX idx_tenants_suspended ON tenants(status) WHERE status = 'SUSPENDED';

-- White Label Configuration table
CREATE TABLE IF NOT EXISTS white_label_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant reference
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Branding
    logo_url VARCHAR(512), -- URL to tenant logo
    logo_file_id UUID REFERENCES documents(id) ON DELETE SET NULL, -- Stored logo file
    favicon_url VARCHAR(512),
    company_name VARCHAR(255),
    company_website VARCHAR(255),
    
    -- Color scheme
    primary_color VARCHAR(7), -- Hex color (e.g., "#FF5733")
    secondary_color VARCHAR(7),
    accent_color VARCHAR(7),
    background_color VARCHAR(7),
    text_color VARCHAR(7),
    link_color VARCHAR(7),
    
    -- Typography
    font_family VARCHAR(100),
    heading_font VARCHAR(100),
    
    -- Custom CSS (optional)
    custom_css TEXT,
    
    -- Email branding
    email_template_header_image_url VARCHAR(512),
    email_signature TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT unique_tenant_white_label UNIQUE(tenant_id) WHERE is_active = true,
    CONSTRAINT valid_hex_color CHECK (
        primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'
    )
);

CREATE INDEX idx_white_label_config_tenant_id ON white_label_config(tenant_id) WHERE is_active = true;

COMMENT ON TABLE white_label_config IS 'White-label configuration per tenant (logo, colors, branding)';

-- Tenant Storage Usage table (tracks storage per tenant)
CREATE TABLE IF NOT EXISTS tenant_storage_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant reference
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Storage metrics
    total_storage_bytes BIGINT DEFAULT 0, -- Total storage used in bytes
    document_storage_bytes BIGINT DEFAULT 0, -- Documents storage
    database_storage_bytes BIGINT DEFAULT 0, -- Database storage (estimated)
    backup_storage_bytes BIGINT DEFAULT 0, -- Backup storage
    
    -- File counts
    total_files INTEGER DEFAULT 0,
    document_count INTEGER DEFAULT 0,
    
    -- Usage breakdown by resource type
    usage_breakdown JSONB DEFAULT '{}'::jsonb, -- { "documents": bytes, "images": bytes, etc. }
    
    -- Measurement period
    measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT positive_storage CHECK (
        total_storage_bytes >= 0 AND
        document_storage_bytes >= 0 AND
        database_storage_bytes >= 0 AND
        backup_storage_bytes >= 0
    ),
    CONSTRAINT unique_tenant_date UNIQUE(tenant_id, measurement_date)
);

CREATE INDEX idx_tenant_storage_usage_tenant_id ON tenant_storage_usage(tenant_id);
CREATE INDEX idx_tenant_storage_usage_date ON tenant_storage_usage(measurement_date DESC);
CREATE INDEX idx_tenant_storage_usage_total ON tenant_storage_usage(tenant_id, total_storage_bytes DESC);

COMMENT ON TABLE tenant_storage_usage IS 'Tracks storage usage per tenant for quota enforcement';

-- Tenant Quotas table (defines limits per tenant)
CREATE TABLE IF NOT EXISTS tenant_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant reference
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Storage quotas
    max_storage_bytes BIGINT, -- Maximum storage in bytes (NULL = unlimited)
    max_document_storage_bytes BIGINT,
    max_database_storage_bytes BIGINT,
    
    -- User quotas
    max_users INTEGER, -- Maximum number of users (NULL = unlimited)
    max_active_users INTEGER,
    
    -- Resource quotas
    max_processes INTEGER, -- Maximum processes/cases
    max_documents INTEGER, -- Maximum documents
    max_assets INTEGER, -- Maximum real estate assets
    max_investors INTEGER, -- Maximum investor users
    
    -- API quotas
    max_api_requests_per_day INTEGER,
    max_api_requests_per_month INTEGER,
    
    -- Feature flags
    features_enabled TEXT[], -- Enabled features for this tenant
    features_disabled TEXT[], -- Disabled features
    
    -- Quota enforcement
    enforce_storage_quota BOOLEAN DEFAULT true,
    enforce_user_quota BOOLEAN DEFAULT true,
    enforce_api_quota BOOLEAN DEFAULT true,
    
    -- Override flags (super admin can override)
    storage_quota_overridden BOOLEAN DEFAULT false,
    user_quota_overridden BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT unique_tenant_quota UNIQUE(tenant_id),
    CONSTRAINT positive_quotas CHECK (
        (max_storage_bytes IS NULL OR max_storage_bytes > 0) AND
        (max_users IS NULL OR max_users > 0) AND
        (max_processes IS NULL OR max_processes > 0) AND
        (max_documents IS NULL OR max_documents > 0)
    )
);

CREATE INDEX idx_tenant_quotas_tenant_id ON tenant_quotas(tenant_id);

COMMENT ON TABLE tenant_quotas IS 'Quota limits per tenant - enforced for isolation';

-- Super Admin Users table (separate from regular users)
CREATE TABLE IF NOT EXISTS super_admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Authentication
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    
    -- Security
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Permissions
    permissions TEXT[], -- Super admin permissions
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT failed_attempts_range CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 10)
);

CREATE INDEX idx_super_admin_users_email ON super_admin_users(email);
CREATE INDEX idx_super_admin_users_active ON super_admin_users(is_active) WHERE is_active = true;

COMMENT ON TABLE super_admin_users IS 'Super admin users - separate from tenant users';

-- Tenant Activity Log table (tracks tenant activity for super admin dashboard)
CREATE TABLE IF NOT EXISTS tenant_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant reference
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Activity information
    activity_type VARCHAR(100) NOT NULL, -- 'USER_LOGIN', 'DOCUMENT_UPLOAD', 'API_CALL', etc.
    activity_description TEXT,
    
    -- Resource information
    resource_type VARCHAR(100),
    resource_id UUID,
    
    -- Metrics
    metric_value BIGINT, -- For tracking counts, sizes, etc.
    metric_unit VARCHAR(50), -- 'bytes', 'count', 'requests', etc.
    
    -- Timestamp
    activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
    activity_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_tenant_activity_log_tenant_id ON tenant_activity_log(tenant_id);
CREATE INDEX idx_tenant_activity_log_date ON tenant_activity_log(activity_date DESC);
CREATE INDEX idx_tenant_activity_log_type ON tenant_activity_log(tenant_id, activity_type);

COMMENT ON TABLE tenant_activity_log IS 'Activity log for super admin dashboard analytics';

-- Function to calculate tenant storage usage
CREATE OR REPLACE FUNCTION calculate_tenant_storage_usage(p_tenant_id UUID)
RETURNS TABLE (
    total_bytes BIGINT,
    document_bytes BIGINT,
    file_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(LENGTH(storage_path) + 1000), 0)::BIGINT as total_bytes, -- Estimate
        COALESCE(SUM(LENGTH(storage_path) + 1000), 0)::BIGINT as document_bytes,
        COUNT(*)::INTEGER as file_count
    FROM documents
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if tenant exceeds quota
CREATE OR REPLACE FUNCTION check_tenant_quota(
    p_tenant_id UUID,
    p_quota_type VARCHAR(50),
    p_current_value BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_quota_limit BIGINT;
    v_enforce BOOLEAN;
BEGIN
    SELECT 
        CASE p_quota_type
            WHEN 'storage' THEN max_storage_bytes
            WHEN 'users' THEN max_users::BIGINT
            WHEN 'documents' THEN max_documents::BIGINT
            WHEN 'processes' THEN max_processes::BIGINT
            ELSE NULL
        END,
        CASE p_quota_type
            WHEN 'storage' THEN enforce_storage_quota
            WHEN 'users' THEN enforce_user_quota
            ELSE true
        END
    INTO v_quota_limit, v_enforce
    FROM tenant_quotas
    WHERE tenant_id = p_tenant_id;
    
    -- If quota not enforced, allow
    IF NOT v_enforce THEN
        RETURN true;
    END IF;
    
    -- If no limit set, allow
    IF v_quota_limit IS NULL THEN
        RETURN true;
    END IF;
    
    -- Check if current value exceeds limit
    RETURN p_current_value < v_quota_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_tenant_quota IS 'Checks if tenant exceeds quota limit - returns true if within quota';

-- Triggers for updated_at
CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_white_label_config_updated_at 
    BEFORE UPDATE ON white_label_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_storage_usage_updated_at 
    BEFORE UPDATE ON tenant_storage_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_quotas_updated_at 
    BEFORE UPDATE ON tenant_quotas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_super_admin_users_updated_at 
    BEFORE UPDATE ON super_admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
