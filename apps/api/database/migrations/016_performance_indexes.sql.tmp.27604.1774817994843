-- ============================================
-- Performance Indexes Migration
-- Adds indexes for foreign keys, tenant_id columns, and audit logs
-- ============================================

-- Index all foreign key columns that don't already have indexes
-- This improves JOIN performance and foreign key constraint checks

-- Users table foreign keys
CREATE INDEX IF NOT EXISTS idx_users_deleted_by ON users(deleted_by) WHERE deleted_by IS NOT NULL;

-- Roles table foreign keys
CREATE INDEX IF NOT EXISTS idx_roles_created_by ON roles(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_updated_by ON roles(updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_deleted_by ON roles(deleted_by) WHERE deleted_by IS NOT NULL;

-- Permissions table foreign keys
CREATE INDEX IF NOT EXISTS idx_permissions_created_by ON permissions(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_updated_by ON permissions(updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_deleted_by ON permissions(deleted_by) WHERE deleted_by IS NOT NULL;

-- User roles table foreign keys (already indexed, but ensure completeness)
-- idx_user_roles_user_id and idx_user_roles_role_id already exist
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by ON user_roles(assigned_by) WHERE assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_revoked_by ON user_roles(revoked_by) WHERE revoked_by IS NOT NULL;

-- Role permissions table foreign keys (already indexed, but ensure completeness)
-- idx_role_permissions_role_id and idx_role_permissions_permission_id already exist
CREATE INDEX IF NOT EXISTS idx_role_permissions_granted_by ON role_permissions(granted_by) WHERE granted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_revoked_by ON role_permissions(revoked_by) WHERE revoked_by IS NOT NULL;

-- User permissions table foreign keys (already indexed, but ensure completeness)
-- idx_user_permissions_user_id and idx_user_permissions_permission_id already exist
CREATE INDEX IF NOT EXISTS idx_user_permissions_granted_by ON user_permissions(granted_by) WHERE granted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_permissions_revoked_by ON user_permissions(revoked_by) WHERE revoked_by IS NOT NULL;

-- Processes table foreign keys
CREATE INDEX IF NOT EXISTS idx_processes_owner_id ON processes(owner_id) WHERE owner_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_processes_assigned_to_id ON processes(assigned_to_id) WHERE assigned_to_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_processes_parent_process_id ON processes(parent_process_id) WHERE parent_process_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_processes_created_by ON processes(created_by) WHERE created_by IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_processes_updated_by ON processes(updated_by) WHERE updated_by IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_processes_deleted_by ON processes(deleted_by) WHERE deleted_by IS NOT NULL;

-- Process participants table foreign keys
CREATE INDEX IF NOT EXISTS idx_process_participants_process_id ON process_participants(process_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_participants_user_id ON process_participants(user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_participants_assigned_by ON process_participants(assigned_by) WHERE assigned_by IS NOT NULL AND removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_participants_removed_by ON process_participants(removed_by) WHERE removed_by IS NOT NULL;

-- Refresh tokens table foreign keys
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_by ON refresh_tokens(revoked_by) WHERE revoked_by IS NOT NULL;

-- Index all tenant_id columns for efficient tenant isolation queries
-- This is critical for multi-tenant performance

-- Documents table (already has idx_documents_tenant_id, but ensure it exists)
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);

-- Audit logs table (already has idx_audit_logs_tenant_id, but ensure it exists)
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);

-- Additional composite indexes for common tenant queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_user ON audit_logs(tenant_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_resource ON audit_logs(tenant_id, resource_type, resource_id) WHERE resource_type IS NOT NULL;

-- Documents table composite indexes
CREATE INDEX IF NOT EXISTS idx_documents_tenant_status ON documents(tenant_id, status_cpo) WHERE status_cpo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tenant_created ON documents(tenant_id, created_at DESC);

-- Additional performance indexes for audit logs
-- These support common audit query patterns

-- Index for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_compliance ON audit_logs(tenant_id, compliance_flags) 
    WHERE compliance_flags IS NOT NULL AND array_length(compliance_flags, 1) > 0;

-- Index for event type queries within tenant
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_event_type ON audit_logs(tenant_id, event_type);

-- Index for event category queries within tenant
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_category ON audit_logs(tenant_id, event_category);

-- Index for success/failure queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_success ON audit_logs(tenant_id, success, created_at DESC) WHERE success = false;

-- Index for time-range queries (common in audit reports)
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time_range ON audit_logs(tenant_id, created_at DESC, event_category);

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE roles;
ANALYZE permissions;
ANALYZE user_roles;
ANALYZE role_permissions;
ANALYZE user_permissions;
ANALYZE processes;
ANALYZE process_participants;
ANALYZE refresh_tokens;
ANALYZE documents;
ANALYZE audit_logs;

-- ============================================
-- Business Rule Triggers
-- ============================================

-- 1. Bid Risk Gate: block bids when risk_score >= 70
CREATE OR REPLACE FUNCTION check_bid_risk_gate()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.risk_score IS NOT NULL AND NEW.risk_score >= 70 THEN
        RAISE EXCEPTION 'Bid blocked: risk_score % is >= 70. Manual override required.', NEW.risk_score;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bid_risk_gate
    BEFORE INSERT OR UPDATE ON auction_assets
    FOR EACH ROW EXECUTE FUNCTION check_bid_risk_gate();

-- 2. Real Estate State Transitions: block SOLD without passing through REGULARIZATION
CREATE OR REPLACE FUNCTION check_real_estate_state_transition()
RETURNS TRIGGER AS $$
DECLARE
    has_regularization BOOLEAN;
BEGIN
    -- Only check when state changes to SOLD
    IF NEW.current_state = 'SOLD' AND (OLD.current_state IS NULL OR OLD.current_state != 'SOLD') THEN
        -- Verify the asset went through REGULARIZATION at some point
        SELECT EXISTS(
            SELECT 1 FROM asset_state_transitions
            WHERE real_estate_asset_id = NEW.id
              AND to_state = 'REGULARIZATION'
              AND is_valid = true
        ) INTO has_regularization;

        IF NOT has_regularization AND OLD.current_state != 'REGULARIZATION' THEN
            RAISE EXCEPTION 'Cannot transition to SOLD: asset % has not completed REGULARIZATION stage.', NEW.asset_code;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_real_estate_state_transition
    BEFORE UPDATE ON real_estate_assets
    FOR EACH ROW EXECUTE FUNCTION check_real_estate_state_transition();

-- 3. Auto risk score recalculation trigger (sets risk_score based on bid data)
CREATE OR REPLACE FUNCTION auto_recalculate_risk_score()
RETURNS TRIGGER AS $$
DECLARE
    calculated_risk INTEGER;
BEGIN
    -- Simple risk heuristic: combine appraisal gap + debt ratio into 0-100 score
    calculated_risk := 0;

    -- If minimum_bid exceeds appraisal value, increase risk
    IF NEW.minimum_bid_cents IS NOT NULL AND NEW.appraisal_value_cents IS NOT NULL
       AND NEW.appraisal_value_cents > 0 THEN
        calculated_risk := calculated_risk +
            LEAST(50, GREATEST(0,
                ((NEW.minimum_bid_cents - NEW.appraisal_value_cents)::float
                 / NEW.appraisal_value_cents * 100)::integer
            ));
    END IF;

    -- If there are outstanding debts, add to risk
    IF NEW.total_debt_cents IS NOT NULL AND NEW.appraisal_value_cents IS NOT NULL
       AND NEW.appraisal_value_cents > 0 THEN
        calculated_risk := calculated_risk +
            LEAST(50, GREATEST(0,
                (NEW.total_debt_cents::float / NEW.appraisal_value_cents * 100)::integer
            ));
    END IF;

    NEW.risk_score := LEAST(100, calculated_risk);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_risk_score
    BEFORE INSERT OR UPDATE ON auction_assets
    FOR EACH ROW EXECUTE FUNCTION auto_recalculate_risk_score();

-- 4. Advisory lock in SHA-256 hash function for gate_decisions integrity chain
--    Prevents concurrent inserts from producing duplicate or out-of-order hashes
CREATE OR REPLACE FUNCTION calculate_gate_decision_hash(
    p_previous_hash VARCHAR(64),
    p_decision_data JSONB,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS VARCHAR(64) AS $$
DECLARE
    hash_input TEXT;
BEGIN
    -- Acquire advisory lock scoped to gate_decisions hash chain (lock id = 913013)
    PERFORM pg_advisory_xact_lock(913013);

    hash_input := COALESCE(p_previous_hash, '') || '|' ||
                  COALESCE(p_decision_data::TEXT, '') || '|' ||
                  COALESCE(p_created_at::TEXT, '');
    RETURN encode(digest(hash_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;
