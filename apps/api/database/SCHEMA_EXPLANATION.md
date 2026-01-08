# PostgreSQL Schema Explanation

## Overview

This comprehensive schema is designed for enterprise applications requiring heavy compliance, traceability, and audit capabilities. All tables use UUIDs for primary keys and support soft deletes for data retention compliance.

## Table Descriptions

### 1. `users` - User Accounts

**Purpose:** Stores user accounts with comprehensive security and compliance metadata.

**Key Features:**
- Email-based authentication with password hashing
- Security flags (active, verified, locked accounts)
- Failed login attempt tracking
- Terms of service and privacy policy acceptance tracking
- Soft delete with audit trail (deleted_by, deleted_at)

**Compliance Features:**
- Terms version tracking
- Privacy policy version tracking
- Last activity timestamp
- Account lockout mechanism

**Indexes:**
- Email lookup (active users only)
- Active status filtering
- Creation date for reporting
- Last activity for session management

---

### 2. `roles` - Organizational Roles

**Purpose:** Defines organizational roles with hierarchical support.

**Key Features:**
- Role hierarchy (parent_role_id for nested roles)
- System role protection (cannot be deleted)
- Default role assignment
- Priority for role precedence
- Soft delete with audit trail

**Compliance Features:**
- Created/updated by tracking
- System role protection prevents accidental deletion

**Indexes:**
- Name lookup
- Parent role relationships
- System role filtering
- Default role identification

---

### 3. `permissions` - Fine-Grained Permissions

**Purpose:** Defines permissions using resource:action format (e.g., `users:create`, `documents.legal:read`).

**Key Features:**
- Hierarchical resources (dot notation: `documents.legal.contracts`)
- Category classification for grouping
- System permission protection
- Soft delete support

**Permission Format:**
- `resource:action` (e.g., `users:create`, `documents:read`)
- Supports nested resources (e.g., `documents.legal:update`)

**Indexes:**
- Name lookup
- Resource filtering
- Resource + action combination
- Category grouping

---

### 4. `user_roles` - User-Role Assignments

**Purpose:** Many-to-many relationship between users and roles with expiration and revocation tracking.

**Key Features:**
- Assignment tracking (who assigned, when)
- Optional expiration dates
- Revocation support with reason
- Historical record (multiple assignments allowed)

**Compliance Features:**
- Complete audit trail of role assignments
- Revocation reason tracking
- Expiration management

**Indexes:**
- Active user-role relationships
- Expiration date filtering
- User and role lookups

---

### 5. `role_permissions` - Role-Permission Grants

**Purpose:** Many-to-many relationship between roles and permissions with audit trail.

**Key Features:**
- Grant tracking (who granted, when)
- Revocation support with reason
- Historical record

**Compliance Features:**
- Complete audit trail of permission grants
- Revocation tracking

**Indexes:**
- Active role-permission relationships
- Role and permission lookups

---

### 6. `user_permissions` - Direct User Permissions

**Purpose:** Direct permissions granted to users, bypassing roles (for temporary or exceptional access).

**Key Features:**
- Justification field (why this direct permission was granted)
- Optional expiration
- Revocation support
- Historical record

**Use Cases:**
- Temporary elevated access
- Exceptional circumstances
- Time-limited permissions

**Indexes:**
- Active user-permission relationships
- Expiration date filtering
- User and permission lookups

---

### 7. `processes` - Generic Workflow Container

**Purpose:** Flexible entity for workflows, cases, documents, transactions, and other business processes.

**Key Features:**
- Generic design accommodates various process types
- Process number for human-readable identification
- Status and stage tracking
- Ownership and assignment
- Parent-child relationships for sub-processes
- Related processes array
- Flexible metadata (JSONB)
- Tags for categorization
- Confidentiality levels
- Retention policy support

**Process Types Examples:**
- Legal cases
- Real estate transactions
- Document reviews
- Approval workflows
- Compliance audits

**Metadata Field:**
- JSONB for flexible, process-specific data
- No schema changes needed for new process types

**Compliance Features:**
- Confidentiality levels (public, internal, confidential, restricted)
- Retention policy tracking
- Soft delete with audit trail

**Indexes:**
- Process type filtering
- Status tracking
- Owner and assignee lookups
- Due date filtering
- GIN indexes for JSONB metadata and tags

---

### 8. `process_participants` - Process Participants

**Purpose:** Tracks who is involved in a process and their role.

**Key Features:**
- Participant roles (owner, assignee, reviewer, approver, observer)
- Custom permissions per participant
- Assignment tracking
- Removal tracking

**Use Cases:**
- Multi-user workflows
- Approval chains
- Review processes
- Observers for transparency

**Indexes:**
- Process participant lookups
- User participation tracking
- Role-based filtering

---

### 9. `audit_logs` - Immutable Audit Trail

**Purpose:** Append-only audit log for compliance and traceability. **IMMUTABLE** - no updates or deletes allowed.

**Key Features:**
- **Immutable by design** - triggers prevent UPDATE/DELETE
- Event categorization
- Actor information (user, role at time of event)
- Resource information
- Request context (IP, user agent, request ID, session ID)
- Outcome tracking (success/failure)
- Compliance flags (GDPR, HIPAA, SOX)
- Retention category for policy application
- Flexible details (JSONB)

**Event Categories:**
- `authentication` - Login, logout, password changes
- `authorization` - Permission grants, revocations
- `data_access` - Read operations
- `data_modification` - Create, update, delete
- `system` - System-level events
- `compliance` - Compliance-specific events

**Compliance Features:**
- Complete audit trail
- Immutability enforced at database level
- Compliance flag tagging
- Retention category support
- Request tracing support

**Indexes:**
- User activity queries
- Event type filtering
- Resource access tracking
- Time-based queries (created_at DESC)
- Compliance flag filtering
- Request and session tracing
- GIN index for JSONB details

**Immutability:**
- Triggers prevent UPDATE and DELETE operations
- Only INSERT allowed
- Historical accuracy guaranteed

---

### 10. `refresh_tokens` - JWT Refresh Token Management

**Purpose:** Manages JWT refresh tokens with revocation support.

**Key Features:**
- Token storage with expiration
- Revocation tracking
- Request context (IP, user agent, device fingerprint)
- Soft delete equivalent (revoked_at)

**Security Features:**
- Revocation support
- Device tracking
- IP address logging

**Indexes:**
- Active token lookup
- User token history
- Token validation

---

## Design Principles

### 1. UUIDs Everywhere
- All primary keys use UUIDs
- Better for distributed systems
- No sequential ID exposure
- Easier data merging

### 2. Soft Deletes
- All main tables support soft deletes
- `deleted_at` timestamp
- `deleted_by` user reference
- Preserves data for compliance

### 3. Audit Trail
- `created_by` and `updated_by` on all mutable tables
- `created_at` and `updated_at` timestamps
- Complete change history

### 4. Immutable Audit Logs
- Triggers prevent modification
- Append-only design
- Historical accuracy guaranteed
- Compliance-ready

### 5. Flexible Metadata
- JSONB fields for extensibility
- No schema changes for new fields
- GIN indexes for efficient querying

### 6. Compliance Ready
- Terms and privacy policy tracking
- Retention policy support
- Confidentiality levels
- Compliance flags in audit logs

### 7. No Premature Optimization
- Indexes only where needed
- Views for common queries
- Efficient but not over-optimized

## Views

### `user_active_permissions`
Combines permissions from roles and direct grants, showing only active permissions.

### `process_summary`
Process overview with participant counts for reporting.

## Security Considerations

1. **Row Level Security (RLS)**
   - Schema includes commented RLS setup
   - Enable for multi-tenancy if needed

2. **Immutability**
   - Audit logs protected by triggers
   - Cannot be modified or deleted

3. **Soft Deletes**
   - Data preserved for compliance
   - Can be restored if needed

4. **Expiration Management**
   - Roles and permissions can expire
   - Automatic filtering in views

## Performance Considerations

1. **Indexes**
   - Strategic indexes on foreign keys
   - Composite indexes for common queries
   - GIN indexes for JSONB and arrays

2. **Partitioning** (Future)
   - Audit logs can be partitioned by date
   - Processes can be partitioned by type

3. **Archiving** (Future)
   - Old audit logs can be archived
   - Retention policies can be automated

## Compliance Features

1. **GDPR**
   - User data tracking
   - Right to deletion (soft delete)
   - Audit trail of all access

2. **HIPAA**
   - Access logging
   - Confidentiality levels
   - Audit trail requirements

3. **SOX**
   - Financial data tracking
   - Change audit trail
   - Access controls

4. **General**
   - Immutable audit logs
   - Complete traceability
   - Retention policy support

