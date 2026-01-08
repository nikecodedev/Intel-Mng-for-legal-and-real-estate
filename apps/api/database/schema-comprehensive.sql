-- ============================================
-- COMPREHENSIVE POSTGRESQL SCHEMA
-- Enterprise-grade schema for compliance and traceability
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For cryptographic functions

-- ============================================
-- USERS TABLE
-- ============================================
-- Stores user accounts with comprehensive profile and security information
-- Supports soft deletes for data retention compliance
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'en-US',
    
    -- Security flags
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    is_phone_verified BOOLEAN DEFAULT false,
    requires_password_change BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_password_change_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    
    -- Compliance fields
    accepted_terms_version VARCHAR(50),
    accepted_terms_at TIMESTAMP WITH TIME ZONE,
    privacy_policy_version VARCHAR(50),
    privacy_policy_accepted_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT failed_attempts_range CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 10)
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(is_active, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_activity ON users(last_activity_at) WHERE deleted_at IS NULL;

-- ============================================
-- ROLES TABLE
-- ============================================
-- Defines organizational roles with hierarchical support
-- System roles cannot be deleted for compliance
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200),
    description TEXT,
    
    -- Role hierarchy (self-referencing for parent roles)
    parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    
    -- Classification
    is_system_role BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false, -- Default role for new users
    priority INTEGER DEFAULT 0, -- For role precedence
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT system_role_protection CHECK (
        (is_system_role = false) OR (deleted_at IS NULL)
    )
);

-- Indexes for roles
CREATE INDEX idx_roles_name ON roles(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_roles_parent ON roles(parent_role_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_roles_system ON roles(is_system_role) WHERE deleted_at IS NULL;
CREATE INDEX idx_roles_default ON roles(is_default) WHERE deleted_at IS NULL;

-- ============================================
-- PERMISSIONS TABLE
-- ============================================
-- Fine-grained permissions using resource:action format
-- Supports hierarchical resources (e.g., documents.legal.contracts)
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) UNIQUE NOT NULL, -- e.g., "users:create", "documents.legal:read"
    resource VARCHAR(100) NOT NULL, -- e.g., "users", "documents.legal"
    action VARCHAR(50) NOT NULL, -- e.g., "create", "read", "update", "delete", "export"
    description TEXT,
    
    -- Classification
    category VARCHAR(100), -- e.g., "user_management", "document_management"
    is_system_permission BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT permission_name_format CHECK (name ~ '^[a-z0-9._-]+:[a-z0-9._-]+$')
);

-- Indexes for permissions
CREATE INDEX idx_permissions_name ON permissions(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_permissions_resource ON permissions(resource) WHERE deleted_at IS NULL;
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action) WHERE deleted_at IS NULL;
CREATE INDEX idx_permissions_category ON permissions(category) WHERE deleted_at IS NULL;

-- ============================================
-- USER_ROLES TABLE
-- ============================================
-- Many-to-many relationship between users and roles
-- Tracks assignment history for compliance
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    
    -- Assignment metadata
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    
    -- Constraints
    UNIQUE(user_id, role_id, assigned_at),
    CONSTRAINT valid_expiration CHECK (expires_at IS NULL OR expires_at > assigned_at)
);

-- Indexes for user_roles
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_roles_active ON user_roles(user_id, role_id) 
    WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
CREATE INDEX idx_user_roles_expires ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- ROLE_PERMISSIONS TABLE
-- ============================================
-- Many-to-many relationship between roles and permissions
-- Tracks permission grants for audit
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    
    -- Grant metadata
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    granted_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    
    -- Constraints
    UNIQUE(role_id, permission_id, granted_at)
);

-- Indexes for role_permissions
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_role_permissions_active ON role_permissions(role_id, permission_id) 
    WHERE revoked_at IS NULL;

-- ============================================
-- USER_PERMISSIONS TABLE
-- ============================================
-- Direct user permissions (bypassing roles)
-- Useful for temporary or exceptional access
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    
    -- Grant metadata
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    justification TEXT, -- Why this direct permission was granted
    
    -- Constraints
    UNIQUE(user_id, permission_id, granted_at),
    CONSTRAINT valid_expiration CHECK (expires_at IS NULL OR expires_at > granted_at)
);

-- Indexes for user_permissions
CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id) 
    WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
CREATE INDEX idx_user_permissions_permission_id ON user_permissions(permission_id) 
    WHERE revoked_at IS NULL;
CREATE INDEX idx_user_permissions_expires ON user_permissions(expires_at) 
    WHERE expires_at IS NOT NULL;

-- ============================================
-- PROCESSES TABLE (Generic Workflow Container)
-- ============================================
-- Generic entity for workflows, cases, documents, transactions, etc.
-- Flexible schema to accommodate various business processes
CREATE TABLE processes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Process identification
    process_type VARCHAR(100) NOT NULL, -- e.g., "legal_case", "real_estate_transaction", "document_review"
    process_number VARCHAR(100) UNIQUE, -- Human-readable process identifier
    title VARCHAR(500),
    description TEXT,
    
    -- Status and state
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- e.g., "draft", "in_progress", "completed", "cancelled"
    priority VARCHAR(20) DEFAULT 'normal', -- "low", "normal", "high", "urgent"
    stage VARCHAR(100), -- Current workflow stage
    
    -- Ownership and assignment
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
    team_id UUID, -- Future: reference to teams table
    
    -- Relationships
    parent_process_id UUID REFERENCES processes(id) ON DELETE SET NULL, -- For sub-processes
    related_process_ids UUID[], -- Array of related process IDs
    
    -- Dates and deadlines
    started_at TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Flexible metadata (JSONB for extensibility)
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[],
    
    -- Compliance
    confidentiality_level VARCHAR(20) DEFAULT 'internal', -- "public", "internal", "confidential", "restricted"
    retention_policy VARCHAR(100),
    retention_until TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('draft', 'in_progress', 'pending', 'completed', 'cancelled', 'archived')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT valid_confidentiality CHECK (confidentiality_level IN ('public', 'internal', 'confidential', 'restricted'))
);

-- Indexes for processes
CREATE INDEX idx_processes_type ON processes(process_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_number ON processes(process_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_status ON processes(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_owner ON processes(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_assigned ON processes(assigned_to_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_parent ON processes(parent_process_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_due_date ON processes(due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX idx_processes_created_at ON processes(created_at);
CREATE INDEX idx_processes_metadata ON processes USING GIN(metadata) WHERE deleted_at IS NULL;
CREATE INDEX idx_processes_tags ON processes USING GIN(tags) WHERE deleted_at IS NULL;

-- ============================================
-- PROCESS_PARTICIPANTS TABLE
-- ============================================
-- Tracks who is involved in a process and their role
CREATE TABLE process_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Participant role in the process
    role VARCHAR(50) NOT NULL, -- e.g., "owner", "assignee", "reviewer", "approver", "observer"
    permissions TEXT[], -- Specific permissions for this participant
    
    -- Assignment metadata
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_by UUID REFERENCES users(id),
    removed_at TIMESTAMP WITH TIME ZONE,
    removed_by UUID REFERENCES users(id),
    
    -- Constraints
    UNIQUE(process_id, user_id, role, assigned_at)
);

-- Indexes for process_participants
CREATE INDEX idx_process_participants_process ON process_participants(process_id) WHERE removed_at IS NULL;
CREATE INDEX idx_process_participants_user ON process_participants(user_id) WHERE removed_at IS NULL;
CREATE INDEX idx_process_participants_role ON process_participants(role) WHERE removed_at IS NULL;

-- ============================================
-- AUDIT_LOGS TABLE (IMMUTABLE)
-- ============================================
-- Append-only audit log for compliance and traceability
-- Immutable by design - no UPDATE or DELETE allowed
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event identification
    event_type VARCHAR(100) NOT NULL, -- e.g., "user.login", "document.create", "permission.grant"
    event_category VARCHAR(50) NOT NULL, -- "authentication", "authorization", "data_access", "data_modification", "system"
    action VARCHAR(50) NOT NULL, -- "create", "read", "update", "delete", "login", "logout", "grant", "revoke"
    
    -- Actor information
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL for system events
    user_email VARCHAR(255), -- Denormalized for historical accuracy
    user_role VARCHAR(100), -- Role at time of event
    
    -- Resource information
    resource_type VARCHAR(100), -- e.g., "user", "document", "process", "role"
    resource_id UUID, -- ID of the affected resource
    resource_identifier VARCHAR(500), -- Human-readable identifier
    
    -- Event details
    description TEXT,
    details JSONB DEFAULT '{}'::jsonb, -- Flexible event-specific data
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100), -- For request tracing
    session_id VARCHAR(100),
    
    -- Outcome
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Compliance fields
    compliance_flags TEXT[], -- e.g., "gdpr", "hipaa", "sox"
    retention_category VARCHAR(50), -- For retention policy application
    
    -- Timestamp (immutable)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_event_category CHECK (
        event_category IN ('authentication', 'authorization', 'data_access', 'data_modification', 'system', 'compliance')
    ),
    CONSTRAINT valid_action CHECK (
        action IN ('create', 'read', 'update', 'delete', 'login', 'logout', 'grant', 'revoke', 'export', 'import', 'approve', 'reject')
    )
);

-- Indexes for audit_logs (optimized for common queries)
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_event_category ON audit_logs(event_category);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_compliance ON audit_logs(compliance_flags) WHERE compliance_flags IS NOT NULL;
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id) WHERE session_id IS NOT NULL;

-- Composite index for common audit queries
CREATE INDEX idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource_time ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_category_time ON audit_logs(event_category, created_at DESC);

-- JSONB index for details field
CREATE INDEX idx_audit_logs_details ON audit_logs USING GIN(details);

-- ============================================
-- REFRESH_TOKENS TABLE
-- ============================================
-- JWT refresh token management with audit trail
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    
    -- Token metadata
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Revocation
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    
    -- Request context
    user_agent TEXT,
    ip_address INET,
    device_fingerprint VARCHAR(255),
    
    -- Constraints
    CONSTRAINT valid_expiration CHECK (expires_at > created_at)
);

-- Indexes for refresh_tokens
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(token, expires_at) 
    WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP;

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to prevent updates/deletes on audit_logs (immutability)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. Updates and deletes are not allowed.';
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at 
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at 
    BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processes_updated_at 
    BEFORE UPDATE ON processes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to prevent audit log modifications
CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER prevent_audit_log_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View: Active user permissions (from roles + direct)
CREATE OR REPLACE VIEW user_active_permissions AS
SELECT DISTINCT
    u.id AS user_id,
    u.email,
    p.id AS permission_id,
    p.name AS permission_name,
    p.resource,
    p.action,
    'role' AS source,
    r.name AS role_name
FROM users u
INNER JOIN user_roles ur ON u.id = ur.user_id
INNER JOIN roles r ON ur.role_id = r.id
INNER JOIN role_permissions rp ON r.id = rp.role_id
INNER JOIN permissions p ON rp.permission_id = p.id
WHERE u.deleted_at IS NULL
    AND r.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND ur.revoked_at IS NULL
    AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    AND rp.revoked_at IS NULL
UNION ALL
SELECT DISTINCT
    u.id AS user_id,
    u.email,
    p.id AS permission_id,
    p.name AS permission_name,
    p.resource,
    p.action,
    'direct' AS source,
    NULL AS role_name
FROM users u
INNER JOIN user_permissions up ON u.id = up.user_id
INNER JOIN permissions p ON up.permission_id = p.id
WHERE u.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND up.revoked_at IS NULL
    AND (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP);

-- View: Process summary with participant count
CREATE OR REPLACE VIEW process_summary AS
SELECT 
    p.id,
    p.process_type,
    p.process_number,
    p.title,
    p.status,
    p.priority,
    p.owner_id,
    p.assigned_to_id,
    p.due_date,
    p.created_at,
    COUNT(DISTINCT pp.user_id) FILTER (WHERE pp.removed_at IS NULL) AS participant_count
FROM processes p
LEFT JOIN process_participants pp ON p.id = pp.process_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.process_type, p.process_number, p.title, p.status, p.priority, 
         p.owner_id, p.assigned_to_id, p.due_date, p.created_at;

-- ============================================
-- ROW LEVEL SECURITY (Optional - for multi-tenancy)
-- ============================================
-- Uncomment and configure if multi-tenancy is required

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE users IS 'User accounts with security and compliance metadata';
COMMENT ON TABLE roles IS 'Organizational roles with hierarchical support';
COMMENT ON TABLE permissions IS 'Fine-grained permissions using resource:action format';
COMMENT ON TABLE user_roles IS 'User-role assignments with expiration and revocation tracking';
COMMENT ON TABLE role_permissions IS 'Role-permission grants with audit trail';
COMMENT ON TABLE user_permissions IS 'Direct user permissions (bypassing roles) with expiration';
COMMENT ON TABLE processes IS 'Generic workflow container for cases, transactions, documents, etc.';
COMMENT ON TABLE process_participants IS 'Tracks participants and their roles in processes';
COMMENT ON TABLE audit_logs IS 'Immutable append-only audit log for compliance and traceability';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh token management with revocation support';

COMMENT ON COLUMN audit_logs.id IS 'Immutable UUID - never changes';
COMMENT ON COLUMN audit_logs.created_at IS 'Immutable timestamp - never changes';
COMMENT ON COLUMN processes.metadata IS 'JSONB field for flexible process-specific data';
COMMENT ON COLUMN audit_logs.details IS 'JSONB field for flexible event-specific data';

