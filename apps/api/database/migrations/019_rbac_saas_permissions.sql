-- Migration: 019_rbac_saas_permissions.sql
-- PURPOSE: Seed all SaaS-specific permissions and roles for production use.
-- Idempotent: uses WHERE NOT EXISTS for roles, ON CONFLICT DO NOTHING for permissions/role_permissions.

-- ============================================
-- PERMISSIONS: Base RBAC (from seed.sql equivalent)
-- ============================================

INSERT INTO permissions (name, resource, action, description) VALUES
('users:create', 'users', 'create', 'Create new users'),
('users:read', 'users', 'read', 'View users'),
('users:update', 'users', 'update', 'Update user information'),
('users:delete', 'users', 'delete', 'Delete users'),
('users:list', 'users', 'list', 'List all users'),
('users:assign-role', 'users', 'assign-role', 'Assign roles to users')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('roles:create', 'roles', 'create', 'Create new roles'),
('roles:read', 'roles', 'read', 'View roles'),
('roles:update', 'roles', 'update', 'Update role information'),
('roles:delete', 'roles', 'delete', 'Delete roles'),
('roles:list', 'roles', 'list', 'List all roles'),
('roles:assign-permission', 'roles', 'assign-permission', 'Assign permissions to roles')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('permissions:create', 'permissions', 'create', 'Create new permissions'),
('permissions:read', 'permissions', 'read', 'View permissions'),
('permissions:list', 'permissions', 'list', 'List all permissions')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('documents:create', 'documents', 'create', 'Create documents'),
('documents:read', 'documents', 'read', 'View documents'),
('documents:update', 'documents', 'update', 'Update documents'),
('documents:delete', 'documents', 'delete', 'Delete documents'),
('documents:list', 'documents', 'list', 'List documents'),
('documents:export', 'documents', 'export', 'Export documents')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('reports:read', 'reports', 'read', 'View reports'),
('reports:generate', 'reports', 'generate', 'Generate reports'),
('reports:export', 'reports', 'export', 'Export reports')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('audit:read', 'audit', 'read', 'View audit logs'),
('audit:list', 'audit', 'list', 'List audit logs')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- PERMISSIONS: SaaS-Specific Modules
-- ============================================

INSERT INTO permissions (name, resource, action, description) VALUES
('dashboards:read', 'dashboards', 'read', 'View dashboards'),
('dashboards:create', 'dashboards', 'create', 'Create dashboards'),
('dashboards:update', 'dashboards', 'update', 'Update dashboards'),
('dashboards:list', 'dashboards', 'list', 'List dashboards')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('auctions:create', 'auctions', 'create', 'Create auction assets'),
('auctions:read', 'auctions', 'read', 'View auction assets'),
('auctions:update', 'auctions', 'update', 'Update auction assets'),
('auctions:list', 'auctions', 'list', 'List auction assets'),
('auctions:bid', 'auctions', 'bid', 'Place bids on auctions'),
('auctions:delete', 'auctions', 'delete', 'Delete auction assets')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('assets:create', 'assets', 'create', 'Create real estate assets'),
('assets:read', 'assets', 'read', 'View real estate assets'),
('assets:update', 'assets', 'update', 'Update real estate assets'),
('assets:list', 'assets', 'list', 'List real estate assets'),
('assets:delete', 'assets', 'delete', 'Delete real estate assets')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('finance:create', 'finance', 'create', 'Create financial records'),
('finance:read', 'finance', 'read', 'View financial records'),
('finance:update', 'finance', 'update', 'Update financial records'),
('finance:list', 'finance', 'list', 'List financial records'),
('finance:delete', 'finance', 'delete', 'Delete financial records'),
('finance:import', 'finance', 'import', 'Import financial data'),
('finance:export', 'finance', 'export', 'Export financial data')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('crm:create', 'crm', 'create', 'Create CRM records'),
('crm:read', 'crm', 'read', 'View CRM records'),
('crm:update', 'crm', 'update', 'Update CRM records'),
('crm:list', 'crm', 'list', 'List CRM records'),
('crm:delete', 'crm', 'delete', 'Delete CRM records')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('knowledge:create', 'knowledge', 'create', 'Create knowledge entries'),
('knowledge:read', 'knowledge', 'read', 'View knowledge entries'),
('knowledge:update', 'knowledge', 'update', 'Update knowledge entries'),
('knowledge:list', 'knowledge', 'list', 'List knowledge entries'),
('knowledge:delete', 'knowledge', 'delete', 'Delete knowledge entries')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('workflow:read', 'workflow', 'read', 'View workflows'),
('workflow:update', 'workflow', 'update', 'Update workflows'),
('workflow:emit', 'workflow', 'emit', 'Emit workflow events'),
('workflow:create', 'workflow', 'create', 'Create workflows')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('intelligence:read', 'intelligence', 'read', 'View intelligence data'),
('intelligence:list', 'intelligence', 'list', 'List intelligence data'),
('intelligence:create', 'intelligence', 'create', 'Create intelligence entries')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('matching:read', 'matching', 'read', 'View matching data'),
('matching:update', 'matching', 'update', 'Update matching data'),
('matching:list', 'matching', 'list', 'List matching data')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('quality_gates:create', 'quality_gates', 'create', 'Create quality gates'),
('quality_gates:read', 'quality_gates', 'read', 'View quality gates'),
('quality_gates:update', 'quality_gates', 'update', 'Update quality gates'),
('quality_gates:list', 'quality_gates', 'list', 'List quality gates')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('metrics:read', 'metrics', 'read', 'View metrics'),
('metrics:list', 'metrics', 'list', 'List metrics')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('super_admin:dashboard', 'super_admin', 'dashboard', 'Access super admin dashboard'),
('super_admin:read', 'super_admin', 'read', 'Super admin read access'),
('super_admin:provision', 'super_admin', 'provision', 'Provision new tenants'),
('super_admin:update', 'super_admin', 'update', 'Super admin update'),
('super_admin:suspend', 'super_admin', 'suspend', 'Suspend tenants'),
('super_admin:reactivate', 'super_admin', 'reactivate', 'Reactivate tenants')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, resource, action, description) VALUES
('investor:read', 'investor', 'read', 'View investor data'),
('investor:list', 'investor', 'list', 'List investor data')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- ROLES: System roles (is_system_role=true allows NULL tenant_id)
-- Use WHERE NOT EXISTS because the unique index is on expression, not plain column
-- ============================================

INSERT INTO roles (name, description, is_system_role)
SELECT 'super_admin', 'Super Administrator with all permissions', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'super_admin');

INSERT INTO roles (name, description, is_system_role)
SELECT 'OWNER', 'Tenant owner with full access to all resources', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'OWNER');

INSERT INTO roles (name, description, is_system_role)
SELECT 'REVISOR', 'Reviewer role with read and review access', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'REVISOR');

INSERT INTO roles (name, description, is_system_role)
SELECT 'OPERATIONAL', 'Operational role for day-to-day business tasks', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'OPERATIONAL');

INSERT INTO roles (name, description, is_system_role)
SELECT 'INVESTOR', 'Read-only investor portal access', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'INVESTOR');

-- ============================================
-- ROLE_PERMISSIONS: Grant permissions to roles
-- ============================================

-- super_admin gets ALL permissions (system bypass also applies but explicit grant is good practice)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- OWNER gets ALL permissions (full tenant control)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'OWNER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- REVISOR gets read-only permissions on all business resources
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'REVISOR'
  AND p.action IN ('read', 'list')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- OPERATIONAL gets full CRUD on business resources (not admin/super_admin)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'OPERATIONAL'
  AND p.resource IN (
    'documents', 'auctions', 'assets', 'finance', 'crm',
    'knowledge', 'workflow', 'intelligence', 'matching',
    'quality_gates', 'dashboards', 'reports', 'metrics'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- INVESTOR gets read-only on investor-relevant resources
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'INVESTOR'
  AND p.resource IN ('investor', 'assets', 'auctions', 'dashboards')
  AND p.action IN ('read', 'list')
ON CONFLICT (role_id, permission_id) DO NOTHING;
