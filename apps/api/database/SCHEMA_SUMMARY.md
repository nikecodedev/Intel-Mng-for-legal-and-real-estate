# PostgreSQL Schema Summary

## Overview

Enterprise-grade PostgreSQL schema designed for compliance, traceability, and audit requirements. All tables use UUIDs and support soft deletes.

## Core Tables

### 1. **users** - User Accounts
- Comprehensive user profiles with security flags
- Terms of service and privacy policy tracking
- Failed login attempt tracking
- Account lockout mechanism
- Soft delete with audit trail

### 2. **roles** - Organizational Roles
- Hierarchical roles (parent_role_id)
- System role protection
- Default role assignment
- Priority for role precedence

### 3. **permissions** - Fine-Grained Permissions
- Resource:action format (e.g., `users:create`, `documents.legal:read`)
- Hierarchical resources (dot notation)
- Category classification
- System permission protection

### 4. **user_roles** - User-Role Assignments
- Many-to-many relationship
- Expiration support
- Revocation with reason tracking
- Historical record

### 5. **role_permissions** - Role-Permission Grants
- Many-to-many relationship
- Grant tracking (who, when)
- Revocation support

### 6. **user_permissions** - Direct User Permissions
- Bypass roles for exceptional access
- Expiration support
- Justification field
- Revocation tracking

### 7. **processes** - Generic Workflow Container ⭐
- Flexible entity for any business process
- Process types: legal cases, transactions, documents, etc.
- Status and stage tracking
- Ownership and assignment
- Parent-child relationships
- JSONB metadata for extensibility
- Confidentiality levels
- Retention policy support

### 8. **process_participants** - Process Participants
- Tracks who is involved in processes
- Participant roles (owner, assignee, reviewer, etc.)
- Custom permissions per participant

### 9. **audit_logs** - Immutable Audit Trail ⭐⭐⭐
- **APPEND-ONLY** - No updates or deletes allowed
- Triggers enforce immutability
- Event categorization
- Actor and resource tracking
- Request context (IP, user agent, request ID)
- Compliance flags (GDPR, HIPAA, SOX)
- Retention categories
- JSONB details for flexibility

### 10. **refresh_tokens** - JWT Token Management
- Refresh token storage
- Revocation support
- Request context tracking

## Key Features

### ✅ Immutable Audit Logs
- Database triggers prevent UPDATE/DELETE
- Only INSERT operations allowed
- Historical accuracy guaranteed
- Compliance-ready

### ✅ UUIDs Everywhere
- All primary keys use UUIDs
- Better for distributed systems
- No sequential ID exposure

### ✅ Soft Deletes
- All main tables support soft deletes
- Preserves data for compliance
- Can be restored if needed

### ✅ Generic Process Entity
- Flexible JSONB metadata
- Supports any process type
- No schema changes needed
- Extensible design

### ✅ Compliance Ready
- Terms and privacy policy tracking
- Retention policy support
- Confidentiality levels
- Compliance flags in audit logs

### ✅ Complete Traceability
- Created/updated by tracking
- Assignment tracking
- Revocation tracking
- Complete audit trail

## Views

- **user_active_permissions** - Active user permissions (roles + direct)
- **process_summary** - Process overview with participant counts

## Indexes

Strategic indexes for:
- Foreign key lookups
- Common query patterns
- JSONB fields (GIN indexes)
- Time-based queries
- Compliance filtering

## Security

- Row Level Security (RLS) ready (commented)
- Immutability enforced at database level
- Soft delete protection
- Expiration management

## File Structure

```
database/
├── schema-comprehensive.sql    # Complete schema (use this)
├── SCHEMA_EXPLANATION.md       # Detailed table explanations
└── SCHEMA_SUMMARY.md           # This file
```

## Usage

```bash
# Create database
createdb platform_db

# Run schema
psql -U postgres -d platform_db -f database/schema-comprehensive.sql
```

## Compliance Standards Supported

- **GDPR** - User data tracking, right to deletion, audit trail
- **HIPAA** - Access logging, confidentiality levels
- **SOX** - Financial data tracking, change audit trail
- **General** - Immutable audit logs, complete traceability

