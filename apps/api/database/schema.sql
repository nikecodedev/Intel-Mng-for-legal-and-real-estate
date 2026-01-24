-- Enterprise RBAC Database Schema
-- PostgreSQL database schema for users, roles, and permissions

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TENANTS TABLE
-- ============================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- RN-SAA-02
    config_hard_gates JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- ============================================
-- DOCUMENTS TABLE (CPO OCR/DPI)
-- ============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    file_hash_sha256 VARCHAR(64) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    ocr_confidence FLOAT NOT NULL,
    dpi_resolution INT NOT NULL,
    status_cpo VARCHAR(20) CHECK (status_cpo IN ('VERDE', 'AMARELO', 'VERMELHO')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_status_cpo ON documents(status_cpo) WHERE status_cpo IS NOT NULL;
CREATE INDEX idx_documents_created_at ON documents(created_at);

-- ============================================
-- ROLES TABLE
-- ============================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false, -- System roles cannot be deleted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_active ON roles(id) WHERE deleted_at IS NULL;

-- ============================================
-- PERMISSIONS TABLE
-- ============================================
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., "users:create", "documents:read", "reports:export"
    resource VARCHAR(100) NOT NULL, -- e.g., "users", "documents", "reports"
    action VARCHAR(50) NOT NULL, -- e.g., "create", "read", "update", "delete", "export"
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_permissions_name ON permissions(name);
CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
CREATE INDEX idx_permissions_active ON permissions(id) WHERE deleted_at IS NULL;

-- ============================================
-- USER_ROLES TABLE (Many-to-Many)
-- ============================================
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- ============================================
-- ROLE_PERMISSIONS TABLE (Many-to-Many)
-- ============================================
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ============================================
-- USER_PERMISSIONS TABLE (Direct user permissions - optional)
-- Allows granting permissions directly to users, bypassing roles
-- ============================================
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    UNIQUE(user_id, permission_id)
);

CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission_id ON user_permissions(permission_id);
CREATE INDEX idx_user_permissions_expires ON user_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- REFRESH TOKENS TABLE
-- For JWT refresh token management
-- ============================================
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    user_agent TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(token, expires_at) 
    WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP;

-- ============================================
-- AUDIT LOG TABLE (for future audit logging)
-- ============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL, -- e.g., "user.login", "document.create", "role.assign"
    resource_type VARCHAR(100), -- e.g., "user", "document", "role"
    resource_id UUID,
    target_resource_id UUID,
    payload_evento JSONB DEFAULT '{}'::jsonb NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT current_hash_format CHECK (current_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT previous_hash_format CHECK (previous_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_current_hash ON audit_logs(current_hash);
CREATE INDEX idx_audit_logs_previous_hash ON audit_logs(previous_hash);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate audit hash (SHA-256)
CREATE OR REPLACE FUNCTION calculate_audit_log_hash(
    p_previous_hash VARCHAR(64),
    p_payload_evento JSONB,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS VARCHAR(64) AS $$
DECLARE
    hash_input TEXT;
BEGIN
    hash_input := COALESCE(p_previous_hash, '') || '|' ||
                  COALESCE(p_payload_evento::TEXT, '') || '|' ||
                  COALESCE(p_created_at::TEXT, '');
    RETURN encode(digest(hash_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to set previous_hash/current_hash
CREATE OR REPLACE FUNCTION set_audit_log_hash()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash_value VARCHAR(64);
BEGIN
    IF NEW.payload_evento IS NULL THEN
        NEW.payload_evento := COALESCE(NEW.details, '{}'::jsonb);
    END IF;

    IF NEW.created_at IS NULL THEN
        NEW.created_at := CURRENT_TIMESTAMP;
    END IF;

    SELECT current_hash INTO prev_hash_value
    FROM audit_logs
    WHERE tenant_id = NEW.tenant_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    NEW.previous_hash := COALESCE(prev_hash_value, encode(digest('GENESIS', 'sha256'), 'hex'));
    NEW.current_hash := calculate_audit_log_hash(
        NEW.previous_hash,
        NEW.payload_evento,
        NEW.created_at
    );

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
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit log hash chain trigger
CREATE TRIGGER set_audit_log_hash_trigger BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION set_audit_log_hash();

-- Prevent audit log modifications
CREATE TRIGGER prevent_audit_log_update BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER prevent_audit_log_delete BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ============================================
-- VIEWS (for easier querying)
-- ============================================

-- View: User roles with permissions
CREATE OR REPLACE VIEW user_role_permissions AS
SELECT DISTINCT
    u.id AS user_id,
    u.email,
    r.id AS role_id,
    r.name AS role_name,
    p.id AS permission_id,
    p.name AS permission_name,
    p.resource,
    p.action
FROM users u
INNER JOIN user_roles ur ON u.id = ur.user_id
INNER JOIN roles r ON ur.role_id = r.id
INNER JOIN role_permissions rp ON r.id = rp.role_id
INNER JOIN permissions p ON rp.permission_id = p.id
WHERE u.deleted_at IS NULL
    AND r.deleted_at IS NULL
    AND p.deleted_at IS NULL;

-- View: User direct permissions
CREATE OR REPLACE VIEW user_direct_permissions AS
SELECT DISTINCT
    u.id AS user_id,
    u.email,
    p.id AS permission_id,
    p.name AS permission_name,
    p.resource,
    p.action,
    up.expires_at
FROM users u
INNER JOIN user_permissions up ON u.id = up.user_id
INNER JOIN permissions p ON up.permission_id = p.id
WHERE u.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP);

-- View: All user permissions (roles + direct)
CREATE OR REPLACE VIEW user_all_permissions AS
SELECT user_id, email, permission_id, permission_name, resource, action, 'role' AS source
FROM user_role_permissions
UNION ALL
SELECT user_id, email, permission_id, permission_name, resource, action, 'direct' AS source
FROM user_direct_permissions;


