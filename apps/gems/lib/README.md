# GEMS Frontend – lib

## API layer (centralized)

- **`api.ts`** – Axios instance, auth interceptors, 401/403 handling, `getApiErrorMessage`, `isApiError`. All HTTP calls use this instance.
- **`*-api.ts`** – Feature modules: `legal-api`, `auction-api`, `real-estate-api`, `finance-api`, `dashboard-api`, `crm-api`, `matching-api`, `super-admin-api`. They import `api` from `@/lib/api` and export typed fetchers and types. No business rules; validation and rules come from the backend.

## Types

- **`types.ts`** – Shared app types (User, UserRole, Auth, Dashboard response shapes). Feature-specific types live in the corresponding `*-api.ts`.

## Utils

- **`utils/format.ts`** – Display-only formatting: `formatDate`, `formatCents`, `formatBytes`, `formatPercent`.
- **`utils/constants.ts`** – UI constants (e.g. status badge style maps). No business logic.

## Auth & hooks

- **`auth.ts`** – Auth helpers (cookie/token).
- **`hooks.ts`** – Shared hooks if any.
