# Folder Explanations

## Root Level

### `apps/`
Contains the main application services that directly serve end users or external clients.

### `services/`
Contains microservices that provide specialized functionality, typically used internally by other services.

### `packages/`
Contains shared packages/libraries that are used across multiple applications and services. These are workspace packages managed by npm/yarn/pnpm workspaces.

### `infrastructure/`
Contains all Infrastructure as Code (IaC) configurations for containerization and orchestration.

### `docs/`
Centralized documentation for the entire platform.

---

## Applications (`apps/`)

### `apps/api/`
**Backend API Service** - Node.js + TypeScript REST API

- **`src/config/`** - Application configuration management, environment variables, feature flags
- **`src/middleware/`** - Express middleware: authentication, authorization, request validation, error handling, rate limiting
- **`src/routes/`** - API route definitions organized by domain/resource, route-level middleware
- **`src/services/`** - Business logic layer, database operations, external API integrations, workflow engine clients
- **`src/models/`** - Data models, database schemas, DTOs (Data Transfer Objects), entity definitions
- **`src/utils/`** - Helper functions, common utilities, validation helpers, formatting utilities
- **`src/types/`** - TypeScript type definitions, interfaces, type guards specific to the API
- **`src/rbac/`** - Role-Based Access Control implementation: role definitions, permission checks, authorization logic
- **`src/audit/`** - Audit logging module: event logging, audit trail storage, compliance logging
- **`src/workflow/`** - Workflow engine integration: workflow execution, state management, workflow definitions

### `apps/web/`
**Frontend Application** - Next.js + React web application

- **`src/app/`** - Next.js App Router pages and layouts (Next.js 13+ App Directory structure)
- **`src/components/`** - Reusable React components, UI components, feature-specific components
- **`src/lib/`** - API client functions, utility functions, third-party service integrations
- **`src/hooks/`** - Custom React hooks for data fetching, state management, side effects
- **`src/types/`** - Frontend-specific TypeScript types, component prop types, API response types

---

## Services (`services/`)

### `services/intelligence/`
**Intelligence Services** - Python-based AI/ML microservices

- **`src/config/`** - Python configuration management, environment settings
- **`src/services/`** - ML model services, data processing services, analytics services, inference services
- **`src/models/`** - Machine learning model definitions, training scripts, model inference code, preprocessing pipelines
- **`src/utils/`** - Python utility functions, data processing helpers, ML utilities
- **`src/main.py`** - FastAPI application entry point, API routes for ML services

---

## Shared Packages (`packages/`)

### `packages/contracts/`
**API Contracts & Validation** - Shared API contracts and validation schemas

- **`src/api/`** - API request/response type definitions, endpoint contracts, service-to-service communication contracts
- **`src/validation/`** - Zod validation schemas, request/response validation, shared validation utilities

**Purpose**: Ensures type safety and validation consistency across frontend, backend, and services.

### `packages/types/`
**Shared TypeScript Types** - Common type definitions used across the monorepo

- **`src/rbac/`** - Role definitions, permission types, user role types, access control types
- **`src/audit/`** - Audit log entry types, event types, audit metadata types
- **`src/workflow/`** - Workflow definition types, workflow state types, workflow event types

**Purpose**: Single source of truth for type definitions, ensuring consistency across TypeScript projects.

### `packages/utils/`
**Shared Utilities** - Common utility functions used across applications

**Purpose**: Reusable code to avoid duplication, shared business logic utilities.

---

## Infrastructure (`infrastructure/`)

### `infrastructure/docker/`
**Docker Configurations** - Container definitions for all services

- **`Dockerfile.api`** - Multi-stage Dockerfile for backend API (optimized for production)
- **`Dockerfile.web`** - Multi-stage Dockerfile for Next.js frontend
- **`Dockerfile.intelligence`** - Dockerfile for Python intelligence services
- **`docker-compose.yml`** - Local development orchestration, service networking, volume mounts

**Purpose**: Containerization for consistent deployments across environments.

### `infrastructure/k8s/`
**Kubernetes Manifests** - Production deployment configurations

- **`namespace.yaml`** - Kubernetes namespace for platform isolation
- **`ingress.yaml`** - Ingress controller configuration for external routing
- **`api/`** - API service Kubernetes resources (deployment, service, configmaps, secrets)
- **`web/`** - Web service Kubernetes resources
- **`intelligence/`** - Intelligence service Kubernetes resources

**Purpose**: Production-grade orchestration, scaling, service discovery, load balancing.

---

## Documentation (`docs/`)

### `docs/architecture/`
System architecture diagrams, service architecture documentation, design decisions, technical specifications.

### `docs/api/`
API endpoint documentation, request/response schemas, authentication guides, integration guides.

### `docs/deployment/`
Deployment guides, environment setup instructions, infrastructure documentation, CI/CD pipeline docs.

### `docs/rbac/`
Role-Based Access Control design, permission matrix, role definitions, access control implementation guide.

### `docs/audit/`
Audit logging design, event types and schemas, compliance requirements, audit log querying guide.

### `docs/workflow/`
Workflow engine design, workflow definition format, state machine documentation, workflow integration guide.

---

## Key Design Decisions

### Monorepo Structure
- **Clear separation** between applications, services, and shared code
- **Workspace management** via npm workspaces and Turborepo for build orchestration
- **Language-specific** organization (TypeScript in `apps/`, Python in `services/`)

### RBAC, Audit, and Workflow Preparation
- **Dedicated modules** in API (`src/rbac/`, `src/audit/`, `src/workflow/`)
- **Shared types** in `packages/types/` for cross-service consistency
- **Documentation structure** ready for detailed specifications

### Scalability
- **Microservices architecture** with clear service boundaries
- **Shared contracts** ensure inter-service communication consistency
- **Infrastructure as Code** for reproducible deployments

### Development Experience
- **TypeScript** for type safety across Node.js projects
- **Shared packages** for code reuse and consistency
- **Docker Compose** for local development
- **Kubernetes** for production deployment

