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
