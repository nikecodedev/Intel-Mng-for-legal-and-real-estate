# GEMS Frontend

Next.js 14 (App Router) frontend for the GEMS platform.

## Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict)
- **TailwindCSS**
- **Axios** (API client)
- **React Query** (server state)
- **Context API** (auth)

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_API_URL` – backend API base URL (e.g. `http://localhost:3000/api/v1`)
3. Run dev server: `npm run dev` (port 3001)

## Structure

- `app/` – routes (login, dashboard, legal, auctions, real-estate, finance, crm, investor, admin)
- `components/layout` – Sidebar, Header, DashboardLayout
- `components/ui` – Button, Input, Card
- `components/tables` – DataTable
- `components/forms` – LoginForm
- `lib/` – api (axios), auth (storage helpers), types, hooks (React Query)
- `contexts/` – AuthContext (Context API for auth)

## Scripts

- `npm run dev` – development (port 3001)
- `npm run build` – production build
- `npm run start` – start production server
- `npm run type-check` – TypeScript check
