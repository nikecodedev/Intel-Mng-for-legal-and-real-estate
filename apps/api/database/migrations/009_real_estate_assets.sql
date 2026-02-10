-- ============================================
-- Migration 009: Real Estate Asset Management
-- State machine: Acquired → Regularization → Renovation → Ready → Sold/Rented
-- Cost tracking, vacancy monitoring, links to auctions/documents/financial records
-- ============================================

-- Real Estate Assets table
CREATE TABLE IF NOT EXISTS real_estate_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Asset identification
    asset_code VARCHAR(255) UNIQUE NOT NULL, -- Unique identifier (e.g., "REA-001")
    property_address TEXT NOT NULL,
    property_type VARCHAR(100), -- e.g., "apartment", "house", "commercial", "land"
    property_size_sqm DECIMAL(10, 2), -- Property size in square meters
    number_of_rooms INTEGER,
    number_of_bathrooms INTEGER,
    
    -- State machine (enforced at API level)
    -- Valid states: ACQUIRED, REGULARIZATION, RENOVATION, READY, SOLD, RENTED
    current_state VARCHAR(50) NOT NULL DEFAULT 'ACQUIRED',
    CONSTRAINT valid_asset_state CHECK (
        current_state IN ('ACQUIRED', 'REGULARIZATION', 'RENOVATION', 'READY', 'SOLD', 'RENTED')
    ),
    
    -- State transition tracking
    state_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    state_changed_by UUID REFERENCES users(id),
    state_change_reason TEXT,
    
    -- Links to other entities
    auction_asset_id UUID REFERENCES auction_assets(id) ON DELETE SET NULL, -- Link to auction record
    linked_document_ids UUID[] NOT NULL DEFAULT '{}', -- Legal documents
    linked_financial_record_ids UUID[] NOT NULL DEFAULT '{}', -- Financial records (future table)
    
    -- Acquisition information
    acquisition_date DATE,
    acquisition_price_cents BIGINT, -- Purchase price in cents
    acquisition_source VARCHAR(100), -- e.g., "auction", "direct_purchase", "inheritance"
    
    -- Sale/Rental information (when state is SOLD or RENTED)
    sale_date DATE,
    sale_price_cents BIGINT,
    sale_buyer_name VARCHAR(255),
    rental_start_date DATE,
    rental_end_date DATE,
    rental_monthly_amount_cents BIGINT,
    rental_tenant_name VARCHAR(255),
    
    -- Vacancy tracking
    is_vacant BOOLEAN DEFAULT true,
    vacancy_start_date DATE,
    vacancy_alert_sent BOOLEAN DEFAULT false,
    vacancy_alert_threshold_days INTEGER DEFAULT 90, -- Alert after X days of vacancy
    
    -- Ownership and assignment
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

CREATE INDEX idx_real_estate_assets_tenant_id ON real_estate_assets(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_real_estate_assets_asset_code ON real_estate_assets(asset_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_real_estate_assets_state ON real_estate_assets(tenant_id, current_state) WHERE deleted_at IS NULL;
CREATE INDEX idx_real_estate_assets_auction_link ON real_estate_assets(auction_asset_id) WHERE auction_asset_id IS NOT NULL;
CREATE INDEX idx_real_estate_assets_vacancy ON real_estate_assets(tenant_id, is_vacant, vacancy_start_date) 
    WHERE deleted_at IS NULL AND is_vacant = true;
CREATE INDEX idx_real_estate_assets_created_at ON real_estate_assets(created_at);

COMMENT ON TABLE real_estate_assets IS 'Real estate assets with state machine: Acquired → Regularization → Renovation → Ready → Sold/Rented';
COMMENT ON COLUMN real_estate_assets.current_state IS 'State machine: ACQUIRED → REGULARIZATION → RENOVATION → READY → SOLD/RENTED (transitions enforced at API)';
COMMENT ON COLUMN real_estate_assets.is_vacant IS 'Vacancy status; alerts triggered when vacant for threshold_days';

-- Asset Costs table (tracks all costs per asset)
CREATE TABLE IF NOT EXISTS asset_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Asset reference
    real_estate_asset_id UUID NOT NULL REFERENCES real_estate_assets(id) ON DELETE CASCADE,
    
    -- Cost information
    cost_type VARCHAR(100) NOT NULL, -- e.g., "acquisition", "regularization", "renovation", "maintenance", "taxes", "legal", "other"
    cost_category VARCHAR(100), -- e.g., "labor", "materials", "legal_fees", "taxes", "utilities"
    description TEXT NOT NULL,
    amount_cents BIGINT NOT NULL, -- Cost amount in cents
    currency VARCHAR(3) DEFAULT 'BRL', -- ISO currency code
    
    -- Cost date and period
    cost_date DATE NOT NULL, -- When the cost was incurred
    invoice_number VARCHAR(255), -- Invoice/receipt number
    vendor_name VARCHAR(255), -- Vendor/supplier name
    
    -- Approval and tracking
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    payment_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PAID, PARTIAL, CANCELLED
    payment_date DATE,
    
    -- Links
    linked_document_id UUID REFERENCES documents(id) ON DELETE SET NULL, -- Receipt/invoice document
    linked_financial_record_id UUID, -- Future: link to financial records table
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT positive_amount CHECK (amount_cents > 0),
    CONSTRAINT valid_payment_status CHECK (payment_status IN ('PENDING', 'PAID', 'PARTIAL', 'CANCELLED'))
);

CREATE INDEX idx_asset_costs_tenant_id ON asset_costs(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_costs_asset_id ON asset_costs(real_estate_asset_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_costs_type ON asset_costs(tenant_id, cost_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_costs_date ON asset_costs(cost_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_costs_payment_status ON asset_costs(tenant_id, payment_status) WHERE deleted_at IS NULL;

COMMENT ON TABLE asset_costs IS 'Tracks all costs associated with real estate assets';
COMMENT ON COLUMN asset_costs.cost_type IS 'Type of cost: acquisition, regularization, renovation, maintenance, taxes, legal, other';
COMMENT ON COLUMN asset_costs.amount_cents IS 'Cost amount in cents (for precision)';

-- Vacancy Monitoring table (tracks vacancy alerts and history)
CREATE TABLE IF NOT EXISTS vacancy_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Asset reference
    real_estate_asset_id UUID NOT NULL REFERENCES real_estate_assets(id) ON DELETE CASCADE,
    
    -- Vacancy period
    vacancy_start_date DATE NOT NULL,
    vacancy_end_date DATE, -- NULL if still vacant
    total_vacancy_days INTEGER, -- Calculated when vacancy ends
    
    -- Alert tracking
    alert_sent_at TIMESTAMP WITH TIME ZONE,
    alert_sent_to UUID REFERENCES users(id), -- User who received the alert
    alert_type VARCHAR(50), -- e.g., "threshold_reached", "extended_vacancy", "custom"
    alert_message TEXT,
    
    -- Status
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    resolution_notes TEXT,
    
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_vacancy_monitoring_tenant_id ON vacancy_monitoring(tenant_id);
CREATE INDEX idx_vacancy_monitoring_asset_id ON vacancy_monitoring(real_estate_asset_id);
CREATE INDEX idx_vacancy_monitoring_active ON vacancy_monitoring(real_estate_asset_id, is_resolved) 
    WHERE is_resolved = false;
CREATE INDEX idx_vacancy_monitoring_dates ON vacancy_monitoring(vacancy_start_date, vacancy_end_date);

COMMENT ON TABLE vacancy_monitoring IS 'Tracks vacancy periods and alerts for real estate assets';

-- State Transition History table (audit trail for state changes)
CREATE TABLE IF NOT EXISTS asset_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Asset reference
    real_estate_asset_id UUID NOT NULL REFERENCES real_estate_assets(id) ON DELETE CASCADE,
    
    -- Transition information
    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    transition_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    transitioned_by UUID REFERENCES users(id),
    transition_reason TEXT,
    
    -- Validation
    is_valid BOOLEAN DEFAULT true, -- False if transition was blocked
    validation_error TEXT, -- Error message if transition was invalid
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_asset_state_transitions_tenant_id ON asset_state_transitions(tenant_id);
CREATE INDEX idx_asset_state_transitions_asset_id ON asset_state_transitions(real_estate_asset_id);
CREATE INDEX idx_asset_state_transitions_date ON asset_state_transitions(transition_date);
CREATE INDEX idx_asset_state_transitions_states ON asset_state_transitions(from_state, to_state);

COMMENT ON TABLE asset_state_transitions IS 'Audit trail of all state transitions for real estate assets';

-- Triggers for updated_at
CREATE TRIGGER update_real_estate_assets_updated_at 
    BEFORE UPDATE ON real_estate_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_asset_costs_updated_at 
    BEFORE UPDATE ON asset_costs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vacancy_monitoring_updated_at 
    BEFORE UPDATE ON vacancy_monitoring
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
