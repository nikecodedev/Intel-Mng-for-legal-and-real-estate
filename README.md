# Intelligent Management Platform for the Legal and Real Estate Sectors

A production-grade SaaS platform monorepo with backend API, intelligence services, frontend, and infrastructure configurations.

## Structure

```
├── apps/              # Application services
│   ├── api/           # Backend API (Node.js + TypeScript)
│   └── web/           # Frontend (Next.js + React)
├── services/          # Microservices
│   └── intelligence/  # AI/ML services (Python)
├── packages/          # Shared packages
│   ├── contracts/     # API contracts and schemas
│   ├── types/         # Shared TypeScript types
│   └── utils/         # Shared utilities
├── infrastructure/    # Infrastructure as Code
│   ├── docker/        # Docker configurations
│   └── k8s/           # Kubernetes manifests
└── docs/              # Documentation
```

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- Python >= 3.10
- Docker
- Kubernetes (for deployment)

### Installation

```bash
# Install dependencies
npm install

# Run all services in development
npm run dev

# Build all packages
npm run build
```

## Development

This monorepo uses Turborepo for build orchestration and workspace management.

### Workspace Scripts
- `npm run dev` - Start all services in development mode
- `npm run build` - Build all packages and applications
- `npm run lint` - Lint all packages
- `npm run test` - Run tests across all packages
- `npm run type-check` - Type check all TypeScript packages

## Architecture

### Backend API
RESTful API built with Node.js and TypeScript, designed for:
- RBAC (Role-Based Access Control)
- Audit logging
- Workflow engine integration

### Intelligence Services
Python-based microservices for AI/ML capabilities:
- Data processing
- Analytics
- Machine learning models

### Frontend
Next.js application with React for the user interface.

### Shared Packages
Reusable code shared across services:
- API contracts and validation schemas
- TypeScript type definitions
- Common utilities

## License

Private - All rights reserved

