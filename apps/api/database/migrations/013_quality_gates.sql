-- ============================================
-- Migration 013: Compliance and Quality Gate System
-- Quality Gates QG1-QG4 with workflow blocking and immutable integrity log
-- ============================================

-- Quality Gates table (defines gate rules)
CREATE TABLE IF NOT EXISTS quality_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Gate identification
    gate_code VARCHAR(50) NOT NULL, -- 'QG1', 'QG2', 'QG3', 'QG4'
    gate_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Gate configuration
    gate_type VARCHAR(50) NOT NULL, -- 'DOCUMENT', 'APPROVAL', 'RISK_SCORE', 'CUSTOM'
    gate_category VARCHAR(100), -- 'COMPLIANCE', 'LEGAL', 'FINANCIAL', 'OPERATIONAL'
    
    -- Gate rules (JSONB for flexible rule definition)
    gate_rules JSONB NOT NULL DEFAULT '{}'::jsonb, -- Rule configuration
    
    -- Gate behavior
    is_blocking BOOLEAN DEFAULT true, -- If true, blocks workflow progression on failure
    is_mandatory BOOLEAN DEFAULT true, -- If true, gate must pass
    failure_action VARCHAR(50) DEFAULT 'BLOCK', -- 'BLOCK', 'WARN', 'REQUIRE_OVERRIDE'
    
    -- Gate status
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 50, -- Gate priority (lower = checked first)
    
    -- Applicability
    applies_to_process_types TEXT[], -- Process types this gate applies to
    applies_to_stages TEXT[], -- Workflow stages this gate applies to
    
    -- Ownership
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_gate_code CHECK (gate_code ~ '^QG[1-9][0-9]*$'),
    CONSTRAINT valid_gate_type CHECK (
        gate_type IN ('DOCUMENT', 'APPROVAL', 'RISK_SCORE', 'CUSTOM', 'DATA_COMPLETENESS', 'VALIDATION')
    ),
    CONSTRAINT valid_failure_action CHECK (
        failure_action IN ('BLOCK', 'WARN', 'REQUIRE_OVERRIDE')
    ),
    CONSTRAINT unique_gate_code_per_tenant UNIQUE(tenant_id, gate_code) WHERE deleted_at IS NULL
);

CREATE INDEX idx_quality_gates_tenant_id ON quality_gates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quality_gates_code ON quality_gates(tenant_id, gate_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_quality_gates_type ON quality_gates(tenant_id, gate_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_quality_gates_active ON quality_gates(tenant_id, is_active) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_quality_gates_priority ON quality_gates(tenant_id, priority) WHERE deleted_at IS NULL;

COMMENT ON TABLE quality_gates IS 'Quality gates definition - QG1-QG4 and custom gates';
COMMENT ON COLUMN quality_gates.gate_rules IS 'JSONB configuration for gate-specific rules (e.g., required documents, risk thresholds)';
COMMENT ON COLUMN quality_gates.is_blocking IS 'If true, workflow progression is blocked when gate fails';

-- Gate Checks table (tracks gate checks for processes/assets)
CREATE TABLE IF NOT EXISTS gate_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Gate reference
    quality_gate_id UUID NOT NULL REFERENCES quality_gates(id) ON DELETE CASCADE,
    
    -- Resource reference (process, asset, etc.)
    resource_type VARCHAR(100) NOT NULL, -- 'PROCESS', 'AUCTION_ASSET', 'REAL_ESTATE_ASSET', 'DOCUMENT'
    resource_id UUID NOT NULL, -- ID of the resource being checked
    
    -- Check status
    check_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PASSED', 'FAILED', 'OVERRIDDEN'
    check_result JSONB, -- Detailed check results
    
    -- Failure information
    failure_reason TEXT, -- Explicit failure reason (required if failed)
    failure_details JSONB, -- Additional failure details
    
    -- Override information
    is_overridden BOOLEAN DEFAULT false,
    overridden_by UUID REFERENCES users(id),
    overridden_at TIMESTAMP WITH TIME ZONE,
    override_reason TEXT,
    override_approval_required BOOLEAN DEFAULT false,
    override_approved_by UUID REFERENCES users(id),
    
    -- Check metadata
    checked_at TIMESTAMP WITH TIME ZONE,
    checked_by UUID REFERENCES users(id),
    check_duration_ms INTEGER, -- How long the check took
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_check_status CHECK (
        check_status IN ('PENDING', 'PASSED', 'FAILED', 'OVERRIDDEN', 'SKIPPED')
    ),
    CONSTRAINT failure_reason_required CHECK (
        check_status != 'FAILED' OR failure_reason IS NOT NULL
    ),
    CONSTRAINT unique_gate_resource_check UNIQUE(quality_gate_id, resource_type, resource_id, created_at)
);

CREATE INDEX idx_gate_checks_tenant_id ON gate_checks(tenant_id);
CREATE INDEX idx_gate_checks_gate_id ON gate_checks(quality_gate_id);
CREATE INDEX idx_gate_checks_resource ON gate_checks(resource_type, resource_id);
CREATE INDEX idx_gate_checks_status ON gate_checks(tenant_id, check_status) WHERE check_status IN ('PENDING', 'FAILED');
CREATE INDEX idx_gate_checks_created_at ON gate_checks(created_at DESC);

COMMENT ON TABLE gate_checks IS 'Gate checks for resources - tracks pass/fail status';
COMMENT ON COLUMN gate_checks.failure_reason IS 'MANDATORY: Explicit failure reason when gate fails';

-- Gate Decisions table (IMMUTABLE integrity log)
CREATE TABLE IF NOT EXISTS gate_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation (mandatory)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Integrity chain (immutable log)
    previous_decision_hash VARCHAR(64) NOT NULL,
    current_decision_hash VARCHAR(64) NOT NULL,
    
    -- Gate check reference
    gate_check_id UUID NOT NULL REFERENCES gate_checks(id) ON DELETE CASCADE,
    quality_gate_id UUID NOT NULL REFERENCES quality_gates(id) ON DELETE CASCADE,
    
    -- Decision information
    decision_type VARCHAR(50) NOT NULL, -- 'CHECK', 'OVERRIDE', 'APPROVAL', 'REJECTION'
    decision_result VARCHAR(50) NOT NULL, -- 'PASS', 'FAIL', 'OVERRIDE', 'BLOCKED'
    
    -- Resource information
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    
    -- Decision details
    decision_reason TEXT NOT NULL, -- Explicit reason for decision
    decision_details JSONB DEFAULT '{}'::jsonb,
    
    -- Actor information
    decided_by UUID REFERENCES users(id),
    decided_by_email VARCHAR(255),
    decided_by_role VARCHAR(100),
    
    -- Workflow impact
    workflow_blocked BOOLEAN DEFAULT false, -- Whether workflow was blocked
    workflow_stage VARCHAR(100), -- Workflow stage at time of decision
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    
    -- Compliance
    compliance_flags TEXT[], -- e.g., 'AUDIT_REQUIRED', 'REGULATORY'
    
    -- Timestamp (immutable)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_decision_type CHECK (
        decision_type IN ('CHECK', 'OVERRIDE', 'APPROVAL', 'REJECTION', 'AUTO_CHECK')
    ),
    CONSTRAINT valid_decision_result CHECK (
        decision_result IN ('PASS', 'FAIL', 'OVERRIDE', 'BLOCKED', 'WARNING')
    ),
    CONSTRAINT current_hash_format CHECK (current_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT previous_hash_format CHECK (previous_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX idx_gate_decisions_tenant_id ON gate_decisions(tenant_id);
CREATE INDEX idx_gate_decisions_gate_check_id ON gate_decisions(gate_check_id);
CREATE INDEX idx_gate_decisions_gate_id ON gate_decisions(quality_gate_id);
CREATE INDEX idx_gate_decisions_resource ON gate_decisions(resource_type, resource_id);
CREATE INDEX idx_gate_decisions_created_at ON gate_decisions(created_at DESC);
CREATE INDEX idx_gate_decisions_hash ON gate_decisions(current_hash);
CREATE INDEX idx_gate_decisions_previous_hash ON gate_decisions(previous_hash);
CREATE INDEX idx_gate_decisions_workflow_blocked ON gate_decisions(tenant_id, workflow_blocked) WHERE workflow_blocked = true;

COMMENT ON TABLE gate_decisions IS 'IMMUTABLE integrity log for all gate decisions - cannot be modified or deleted';
COMMENT ON COLUMN gate_decisions.current_decision_hash IS 'SHA-256 hash for integrity verification';
COMMENT ON COLUMN gate_decisions.decision_reason IS 'MANDATORY: Explicit reason for every decision';

-- Function to calculate gate decision hash
CREATE OR REPLACE FUNCTION calculate_gate_decision_hash(
    p_previous_hash VARCHAR(64),
    p_decision_data JSONB,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS VARCHAR(64) AS $$
DECLARE
    hash_input TEXT;
BEGIN
    hash_input := COALESCE(p_previous_hash, '') || '|' ||
                  COALESCE(p_decision_data::TEXT, '') || '|' ||
                  COALESCE(p_created_at::TEXT, '');
    RETURN encode(digest(hash_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to set previous_hash/current_hash for gate decisions
CREATE OR REPLACE FUNCTION set_gate_decision_hash()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash_value VARCHAR(64);
    decision_data JSONB;
BEGIN
    -- Build decision data JSONB
    decision_data := jsonb_build_object(
        'gate_check_id', NEW.gate_check_id,
        'quality_gate_id', NEW.quality_gate_id,
        'decision_type', NEW.decision_type,
        'decision_result', NEW.decision_result,
        'resource_type', NEW.resource_type,
        'resource_id', NEW.resource_id,
        'decision_reason', NEW.decision_reason,
        'decided_by', NEW.decided_by,
        'workflow_blocked', NEW.workflow_blocked
    ) || COALESCE(NEW.decision_details, '{}'::jsonb);

    IF NEW.created_at IS NULL THEN
        NEW.created_at := CURRENT_TIMESTAMP;
    END IF;

    -- Get previous hash
    SELECT current_decision_hash INTO prev_hash_value
    FROM gate_decisions
    WHERE tenant_id = NEW.tenant_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    NEW.previous_decision_hash := COALESCE(prev_hash_value, encode(digest('GENESIS', 'sha256'), 'hex'));
    NEW.current_decision_hash := calculate_gate_decision_hash(
        NEW.previous_decision_hash,
        decision_data,
        NEW.created_at
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set hash chain
CREATE TRIGGER set_gate_decision_hash_trigger
    BEFORE INSERT ON gate_decisions
    FOR EACH ROW EXECUTE FUNCTION set_gate_decision_hash();

-- Trigger to prevent modifications to gate_decisions (immutability)
CREATE OR REPLACE FUNCTION prevent_gate_decision_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Gate decisions are immutable. Updates and deletes are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_gate_decision_update
    BEFORE UPDATE ON gate_decisions
    FOR EACH ROW EXECUTE FUNCTION prevent_gate_decision_modification();

CREATE TRIGGER prevent_gate_decision_delete
    BEFORE DELETE ON gate_decisions
    FOR EACH ROW EXECUTE FUNCTION prevent_gate_decision_modification();

-- Triggers for updated_at
CREATE TRIGGER update_quality_gates_updated_at 
    BEFORE UPDATE ON quality_gates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gate_checks_updated_at 
    BEFORE UPDATE ON gate_checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON FUNCTION prevent_gate_decision_modification IS 'Prevents any modifications to gate_decisions table (immutability enforcement)';
