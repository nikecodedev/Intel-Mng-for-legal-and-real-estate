-- ============================================
-- MIGRATION: 002_tenant_isolation.sql
-- PURPOSE: Enforce full tenant isolation across RBAC tables
-- DATE: 2026-02-01
-- ============================================
-- 
-- OVERVIEW:
-- This migration adds tenant_id to all RBAC-related tables to enforce
-- multi-tenant data isolation at the database level.
--
-- DESIGN DECISIONS:
--
-- 1. SYSTEM ENTITIES (is_system_role=true, is_system_permission=true):
--    - tenant_id is NULLABLE for system entities
--    - System roles/permissions are shared across ALL tenants
--    - CHECK constraints enforce: non-system entities MUST have tenant_id
--
-- 2. PERMISSIONS TABLE:
--    - Permissions remain GLOBAL (no tenant_id required)
--    - Permissions define capabilities, not ownership
--    - All tenants share the same permission definitions
--
-- 3. UNIQUE CONSTRAINTS:
--    - users: UNIQUE(tenant_id, email) - same email can exist in different tenants
--    - roles: UNIQUE(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), name)
--      This allows system roles (NULL tenant_id) to have unique names globally
--
-- 4. FOREIGN KEYS:
--    - All tenant_id columns reference tenants(id)
--    - ON DELETE CASCADE ensures cleanup when tenant is deleted
--
-- 5. JUNCTION TABLES (user_roles, role_permissions, user_permissions):
--    - Inherit tenant_id from parent entities
--    - Enables efficient tenant-scoped queries
--
-- ASSUMPTIONS:
-- - tenants table already exists with id as primary key
-- - Existing data (if any) needs a default tenant for migration
-- - System roles seeded via seed.sql have is_system_role=true
--
-- ============================================

-- Start transaction
BEGIN;

-- ============================================
-- STEP 1: Create a system/default tenant (if not exists)
-- This tenant owns system entities during migration
-- ============================================
INSERT INTO tenants (id, name, status, config_hard_gates)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'System Tenant',
    'ACTIVE',
    '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STEP 2: ADD tenant_id TO USERS TABLE
-- ============================================

-- Add column (nullable initially for migration)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Update existing users to system tenant (if any exist)
UPDATE users 
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE users 
ALTER COLUMN tenant_id SET NOT NULL;

-- Add foreign key
ALTER TABLE users 
ADD CONSTRAINT fk_users_tenant 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Drop old unique constraint on email
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS users_email_key;

-- Add composite unique constraint (tenant_id, email)
ALTER TABLE users 
ADD CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email);

-- Add index for tenant queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_id 
ON users(tenant_id) WHERE deleted_at IS NULL;

-- Add composite index for common lookups
CREATE INDEX IF NOT EXISTS idx_users_tenant_email 
ON users(tenant_id, email) WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.tenant_id IS 'Tenant isolation key - users belong to exactly one tenant';


-- ============================================
-- STEP 3: ADD tenant_id TO ROLES TABLE
-- ============================================

-- Add column (nullable for system roles)
ALTER TABLE roles 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Update existing non-system roles to system tenant
UPDATE roles 
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL AND is_system_role = false;

-- System roles remain with NULL tenant_id (global)
-- Add foreign key (allows NULL for system roles)
ALTER TABLE roles 
ADD CONSTRAINT fk_roles_tenant 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Drop old unique constraint on name
ALTER TABLE roles 
DROP CONSTRAINT IF EXISTS roles_name_key;

-- Add partial unique constraint for tenant-scoped roles
-- System roles (tenant_id IS NULL) must be unique by name globally
-- Tenant roles must be unique within tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_tenant_name 
ON roles(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), name) 
WHERE deleted_at IS NULL;

-- Add check constraint: non-system roles MUST have tenant_id
ALTER TABLE roles 
ADD CONSTRAINT chk_roles_tenant_required 
CHECK (is_system_role = true OR tenant_id IS NOT NULL);

-- Add index for tenant queries
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id 
ON roles(tenant_id) WHERE deleted_at IS NULL;

-- Add composite index for lookups
CREATE INDEX IF NOT EXISTS idx_roles_tenant_name 
ON roles(tenant_id, name) WHERE deleted_at IS NULL;

COMMENT ON COLUMN roles.tenant_id IS 'Tenant isolation key - NULL for system roles (shared globally)';


-- ============================================
-- STEP 4: PERMISSIONS TABLE - KEEP GLOBAL
-- ============================================
-- Permissions remain global by design.
-- All tenants share the same permission definitions.
-- This is intentional: permissions define capabilities, not ownership.
--
-- If tenant-specific permissions are needed in the future:
-- ALTER TABLE permissions ADD COLUMN tenant_id UUID REFERENCES tenants(id);

COMMENT ON TABLE permissions IS 'Global permission definitions shared across all tenants';


-- ============================================
-- STEP 5: ADD tenant_id TO USER_ROLES TABLE
-- ============================================

-- Add column (nullable initially)
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Populate from user's tenant_id
UPDATE user_roles ur
SET tenant_id = u.tenant_id
FROM users u
WHERE ur.user_id = u.id AND ur.tenant_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE user_roles 
ALTER COLUMN tenant_id SET NOT NULL;

-- Add foreign key
ALTER TABLE user_roles 
ADD CONSTRAINT fk_user_roles_tenant 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add index for tenant queries
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id 
ON user_roles(tenant_id);

-- Add composite index for common lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user 
ON user_roles(tenant_id, user_id);

COMMENT ON COLUMN user_roles.tenant_id IS 'Tenant isolation key - denormalized from users for query efficiency';


-- ============================================
-- STEP 6: ADD tenant_id TO ROLE_PERMISSIONS TABLE
-- ============================================

-- Add column (nullable initially)
ALTER TABLE role_permissions 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Populate from role's tenant_id (NULL for system roles)
UPDATE role_permissions rp
SET tenant_id = r.tenant_id
FROM roles r
WHERE rp.role_id = r.id AND rp.tenant_id IS NULL;

-- Note: tenant_id remains NULLABLE because system roles have NULL tenant_id
-- Add foreign key (allows NULL)
ALTER TABLE role_permissions 
ADD CONSTRAINT fk_role_permissions_tenant 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add index for tenant queries
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_id 
ON role_permissions(tenant_id);

-- Add composite index
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_role 
ON role_permissions(tenant_id, role_id);

COMMENT ON COLUMN role_permissions.tenant_id IS 'Tenant isolation key - NULL for system role permissions (global)';


-- ============================================
-- STEP 7: ADD tenant_id TO USER_PERMISSIONS TABLE
-- ============================================

-- Add column (nullable initially)
ALTER TABLE user_permissions 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Populate from user's tenant_id
UPDATE user_permissions up
SET tenant_id = u.tenant_id
FROM users u
WHERE up.user_id = u.id AND up.tenant_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE user_permissions 
ALTER COLUMN tenant_id SET NOT NULL;

-- Add foreign key
ALTER TABLE user_permissions 
ADD CONSTRAINT fk_user_permissions_tenant 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add index for tenant queries
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant_id 
ON user_permissions(tenant_id);

-- Add composite index
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant_user 
ON user_permissions(tenant_id, user_id);

COMMENT ON COLUMN user_permissions.tenant_id IS 'Tenant isolation key - denormalized from users for query efficiency';


-- ============================================
-- STEP 8: ADD tenant_id TO REFRESH_TOKENS TABLE
-- ============================================

-- Add column (nullable initially)
ALTER TABLE refresh_tokens 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Populate from user's tenant_id
UPDATE refresh_tokens rt
SET tenant_id = u.tenant_id
FROM users u
WHERE rt.user_id = u.id AND rt.tenant_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE refresh_tokens 
ALTER COLUMN tenant_id SET NOT NULL;

-- Add foreign key
ALTER TABLE refresh_tokens 
ADD CONSTRAINT fk_refresh_tokens_tenant 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add index for tenant queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_id 
ON refresh_tokens(tenant_id);

COMMENT ON COLUMN refresh_tokens.tenant_id IS 'Tenant isolation key - session tokens scoped to tenant';


-- ============================================
-- STEP 9: UPDATE VIEWS FOR TENANT ISOLATION
-- ============================================

-- Drop existing views (they need to be recreated with tenant_id)
DROP VIEW IF EXISTS user_all_permissions CASCADE;
DROP VIEW IF EXISTS user_direct_permissions CASCADE;
DROP VIEW IF EXISTS user_role_permissions CASCADE;
DROP VIEW IF EXISTS user_active_permissions CASCADE;

-- Recreate view: User permissions from roles (tenant-aware)
CREATE OR REPLACE VIEW user_role_permissions AS
SELECT DISTINCT
    u.tenant_id,
    u.id AS user_id,
    u.email,
    r.id AS role_id,
    r.name AS role_name,
    r.is_system_role,
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

-- Recreate view: User direct permissions (tenant-aware)
CREATE OR REPLACE VIEW user_direct_permissions AS
SELECT DISTINCT
    u.tenant_id,
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

-- Recreate view: All user permissions (roles + direct, tenant-aware)
CREATE OR REPLACE VIEW user_all_permissions AS
SELECT tenant_id, user_id, email, permission_id, permission_name, resource, action, 'role' AS source
FROM user_role_permissions
UNION ALL
SELECT tenant_id, user_id, email, permission_id, permission_name, resource, action, 'direct' AS source
FROM user_direct_permissions;

-- Alternative view with revocation support (if using comprehensive schema)
CREATE OR REPLACE VIEW user_active_permissions AS
SELECT DISTINCT
    u.tenant_id,
    u.id AS user_id,
    u.email,
    p.id AS permission_id,
    p.name AS permission_name,
    p.resource,
    p.action,
    'role' AS source,
    r.name AS role_name,
    r.is_system_role
FROM users u
INNER JOIN user_roles ur ON u.id = ur.user_id
INNER JOIN roles r ON ur.role_id = r.id
INNER JOIN role_permissions rp ON r.id = rp.role_id
INNER JOIN permissions p ON rp.permission_id = p.id
WHERE u.deleted_at IS NULL
    AND r.deleted_at IS NULL
    AND p.deleted_at IS NULL
    -- Handle revocation if columns exist (comprehensive schema)
    -- AND ur.revoked_at IS NULL
    -- AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    -- AND rp.revoked_at IS NULL
UNION ALL
SELECT DISTINCT
    u.tenant_id,
    u.id AS user_id,
    u.email,
    p.id AS permission_id,
    p.name AS permission_name,
    p.resource,
    p.action,
    'direct' AS source,
    NULL AS role_name,
    false AS is_system_role
FROM users u
INNER JOIN user_permissions up ON u.id = up.user_id
INNER JOIN permissions p ON up.permission_id = p.id
WHERE u.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP);
    -- AND up.revoked_at IS NULL


-- ============================================
-- STEP 10: ADD HELPER FUNCTION FOR TENANT QUERIES
-- ============================================

-- Function to get user permissions within a tenant
CREATE OR REPLACE FUNCTION get_user_permissions(
    p_user_id UUID,
    p_tenant_id UUID
) RETURNS TABLE (
    permission_id UUID,
    permission_name VARCHAR(200),
    resource VARCHAR(100),
    action VARCHAR(50),
    source VARCHAR(10)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uap.permission_id,
        uap.permission_name,
        uap.resource,
        uap.action,
        uap.source
    FROM user_all_permissions uap
    WHERE uap.user_id = p_user_id
      AND uap.tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_user_permissions(UUID, UUID) IS 'Get all permissions for a user within a specific tenant';


-- Function to check if user has permission in tenant
CREATE OR REPLACE FUNCTION user_has_permission(
    p_user_id UUID,
    p_tenant_id UUID,
    p_permission_name VARCHAR(200)
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM user_all_permissions uap
        WHERE uap.user_id = p_user_id
          AND uap.tenant_id = p_tenant_id
          AND uap.permission_name = p_permission_name
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_permission(UUID, UUID, VARCHAR) IS 'Check if user has specific permission within tenant';


-- ============================================
-- STEP 11: ADD COMMENTS AND DOCUMENTATION
-- ============================================

COMMENT ON TABLE users IS 'User accounts with tenant isolation - each user belongs to exactly one tenant';
COMMENT ON TABLE roles IS 'Roles with tenant isolation - system roles (is_system_role=true) are global, others are tenant-scoped';
COMMENT ON TABLE user_roles IS 'User-role assignments with tenant isolation for efficient queries';
COMMENT ON TABLE role_permissions IS 'Role-permission grants - inherits tenant from role (NULL for system roles)';
COMMENT ON TABLE user_permissions IS 'Direct user permissions with tenant isolation';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens scoped to tenant';

COMMENT ON VIEW user_role_permissions IS 'Tenant-aware view of permissions granted via roles';
COMMENT ON VIEW user_direct_permissions IS 'Tenant-aware view of directly assigned permissions';
COMMENT ON VIEW user_all_permissions IS 'Tenant-aware combined view of all user permissions (roles + direct)';
COMMENT ON VIEW user_active_permissions IS 'Tenant-aware view with system role indicator';


-- ============================================
-- MIGRATION COMPLETE
-- ============================================

COMMIT;

-- ============================================
-- ROLLBACK SCRIPT (run separately if needed)
-- ============================================
/*
BEGIN;

-- Drop new views
DROP VIEW IF EXISTS user_active_permissions CASCADE;
DROP VIEW IF EXISTS user_all_permissions CASCADE;
DROP VIEW IF EXISTS user_direct_permissions CASCADE;
DROP VIEW IF EXISTS user_role_permissions CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_user_permissions(UUID, UUID);
DROP FUNCTION IF EXISTS user_has_permission(UUID, UUID, VARCHAR);

-- Remove tenant_id from tables
ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS fk_refresh_tokens_tenant;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS fk_user_permissions_tenant;
ALTER TABLE user_permissions DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS fk_role_permissions_tenant;
ALTER TABLE role_permissions DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS fk_user_roles_tenant;
ALTER TABLE user_roles DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE roles DROP CONSTRAINT IF EXISTS chk_roles_tenant_required;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS fk_roles_tenant;
DROP INDEX IF EXISTS uq_roles_tenant_name;
ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name);
ALTER TABLE roles DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_tenant;
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_tenant_email;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;

-- Recreate original views (see schema.sql for definitions)

COMMIT;
*/
