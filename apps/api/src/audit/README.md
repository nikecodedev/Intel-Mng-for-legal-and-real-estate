# Audit Logging System

## Overview

Compliance-grade audit logging system that automatically logs all create/update/delete operations. The system is:
- **Server-side enforced** - No client trust
- **Append-only** - Immutable audit logs (enforced at database level)
- **Automatic** - Middleware and hooks capture actions
- **Comprehensive** - Captures user, role, IP, timestamp, entity, action

## Components

### 1. Audit Service (`src/services/audit.ts`)
Core service for creating audit log entries.

**Key Methods:**
- `log()` - Generic audit logging
- `logDataModification()` - Log create/update/delete
- `logDataAccess()` - Log read operations
- `logAuthentication()` - Log auth events
- `logAuthorization()` - Log permission/role changes

### 2. Audit Middleware (`src/middleware/audit.ts`)
Express middleware for automatic HTTP request auditing.

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

// Set context before operation
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

### 4. Manual Audit Helpers (`src/middleware/audit.ts`)
Helper functions for manual audit logging in controllers.

**Usage:**
```typescript
import { audit } from '../middleware/audit';

// In controller
await audit.logCreate(req, 'user', userId, { email: userEmail });
await audit.logUpdate(req, 'user', userId, { changes: {...} });
await audit.logDelete(req, 'user', userId, { deleted_data: {...} });
await audit.logRead(req, 'user', userId, { accessed_fields: [...] });
```

## Database Schema

The `audit_logs` table is **immutable** - triggers prevent UPDATE and DELETE operations.

**Key Fields:**
- `event_type` - Type of event (e.g., "data.create", "user.login")
- `event_category` - Category (authentication, authorization, data_access, data_modification, system)
- `action` - Action performed (create, read, update, delete, etc.)
- `user_id` - User who performed the action
- `user_email` - User email (denormalized for historical accuracy)
- `user_role` - User role at time of event
- `resource_type` - Type of resource (e.g., "user", "document")
- `resource_id` - ID of the resource
- `resource_identifier` - Human-readable identifier
- `ip_address` - IP address of request
- `user_agent` - User agent string
- `request_id` - Request ID for tracing
- `session_id` - Session ID
- `success` - Whether operation succeeded
- `details` - JSONB field for flexible event data
- `compliance_flags` - Compliance flags (GDPR, HIPAA, SOX)
- `retention_category` - Retention category for policy application

## Example Usage

See `src/routes/users-example.ts` for complete examples of:
- Automatic audit logging via hooks
- Manual audit logging in controllers
- CREATE, READ, UPDATE, DELETE operations

## Security

1. **Server-side only** - All audit logging happens server-side
2. **No client trust** - Client cannot modify audit logs
3. **Immutable** - Database triggers prevent modifications
4. **Sensitive data redaction** - Passwords, tokens, etc. are redacted

## Compliance

The system supports:
- **GDPR** - User data tracking, access logging
- **HIPAA** - Medical data access logging
- **SOX** - Financial data tracking
- **General** - Complete audit trail

## Performance

- Audit logging is asynchronous and non-blocking
- Errors in audit logging never break the application
- Indexes optimized for common queries
- Can be disabled for read operations if needed
