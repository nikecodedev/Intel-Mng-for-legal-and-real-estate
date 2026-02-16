# Technical Documentation

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Module Breakdown](#2-module-breakdown)
3. [Database Schema Overview](#3-database-schema-overview)
4. [Security Model Explanation](#4-security-model-explanation)
5. [Deployment Guide](#5-deployment-guide)

---

## 1. System Architecture Overview

### 1.1 Services

The platform is built as a microservices architecture with the following services:

#### **PostgreSQL Database**
- **Purpose**: Primary data store for all application data
- **Port**: 5432 (configurable via `POSTGRES_PORT`)
- **Features**:
  - Multi-tenant data isolation
  - ACID compliance
  - JSONB support for flexible metadata
  - Full-text search capabilities
  - Audit log hash chain implementation
- **Health Check**: `pg_isready` command

#### **Redis Cache**
- **Purpose**: Caching layer and job queue backend (BullMQ)
- **Port**: 6379 (configurable via `REDIS_PORT`)
- **Features**:
  - Session storage
  - Rate limiting counters
  - Background job queues
  - Cache for frequently accessed data
- **Persistence**: AOF (Append-Only File) enabled
- **Memory Policy**: LRU eviction (256MB max)
- **Health Check**: Redis `INCR` command

#### **Node.js API Service**
- **Purpose**: Main REST API server
- **Port**: 3000 (configurable via `API_PORT`)
- **Technology Stack**:
  - Express.js framework
  - TypeScript
  - ES Modules (ESM)
- **Features**:
  - RESTful API endpoints
  - JWT authentication
  - RBAC authorization
  - Multi-tenant middleware
  - Audit logging
  - Rate limiting
  - Request validation
  - Background job processing
- **Health Check**: HTTP GET `/health`

#### **Python Intelligence Service**
- **Purpose**: OCR, document processing, and ML capabilities
- **Port**: 8000 (configurable via `INTELLIGENCE_PORT`)
- **Technology Stack**:
  - FastAPI
  - Python 3.x
- **Features**:
  - Document OCR processing
  - Document quality assessment (CPO: VERDE/AMARELO/VERMELHO)
  - DPI resolution analysis
  - Fact extraction from documents
  - Integration with Gemini API for advanced document processing
- **Health Check**: HTTP GET `/health`

### 1.2 Data Flow

```
┌─────────────┐
│   Client    │
│  (Browser/  │
│   Mobile)   │
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌─────────────────────────────────────┐
│         Node.js API Service          │
│  ┌───────────────────────────────┐  │
│  │  Middleware Stack:            │  │
│  │  - Security (Helmet, CORS)    │  │
│  │  - Request ID                 │  │
│  │  - Request Logger             │  │
│  │  - Rate Limiting              │  │
│  │  - Tenant Isolation           │  │
│  │  - Authentication (JWT)      │  │
│  │  - RBAC Authorization         │  │
│  │  - Request Validation         │  │
│  │  - Timeout                    │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Route Handlers               │  │
│  │  - Documents                  │  │
│  │  - Auctions                   │  │
│  │  - Workflow                   │  │
│  │  - Finance                    │  │
│  │  - CRM                        │  │
│  │  - Super Admin                │  │
│  └───────────────────────────────┘  │
└──────┬──────────────────┬───────────┘
       │                  │
       │                  │
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│ PostgreSQL  │    │    Redis    │
│  Database   │    │   Cache/    │
│             │    │    Queue    │
└──────┬──────┘    └──────┬──────┘
       │                  │
       │                  │
       └──────────┬───────┘
                  │
                  ▼
         ┌─────────────────┐
         │ Python           │
         │ Intelligence     │
         │ Service          │
         │ (OCR/ML)         │
         └─────────────────┘
```

#### Request Flow Example: Document Upload

1. **Client** sends POST request to `/api/v1/documents/upload` with JWT token
2. **Security Middleware** validates CORS, applies Helmet headers
3. **Tenant Middleware** extracts `tenant_id` from JWT token (`tid` claim)
4. **Authentication Middleware** validates JWT token and extracts user context
5. **RBAC Middleware** checks `documents:create` permission for user in tenant
6. **Request Validation** validates request body against Zod schema
7. **Route Handler** processes document upload:
   - Creates document record in PostgreSQL
   - Queues OCR job in Redis (BullMQ)
   - Returns response to client
8. **Background Job Processor** (separate process):
   - Picks up OCR job from Redis queue
   - Calls Python Intelligence Service for OCR processing
   - Updates document record with extraction results
   - Triggers workflow events if configured
9. **Audit Service** logs all actions to `audit_logs` table with hash chain

### 1.3 Multi-Tenant Model

The platform implements **strict tenant isolation** at multiple layers:

#### **Tenant Identification**
- Tenant ID (`tenant_id`) is extracted from JWT token `tid` claim
- **Never** trusted from client headers (security risk)
- Tenant ID must be a valid UUID format
- Tenant status is validated (ACTIVE, SUSPENDED, BLOCKED)

#### **Isolation Layers**

1. **Middleware Layer** (`TenantMiddleware`):
   - Intercepts all requests (except public endpoints)
   - Validates tenant exists and is active
   - Injects `tenant_id` into `req.context`
   - Blocks requests from suspended/blocked tenants

2. **Repository/Model Layer**:
   - All database queries automatically filter by `tenant_id`
   - `enforceTenantIsolation()` utility ensures `tenant_id` is always provided
   - Cross-tenant queries are prevented at the database level

3. **Database Layer**:
   - All tenant-scoped tables have `tenant_id` column with foreign key to `tenants` table
   - Indexes on `tenant_id` for efficient filtering
   - Database triggers enforce tenant isolation in audit logs

4. **Audit Log Isolation**:
   - Each tenant has its own hash chain
   - Hash chain calculation: `SHA256(previous_hash | payload_evento | created_at)`
   - Database trigger selects previous hash **only for the same tenant**
   - Tampering with one tenant's logs does not affect others

#### **Tenant Context Injection**

```typescript
// Injected by TenantMiddleware into req.context
interface UserContext {
  user_id: string;
  tenant_id: string;
  role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' | 'INVESTOR';
  ip_address?: string;
}
```

#### **Public Endpoints** (Bypass Tenant Middleware)

- `/health` - Health check
- `/` - Root API info
- `/api/v1` - API documentation
- `/auth/login` - User login
- `/auth/register` - User registration
- `/auth/refresh` - Token refresh
- `/investor/auth/login` - Investor login
- `/investor/auth/refresh` - Investor token refresh

---

## 2. Module Breakdown

### 2.1 Legal Engine

**Purpose**: Document management, OCR processing, and legal case tracking

**Key Features**:
- Document upload and storage
- OCR processing with quality assessment (CPO status)
- Document fact extraction
- Document templates and generated documents
- Quality flags and sanitation queue
- Document versioning and metadata

**Routes**: `/api/v1/documents/*`

**Database Tables**:
- `documents` - Document metadata and storage paths
- `document_extractions` - OCR results and extracted text
- `document_facts` - Structured facts extracted from documents
- `document_quality_flags` - Quality issues and resolutions
- `document_templates` - Reusable document templates
- `generated_documents` - System-generated documents

**Key Services**:
- `DocumentExtractionService` - Handles OCR processing via Python Intelligence Service
- `DocumentFactService` - Extracts and manages structured facts
- `DocumentQualityService` - Manages quality flags and CPO status

**Workflow Integration**:
- Document upload triggers workflow events
- Quality flags can trigger review workflows
- Document status changes trigger notifications

### 2.2 Auction Engine

**Purpose**: Real estate auction asset management and bidding

**Key Features**:
- Auction asset creation and lifecycle management
- Stage transitions (F0 → F1 → F2 → F3 → F4 → F5)
- Due diligence tracking (occupancy, debts, legal risks, zoning)
- ROI calculation and versioning
- Bid management
- Risk assessment

**Routes**: `/api/v1/auctions/*`

**Database Tables**:
- `auction_assets` - Auction asset records with stage tracking
- `auction_asset_roi` - ROI calculations with versioning
- `auction_bids` - Bid records

**Key Services**:
- `AuctionAssetService` - Manages asset lifecycle
- `AuctionROIService` - Calculates and versions ROI
- `IntelligenceService` - Validates asset data

**Stage Flow**:
```
F0: Initial Creation
  ↓
F1: Due Diligence
  ↓
F2: Risk Assessment
  ↓
F3: Approval
  ↓
F4: Active Auction
  ↓
F5: Closed/Sold
```

**Quality Gates**:
- Hard gates prevent stage transitions if requirements not met
- Soft gates warn but allow transitions
- Tenant-specific gate configuration via `tenants.config_hard_gates`

### 2.3 Workflow

**Purpose**: Event-driven workflow automation

**Key Features**:
- Workflow trigger definitions (event-based)
- Deterministic rule evaluation
- Action execution (create_task, send_notification, block_transition)
- Event emission and handling
- Process state management

**Routes**: `/api/v1/workflow/*`

**Database Tables**:
- `workflow_triggers` - Trigger definitions with conditions
- `processes` - Generic workflow container
- `process_participants` - Process participants and roles

**Key Services**:
- `WorkflowEngineService` - Executes workflow triggers
- `WorkflowTriggerService` - Manages trigger definitions

**Event Types**:
- `document.uploaded`
- `document.quality_flag.created`
- `auction_asset.stage_transitioned`
- `financial_transaction.created`
- `user.created`
- Custom event types

**Action Types**:
- `create_task` - Creates a task in the process
- `send_notification` - Sends notification to users
- `block_transition` - Prevents workflow transition

### 2.4 Finance

**Purpose**: Financial transaction management and accounting

**Key Features**:
- Financial transaction tracking (PAYABLE, RECEIVABLE, EXPENSE, INCOME, TRANSFER)
- Accounts payable and receivable management
- Expense capture (mobile/web/API)
- Bank reconciliation
- Payment tracking with proof documents
- Financial reporting

**Routes**: `/api/v1/finance/*`

**Database Tables**:
- `financial_transactions` - All financial transactions
- `accounts_payable` - Payable tracking
- `accounts_receivable` - Receivable tracking
- `expense_capture` - Expense records
- `asset_costs` - Asset-related costs

**Key Services**:
- `FinancialTransactionService` - Manages transactions
- `BankReconciliationService` - Reconciles bank transactions
- `ExpenseCaptureService` - Handles expense submissions

**Transaction Linking**:
- Transactions must be linked to at least one of:
  - `process_id` - Legal case or workflow
  - `real_estate_asset_id` - Real estate asset
  - `client_id` - Client record

**Payment Workflow**:
1. Create transaction (PAYABLE/RECEIVABLE)
2. Mark payment with proof document
3. Bank reconciliation matches bank transactions
4. Automatic status updates

### 2.5 CRM

**Purpose**: Investor relationship management and matching

**Key Features**:
- Investor user management
- KYC (Know Your Customer) data collection
- Investor preference profiles
- Asset-investor matching
- Investor portal access

**Routes**: `/api/v1/crm/*`, `/api/v1/investor/*`, `/api/v1/matching/*`

**Database Tables**:
- `investor_users` - Investor user accounts
- `kyc_data` - KYC information and documents
- `investor_preference_profiles` - Investment preferences
- `investor_asset_links` - Asset-investor relationships

**Key Services**:
- `KYCService` - Manages KYC data and status
- `InvestorMatchingService` - Matches investors to assets
- `InvestorAuthService` - Investor-specific authentication

**KYC Workflow**:
1. Investor submits KYC data
2. Status: PENDING → IN_REVIEW → APPROVED/REJECTED
3. Approved investors can access investor portal
4. Preference profile enables automatic matching

**Matching Algorithm**:
- Matches investor preferences to asset characteristics
- Considers budget, risk tolerance, location, asset type
- Generates match scores
- Sends notifications for high-score matches

### 2.6 SaaS Admin

**Purpose**: Multi-tenant platform administration

**Key Features**:
- Tenant provisioning and management
- White-label configuration
- Storage quota management
- Subscription plan management
- Super admin dashboard
- Tenant suspension/activation

**Routes**: `/api/v1/super-admin/*`

**Database Tables**:
- `tenants` - Tenant records
- `white_label_configs` - White-label settings per tenant
- `tenant_storage_usage` - Storage tracking
- `tenant_quotas` - Quota definitions

**Key Services**:
- `SuperAdminService` - Platform-wide administration
- `TenantManagementService` - Tenant lifecycle management
- `QuotaEnforcementService` - Enforces storage quotas
- `WhiteLabelService` - Manages white-label configurations

**Tenant Lifecycle**:
1. **Provision**: Create tenant with subscription plan
2. **Configure**: Set quotas, white-label settings
3. **Activate**: Tenant status = ACTIVE
4. **Monitor**: Track usage, storage, users
5. **Suspend**: Temporarily disable (status = SUSPENDED)
6. **Block**: Permanently disable (status = BLOCKED)

**Subscription Plans**:
- FREE
- STANDARD
- PREMIUM
- ENTERPRISE
- CUSTOM

**Quota Management**:
- Max storage bytes
- Max users
- Max documents
- Automatic enforcement with soft/hard limits

---

## 3. Database Schema Overview

### 3.1 Core Tables

#### **tenants**
Multi-tenant root table. All tenant-scoped data references this table.

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    config_hard_gates JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE
);
```

#### **users**
User accounts with comprehensive security and profile information.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

#### **roles**
Role definitions with hierarchical support.

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200),
    description TEXT,
    parent_role_id UUID REFERENCES roles(id),
    is_system_role BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

#### **permissions**
Fine-grained permissions using `resource:action` format.

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL, -- e.g., "users:create"
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    is_system_permission BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

#### **user_roles**
Many-to-many relationship between users and roles.

```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    assigned_at TIMESTAMP WITH TIME ZONE,
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id)
);
```

#### **role_permissions**
Many-to-many relationship between roles and permissions.

```sql
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES roles(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    granted_at TIMESTAMP WITH TIME ZONE,
    granted_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id)
);
```

#### **user_permissions**
Direct user permissions (bypassing roles) for exceptional access.

```sql
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    granted_at TIMESTAMP WITH TIME ZONE,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    justification TEXT
);
```

### 3.2 Audit Logs

#### **audit_logs** (Immutable)
Append-only audit log with hash chain for integrity verification.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Hash chain
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    
    -- Event identification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    
    -- Actor information
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255),
    user_role VARCHAR(100),
    
    -- Resource information
    resource_type VARCHAR(100),
    resource_id UUID,
    target_resource_id UUID,
    resource_identifier VARCHAR(500),
    
    -- Event details
    description TEXT,
    payload_evento JSONB DEFAULT '{}',
    details JSONB DEFAULT '{}',
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    session_id VARCHAR(100),
    
    -- Outcome
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Compliance
    compliance_flags TEXT[],
    retention_category VARCHAR(50),
    
    -- Timestamp (immutable)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Hash Chain Calculation**:
```sql
CREATE FUNCTION calculate_audit_log_hash(
    p_previous_hash VARCHAR(64),
    p_payload_evento JSONB,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS VARCHAR(64) AS $$
BEGIN
    hash_input := COALESCE(p_previous_hash, '') || '|' ||
                  COALESCE(p_payload_evento::TEXT, '') || '|' ||
                  COALESCE(p_created_at::TEXT, '');
    RETURN encode(digest(hash_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;
```

**Immutability Enforcement**:
- Database trigger prevents UPDATE/DELETE operations
- Hash chain ensures integrity
- Per-tenant hash chain isolation

### 3.3 Document Management

#### **documents**
Document metadata and storage information.

```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    file_hash_sha256 VARCHAR(64) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    ocr_confidence FLOAT NOT NULL,
    dpi_resolution INT NOT NULL,
    status_cpo VARCHAR(20) CHECK (status_cpo IN ('VERDE', 'AMARELO', 'VERMELHO')),
    created_at TIMESTAMP WITH TIME ZONE
);
```

#### **document_extractions**
OCR results and extracted text.

```sql
CREATE TABLE document_extractions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    extracted_text TEXT,
    ocr_confidence FLOAT,
    processing_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE
);
```

#### **document_facts**
Structured facts extracted from documents.

```sql
CREATE TABLE document_facts (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    fact_type VARCHAR(100),
    fact_value JSONB,
    confidence_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE
);
```

### 3.4 Auction Management

#### **auction_assets**
Auction asset records with stage tracking.

```sql
CREATE TABLE auction_assets (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    stage VARCHAR(10) DEFAULT 'F0',
    linked_document_ids UUID[],
    asset_reference VARCHAR(255),
    title VARCHAR(500),
    due_diligence JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
```

#### **auction_asset_roi**
ROI calculations with versioning.

```sql
CREATE TABLE auction_asset_roi (
    id UUID PRIMARY KEY,
    auction_asset_id UUID NOT NULL REFERENCES auction_assets(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    version INTEGER NOT NULL,
    acquisition_price_cents BIGINT,
    expected_resale_value_cents BIGINT,
    calculated_roi_percentage NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE
);
```

### 3.5 Financial Management

#### **financial_transactions**
All financial transactions.

```sql
CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    transaction_type VARCHAR(50) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'BRL',
    transaction_date DATE NOT NULL,
    due_date DATE,
    process_id UUID REFERENCES processes(id),
    real_estate_asset_id UUID REFERENCES real_estate_assets(id),
    client_id UUID,
    payment_status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE
);
```

### 3.6 Indexes

The database includes comprehensive indexing for performance:

- **Foreign Key Indexes**: All foreign keys are indexed
- **Tenant ID Indexes**: All `tenant_id` columns are indexed
- **Composite Indexes**: Common query patterns (tenant + status, tenant + type)
- **Partial Indexes**: Filtered indexes for active records (`WHERE deleted_at IS NULL`)
- **JSONB Indexes**: GIN indexes for JSONB columns (metadata, details)
- **Hash Indexes**: For audit log hash chain verification

See migration `016_performance_indexes.sql` for complete index definitions.

---

## 4. Security Model Explanation

### 4.1 Tenant Isolation

#### **Principle**: "Ice Wall" (Muro de Gelo)
No request passes without proving origin (Tenant) and intention.

#### **Implementation Layers**:

1. **Middleware Layer** (`TenantMiddleware`):
   - Extracts `tenant_id` from JWT token (`tid` claim)
   - Validates tenant exists and is active
   - Blocks suspended/blocked tenants
   - Injects tenant context into request

2. **Repository Layer**:
   - `enforceTenantIsolation()` utility validates `tenant_id`
   - All queries automatically filter by `tenant_id`
   - Cross-tenant queries are prevented

3. **Database Layer**:
   - Foreign key constraints ensure data integrity
   - Indexes on `tenant_id` for efficient filtering
   - Database triggers enforce tenant isolation in audit logs

#### **Tenant Context**:
```typescript
interface UserContext {
  user_id: string;
  tenant_id: string;  // Always required
  role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' | 'INVESTOR';
  ip_address?: string;
}
```

### 4.2 RBAC (Role-Based Access Control)

#### **Permission Model**:
- **Format**: `resource:action` (e.g., `documents:create`, `users:read`)
- **Hierarchical Resources**: Supports dot notation (e.g., `documents.legal:read`)
- **Actions**: `create`, `read`, `update`, `delete`, `export`, `import`, `approve`, `reject`

#### **Role Hierarchy**:
- Roles can have parent roles
- Permissions are inherited from parent roles
- System roles cannot be deleted
- Default roles can be assigned to new users

#### **Permission Resolution**:
1. Check direct user permissions (`user_permissions`)
2. Check role permissions (`role_permissions` via `user_roles`)
3. Check parent role permissions (recursive)
4. Deny if no match found

#### **RBAC Middleware**:
```typescript
// Require specific permission
requirePermission('documents:create')

// Require any of multiple permissions
requireAnyPermission('documents:read', 'documents:write')

// Require all permissions
requireAllPermissions('documents:read', 'documents:approve')

// Require resource permission
requireResourcePermission('documents', 'create')

// Require role
requireRole('admin')

// Require super admin
requireSuperAdmin()
```

#### **Tenant-Scoped RBAC**:
- All permission checks are scoped to tenant
- System roles are available across tenants but still require tenant context
- Permission checks fail if tenant context is missing

### 4.3 Audit Model

#### **Immutable Audit Logs**:
- **Append-Only**: No UPDATE or DELETE allowed
- **Database Trigger**: Prevents modifications
- **Hash Chain**: Cryptographic integrity verification

#### **Hash Chain Implementation**:

**Hash Calculation**:
```
current_hash = SHA256(previous_hash | payload_evento | created_at)
```

**Per-Tenant Isolation**:
- Each tenant has its own hash chain
- Database trigger selects previous hash **only for the same tenant**
- Genesis hash: `SHA256('GENESIS')`

**Hash Chain Verification**:
```typescript
// Verify entire chain for tenant
GET /api/v1/audit-integrity/verify

// Quick status check
GET /api/v1/audit-integrity/status
```

#### **Audit Event Types**:
- **Authentication**: `user.login`, `user.logout`, `user.register`
- **Authorization**: `permission.grant`, `permission.revoke`, `role.assign`
- **Data Operations**: `data.create`, `data.read`, `data.update`, `data.delete`
- **System**: `system.config_change`, `system.backup`, `system.restore`

#### **Audit Log Fields**:
- `tenant_id` - Tenant isolation
- `previous_hash` - Previous log entry hash
- `current_hash` - Current entry hash
- `event_type` - Event identifier
- `event_category` - Event category
- `action` - Action performed
- `user_id` - Actor user ID
- `resource_type` - Resource type
- `resource_id` - Resource ID
- `payload_evento` - Event payload (for hash calculation)
- `details` - Additional event details
- `ip_address` - Request IP
- `user_agent` - User agent
- `request_id` - Request trace ID
- `success` - Operation success
- `compliance_flags` - Compliance tags (GDPR, HIPAA, SOX)

#### **Compliance Features**:
- **Retention Categories**: Automatic retention policy application
- **Compliance Flags**: Tag events for specific regulations
- **Immutable Logs**: Tamper-proof audit trail
- **Hash Chain Verification**: Detect any modifications

### 4.4 Security Headers and Middleware

#### **Helmet Configuration**:
- Content Security Policy (CSP) in production
- Cross-Origin Embedder Policy (COEP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)

#### **CORS Configuration**:
- Configurable allowed origins
- Wildcard (`*`) not allowed in production
- Credentials support
- Preflight request handling

#### **Rate Limiting**:
- **Global Rate Limit**: Per tenant (configurable)
- **Redis-Based**: Distributed rate limiting
- **Window**: Configurable time window (default: 15 minutes)
- **Max Requests**: Configurable per window (default: 100)

#### **Request Validation**:
- **Global Validation**: All requests validated against schemas
- **Zod Schemas**: Type-safe validation
- **Input Sanitization**: Prevents injection attacks
- **Error Handling**: Standardized error responses

#### **Request Timeout**:
- Prevents hanging requests
- Configurable timeout (default: 30 seconds)
- Automatic request termination
- 504 Gateway Timeout response

#### **Log Sanitization**:
- Sensitive fields redacted in logs
- Fields: `password`, `token`, `jwt`, `secret`, `refresh_token`, `authorization`
- Prevents credential leakage in logs

### 4.5 Authentication

#### **JWT Tokens**:
- **Access Token**: Short-lived (default: 15 minutes)
- **Refresh Token**: Long-lived (default: 7 days)
- **Claims**: `uid`, `tid`, `role`, `email`, `iat`, `exp`

#### **Token Validation**:
- Signature verification
- Expiration check
- Tenant validation
- User status check (active, not locked)

#### **Refresh Token Management**:
- Stored in database with revocation support
- Device fingerprinting
- IP address tracking
- Automatic cleanup of expired tokens

#### **Password Security**:
- Bcrypt hashing
- Password strength requirements
- Failed login attempt tracking
- Account locking after multiple failures

---

## 5. Deployment Guide

### 5.1 Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ disk space
- Linux/macOS/Windows with WSL2

### 5.2 Quick Start

#### **Automated Setup**:
```bash
# Run quick start script
./scripts/quick-start.sh
```

This script will:
1. Check Docker installation
2. Create required directories
3. Create `.env` file if missing
4. Build Docker images
5. Start all services
6. Wait for health checks
7. Display service status

#### **Manual Setup**:

1. **Clone Repository**:
```bash
git clone <repository-url>
cd Intel-Mng-for-legal-and-real-estate
```

2. **Create Environment File**:
```bash
cd infrastructure/docker
cat > .env << EOF
# Database
POSTGRES_USER=platform_user
POSTGRES_PASSWORD=change_me_in_production
POSTGRES_DB=platform_db
POSTGRES_PORT=5432

# Redis
REDIS_PASSWORD=change_me_in_production
REDIS_PORT=6379
REDIS_DB=0

# API
API_PORT=3000
JWT_SECRET=change_me_in_production_min_64_characters_long_for_production_use
LOG_LEVEL=info

# Intelligence Service
INTELLIGENCE_PORT=8000

# CORS (production: specify allowed origins)
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
```

3. **Build and Start Services**:
```bash
cd ../..
docker compose -f infrastructure/docker/docker-compose.yml build
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

4. **Check Service Status**:
```bash
docker compose -f infrastructure/docker/docker-compose.yml ps
```

5. **View Logs**:
```bash
docker compose -f infrastructure/docker/docker-compose.yml logs -f
```

### 5.3 Environment Variables

#### **Required Variables**:

| Variable | Description | Default | Production |
|----------|-------------|---------|------------|
| `POSTGRES_USER` | PostgreSQL username | `platform_user` | Required |
| `POSTGRES_PASSWORD` | PostgreSQL password | `change_me_in_production` | **Must change** |
| `POSTGRES_DB` | Database name | `platform_db` | Required |
| `POSTGRES_PORT` | PostgreSQL port | `5432` | Required |
| `REDIS_PASSWORD` | Redis password | `change_me_in_production` | **Must change** |
| `REDIS_PORT` | Redis port | `6379` | Required |
| `JWT_SECRET` | JWT signing secret | `change_me...` | **Min 64 chars** |
| `API_PORT` | API service port | `3000` | Required |
| `CORS_ORIGIN` | Allowed CORS origins | `*` | **Cannot be `*`** |

#### **Optional Variables**:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `info` |
| `NODE_ENV` | Node environment | `production` |
| `INTELLIGENCE_PORT` | Intelligence service port | `8000` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `GEMINI_API_KEY` | Gemini API key (optional) | - |

#### **Production Requirements**:

1. **JWT_SECRET**: Minimum 64 characters
2. **CORS_ORIGIN**: Must specify allowed origins (cannot be `*`)
3. **REDIS_PASSWORD**: Required if Redis is enabled
4. **Strong Passwords**: All passwords must be strong and unique
5. **HTTPS**: Use reverse proxy (nginx/traefik) with SSL certificates

### 5.4 Database Migrations

#### **Run Migrations**:

```bash
# Using migration script
./scripts/run-migrations.sh

# Or manually
docker compose -f infrastructure/docker/docker-compose.yml exec postgres psql -U platform_user -d platform_db -f /path/to/migration.sql
```

#### **Migration Order**:

1. `schema-comprehensive.sql` - Base schema (run first)
2. `001_initial_schema.sql` - Initial schema
3. `002_tenant_isolation.sql` - Tenant isolation
4. `003_document_extractions.sql` - Document tables
5. `004_document_facts_and_generated_documents.sql` - Document facts
6. `005_auction_assets.sql` - Auction tables
7. `006_auction_asset_roi.sql` - ROI tables
8. `007_workflow_triggers.sql` - Workflow tables
9. `008_investor_portal.sql` - Investor tables
10. `009_real_estate_assets.sql` - Real estate tables
11. `010_finance_accounting.sql` - Finance tables
12. `011_crm_investor_matching.sql` - CRM tables
13. `012_knowledge_management.sql` - Knowledge tables
14. `013_quality_gates.sql` - Quality gates
15. `014_super_admin.sql` - Super admin tables
16. `015_unified_dashboards.sql` - Dashboard tables
17. `016_performance_indexes.sql` - Performance indexes

#### **Migration Script**:

The `run-migrations.sh` script:
1. Detects if running in Docker or locally
2. Finds all migration files in order
3. Executes each migration sequentially
4. Reports success/failure for each migration

### 5.5 Health Checks

#### **Service Health Endpoints**:

- **API Health**: `GET http://localhost:3000/health`
- **API Detailed**: `GET http://localhost:3000/health/detailed`
- **Database Health**: `GET http://localhost:3000/health/db`
- **Redis Health**: `GET http://localhost:3000/health/redis`
- **Intelligence Health**: `GET http://localhost:8000/health`

#### **Health Check Response**:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### 5.6 Docker Commands

#### **Start Services**:
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

#### **Stop Services**:
```bash
docker compose -f infrastructure/docker/docker-compose.yml down
```

#### **Restart Services**:
```bash
docker compose -f infrastructure/docker/docker-compose.yml restart
```

#### **View Logs**:
```bash
# All services
docker compose -f infrastructure/docker/docker-compose.yml logs -f

# Specific service
docker compose -f infrastructure/docker/docker-compose.yml logs -f api
```

#### **Execute Commands in Container**:
```bash
# API container
docker compose -f infrastructure/docker/docker-compose.yml exec api sh

# PostgreSQL container
docker compose -f infrastructure/docker/docker-compose.yml exec postgres psql -U platform_user -d platform_db

# Redis container
docker compose -f infrastructure/docker/docker-compose.yml exec redis redis-cli
```

#### **Rebuild Services**:
```bash
# Rebuild all
docker compose -f infrastructure/docker/docker-compose.yml build --no-cache

# Rebuild specific service
docker compose -f infrastructure/docker/docker-compose.yml build --no-cache api
```

#### **View Service Status**:
```bash
docker compose -f infrastructure/docker/docker-compose.yml ps
```

### 5.7 Production Deployment

#### **Recommended Architecture**:

```
                    ┌─────────────┐
                    │   Nginx     │
                    │ (Reverse    │
                    │   Proxy)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Load      │
                    │  Balancer   │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
│  API Node 1  │  │  API Node 2  │  │  API Node N  │
└───────┬──────┘  └───────┬──────┘  └───────┬──────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
│  PostgreSQL  │  │    Redis     │  │ Intelligence │
│  (Primary +  │  │   (Cluster)  │  │   Service   │
│   Replicas)  │  │              │  │             │
└──────────────┘  └──────────────┘  └─────────────┘
```

#### **Production Checklist**:

- [ ] Change all default passwords
- [ ] Set `JWT_SECRET` to 64+ character random string
- [ ] Configure `CORS_ORIGIN` with specific allowed origins
- [ ] Enable HTTPS with SSL certificates
- [ ] Set up reverse proxy (nginx/traefik)
- [ ] Configure database backups
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Set up Redis persistence
- [ ] Configure resource limits for containers
- [ ] Set up health check monitoring
- [ ] Configure rate limiting appropriately
- [ ] Review and adjust security headers
- [ ] Set up audit log retention policy
- [ ] Configure file storage (S3/local)
- [ ] Set up disaster recovery plan

#### **Resource Recommendations**:

- **API Service**: 2 CPU, 2GB RAM per instance
- **PostgreSQL**: 4 CPU, 8GB RAM, 100GB storage
- **Redis**: 2 CPU, 2GB RAM
- **Intelligence Service**: 2 CPU, 4GB RAM

#### **Scaling Considerations**:

- **Horizontal Scaling**: API service can be scaled horizontally
- **Database Scaling**: Use read replicas for read-heavy workloads
- **Redis Scaling**: Use Redis Cluster for high availability
- **Load Balancing**: Use round-robin or least-connections algorithm

### 5.8 Backup and Recovery

#### **Database Backup**:
```bash
# Automated backup script
./scripts/backup-database.sh

# Manual backup
docker compose -f infrastructure/docker/docker-compose.yml exec postgres pg_dump -U platform_user platform_db > backup.sql
```

#### **Database Restore**:
```bash
# Restore script
./scripts/restore-database.sh <backup-file>

# Manual restore
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres psql -U platform_user platform_db < backup.sql
```

#### **File Storage Backup**:
```bash
# Backup uploaded documents
./scripts/backup-files.sh

# Restore files
./scripts/restore-files.sh <backup-directory>
```

### 5.9 Troubleshooting

#### **Services Not Starting**:
1. Check Docker logs: `docker compose logs`
2. Verify environment variables in `.env`
3. Check port conflicts: `netstat -tulpn | grep <port>`
4. Verify disk space: `df -h`
5. Check Docker resources: `docker system df`

#### **Database Connection Issues**:
1. Verify PostgreSQL is running: `docker compose ps postgres`
2. Check connection string in `.env`
3. Test connection: `docker compose exec postgres psql -U platform_user -d platform_db`
4. Check database logs: `docker compose logs postgres`

#### **Redis Connection Issues**:
1. Verify Redis is running: `docker compose ps redis`
2. Check Redis password in `.env`
3. Test connection: `docker compose exec redis redis-cli -a <password> ping`
4. Check Redis logs: `docker compose logs redis`

#### **API Errors**:
1. Check API logs: `docker compose logs api`
2. Verify JWT_SECRET is set correctly
3. Check database and Redis connectivity
4. Verify CORS configuration
5. Check rate limiting settings

#### **Migration Failures**:
1. Check migration logs for specific error
2. Verify database schema state
3. Check for conflicting migrations
4. Verify migration file syntax
5. Run migrations one at a time to isolate issues

---

## Appendix

### A. API Endpoints Summary

- **Health**: `/health`, `/health/detailed`, `/health/db`, `/health/redis`
- **Authentication**: `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`
- **Documents**: `/api/v1/documents/*`
- **Auctions**: `/api/v1/auctions/*`
- **Workflow**: `/api/v1/workflow/*`
- **Finance**: `/api/v1/finance/*`
- **CRM**: `/api/v1/crm/*`
- **Super Admin**: `/api/v1/super-admin/*`
- **Audit Integrity**: `/api/v1/audit-integrity/*`

### B. Database Extensions

- `uuid-ossp` - UUID generation
- `pgcrypto` - Cryptographic functions (SHA-256 for hash chain)

### C. Key Files

- `docker-compose.yml` - Service orchestration
- `schema-comprehensive.sql` - Complete database schema
- `quick-start.sh` - Automated setup script
- `run-migrations.sh` - Migration runner
- `backup-database.sh` - Database backup script
- `restore-database.sh` - Database restore script

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-01  
**Maintained By**: Platform Team
