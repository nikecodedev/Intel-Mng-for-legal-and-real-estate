# Compliance-Grade Audit Logging System

## Overview

Complete audit logging system that automatically captures all create/update/delete operations with full traceability. The system is **server-side enforced** and **immutable** - audit logs cannot be modified.

## Features

✅ **Automatic Logging** - Middleware and hooks capture actions automatically
✅ **Server-Side Enforcement** - No client trust, all logging happens server-side
✅ **Immutable** - Database triggers prevent UPDATE/DELETE on audit logs
✅ **Comprehensive** - Captures user ID, role, IP, timestamp, entity, action
✅ **Compliance Ready** - Supports GDPR, HIPAA, SOX requirements

## Architecture

### 1. Audit Service (`src/services/audit.ts`)

Core service for creating audit log entries. Handles:
- Data modifications (create, update, delete)
- Data access (read operations)
- Authentication events
- Authorization events

**Key Methods:**
```typescript
AuditService.log() // Generic logging
AuditService.logDataModification() // Create/Update/Delete
AuditService.logDataAccess() // Read operations
AuditService.logAuthentication() // Login/Logout/Register
AuditService.logAuthorization() // Permission/Role changes
```

### 2. Audit Middleware (`src/middleware/audit.ts`)

Express middleware that automatically logs HTTP requests.

**Usage:**
```typescript
import { auditMiddleware } from '../middleware/audit';

// Apply to routes
router.use(auditMiddleware({
  logReads: false, // Don't log GET requests (default)
  resourceType: 'users', // Override resource type
  skipPaths: ['/health'], // Skip certain paths
}));
```

### 3. Audit Hooks (`src/models/audit-hooks.ts`)

Database operation hooks for automatic audit logging.

**Usage:**
```typescript
import { setAuditContext, auditCreate, auditUpdate, auditDelete } from '../models/audit-hooks';

// Set context
setAuditContext({
  userId: req.user.id,
  userEmail: req.user.email,
  userRole: 'admin',
  request: req,
});

// Perform operation
await db.query('INSERT INTO users ...');

// Log audit
await auditCreate('user', userId, userEmail);
```

### 4. Manual Audit Helpers

Helper functions for manual audit logging in controllers.

```typescript
import { audit } from '../middleware/audit';

await audit.logCreate(req, 'user', userId, { email: userEmail });
await audit.logUpdate(req, 'user', userId, { changes: {...} });
await audit.logDelete(req, 'user', userId, { deleted_data: {...} });
await audit.logRead(req, 'user', userId, { accessed_fields: [...] });
```

## Database Schema

The `audit_logs` table is defined in `database/schema-comprehensive.sql` and is **immutable**:

```sql
-- Triggers prevent UPDATE and DELETE
CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER prevent_audit_log_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

**Key Fields:**
- `event_type` - Type of event
- `event_category` - Category (authentication, authorization, data_access, data_modification, system)
- `action` - Action performed (create, read, update, delete)
- `user_id` - User who performed the action
- `user_email` - User email (denormalized)
- `user_role` - User role at time of event
- `resource_type` - Type of resource
- `resource_id` - ID of the resource
- `ip_address` - IP address
- `user_agent` - User agent string
- `request_id` - Request ID for tracing
- `details` - JSONB for flexible event data
- `compliance_flags` - GDPR, HIPAA, SOX flags

## Example Controller

See `src/routes/users-example.ts` for complete examples:

```typescript
// CREATE with automatic audit logging
router.post('/users',
  authenticate,
  requirePermission('users:create'),
  asyncHandler(async (req, res) => {
    setAuditContext({ userId: req.user.id, ... });
    const user = await AuditableUserModel.createWithAudit(data, context);
    // Audit logged automatically
  })
);

// UPDATE with automatic audit logging
router.put('/users/:id',
  authenticate,
  requirePermission('users:update'),
  asyncHandler(async (req, res) => {
    await AuditableUserModel.updateWithAudit(id, updates, context);
    // Audit logged automatically with change tracking
  })
);

// DELETE with automatic audit logging
router.delete('/users/:id',
  authenticate,
  requirePermission('users:delete'),
  asyncHandler(async (req, res) => {
    await AuditableUserModel.deleteWithAudit(id, context);
    // Audit logged automatically with deleted data
  })
);

// READ with manual audit logging
router.get('/users/:id',
  authenticate,
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(id);
    await audit.logRead(req, 'user', id, { accessed_fields: [...] });
    // Audit logged manually
  })
);
```

## Security Features

1. **Server-Side Only** - All audit logging happens server-side
2. **No Client Trust** - Client cannot modify audit logs
3. **Immutable** - Database triggers prevent modifications
4. **Sensitive Data Redaction** - Passwords, tokens, etc. are redacted
5. **Request Context** - IP, user agent, request ID captured

## Compliance Support

- **GDPR** - User data tracking, access logging, right to audit
- **HIPAA** - Medical data access logging, confidentiality tracking
- **SOX** - Financial data tracking, change audit trail
- **General** - Complete audit trail for any compliance requirement

## Performance

- Audit logging is asynchronous and non-blocking
- Errors in audit logging never break the application
- Indexes optimized for common queries
- Can be disabled for read operations if needed

## File Structure

```
src/
├── services/
│   └── audit.ts              # Core audit service
├── middleware/
│   └── audit.ts              # Express middleware + helpers
├── models/
│   └── audit-hooks.ts        # Database hooks
└── routes/
    └── users-example.ts      # Example controller
```

## Next Steps

1. Apply audit middleware to routes
2. Use audit hooks in models
3. Configure compliance flags as needed
4. Set up retention policies
5. Monitor audit log growth

