# Monorepo Folder Structure

```
legal-real-estate-platform/
├── apps/                          # Application services
│   ├── api/                       # Backend API (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── config/           # Configuration management
│   │   │   ├── middleware/       # Express middleware (auth, validation, etc.)
│   │   │   ├── routes/           # API route handlers
│   │   │   ├── services/         # Business logic services
│   │   │   ├── models/           # Data models and DTOs
│   │   │   ├── utils/            # Utility functions
│   │   │   ├── types/            # TypeScript type definitions
│   │   │   ├── rbac/             # Role-Based Access Control module
│   │   │   ├── audit/            # Audit logging module
│   │   │   ├── workflow/         # Workflow engine integration
│   │   │   └── index.ts          # Application entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                       # Frontend (Next.js + React)
│       ├── src/
│       │   ├── app/               # Next.js App Router pages
│       │   ├── components/       # React components
│       │   ├── lib/              # API clients and utilities
│       │   ├── hooks/            # Custom React hooks
│       │   └── types/            # Frontend type definitions
│       ├── package.json
│       ├── tsconfig.json
│       └── next.config.js
│
├── services/                      # Microservices
│   └── intelligence/              # AI/ML Intelligence Services (Python)
│       ├── src/
│       │   ├── config/           # Configuration module
│       │   ├── services/         # ML model and processing services
│       │   ├── models/           # ML model definitions
│       │   ├── utils/            # Utility functions
│       │   └── main.py           # FastAPI application entry point
│       ├── requirements.txt
│       └── pyproject.toml
│
├── packages/                      # Shared packages (workspace packages)
│   ├── contracts/                 # API contracts and validation schemas
│   │   ├── src/
│   │   │   ├── api/              # API contract definitions
│   │   │   ├── validation/       # Zod validation schemas
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── types/                     # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── rbac/             # RBAC type definitions
│   │   │   ├── audit/            # Audit logging types
│   │   │   ├── workflow/         # Workflow engine types
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── utils/                     # Shared utility functions
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── infrastructure/                # Infrastructure as Code
│   ├── docker/                    # Docker configurations
│   │   ├── Dockerfile.api        # Backend API Dockerfile
│   │   ├── Dockerfile.web        # Frontend Dockerfile
│   │   ├── Dockerfile.intelligence # Intelligence services Dockerfile
│   │   └── docker-compose.yml    # Local development orchestration
│   └── k8s/                       # Kubernetes manifests
│       ├── namespace.yaml         # Kubernetes namespace
│       ├── ingress.yaml           # Ingress configuration
│       ├── api/                   # API service K8s configs
│       │   ├── deployment.yaml
│       │   └── service.yaml
│       ├── web/                   # Web service K8s configs
│       │   ├── deployment.yaml
│       │   └── service.yaml
│       └── intelligence/          # Intelligence service K8s configs
│           ├── deployment.yaml
│           └── service.yaml
│
├── docs/                          # Documentation
│   ├── architecture/              # System architecture docs
│   ├── api/                       # API documentation
│   ├── deployment/                # Deployment guides
│   ├── rbac/                      # RBAC documentation
│   ├── audit/                     # Audit logging documentation
│   └── workflow/                  # Workflow engine documentation
│
├── package.json                   # Root workspace configuration
├── turbo.json                     # Turborepo configuration
├── .gitignore                     # Git ignore rules
└── README.md                      # Project documentation
```

