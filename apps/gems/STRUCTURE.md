# GEMS Frontend – Folder structure

## `app/`

Next.js App Router: routes and page components. Pages should:

- Fetch via `lib/*-api` only (no direct HTTP).
- Use shared UI from `components/ui` and formatting from `lib/utils`.
- Not implement business rules (validation, eligibility, etc.); the API is the source of truth.

## `components/`

- **`ui/`** – Reusable presentational components: Button, Card, Input, Skeleton, LoadingSpinner, BlockLoader, StatusBadge, DateDisplay, CurrencyDisplay, EmptyState. No API calls or business logic.
- **`tables/`** – DataTable (uses EmptyState for empty message).
- **`legal/`**, **`real-estate/`**, **`auctions/`** – Feature-specific components (e.g. StatusProgressionTimeline, RiskIndicator).

## `lib/`

- **`api.ts`** – Single Axios instance, auth and error handling. All feature APIs use it.
- **`*-api.ts`** – Feature API modules (legal, auction, real-estate, finance, dashboard, crm, matching, super-admin). Typed fetchers and response types only.
- **`types.ts`** – Shared app types (User, Auth, Dashboard shapes).
- **`utils/`** – Display-only formatting and UI constants. See `lib/README.md`.

## `contexts/`

React contexts (e.g. auth) if any. Prefer minimal global state.

## Build

From repo root: `npm run build` (or from `apps/gems`: `npm run build`). Production build must pass with strict TypeScript.
