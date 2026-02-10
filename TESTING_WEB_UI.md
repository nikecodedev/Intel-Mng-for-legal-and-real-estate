# Testing the Web UI (Screens)

## Overview

The platform has a Next.js web frontend with the following screens:

### Available Screens:

1. **Home Page** (`/`)
   - Landing page for the Legal & Real Estate Platform
   - Basic welcome message

2. **Document Viewer** (`/documents/[id]/view`)
   - Secure PDF document viewer
   - Features:
     - No download/print/copy allowed
     - Dynamic watermark (user email, ID, IP, timestamp)
     - Fact highlighting support
     - Requires authentication token

## How to Start the Web Frontend

### Option 1: Using the Script (Recommended)

```bash
./scripts/start-web-frontend.sh
```

This will:
- Install dependencies if needed
- Start the Next.js dev server on port 3001
- Connect to API at http://localhost:3000

### Option 2: Manual Start

```bash
cd apps/web
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev -- -p 3001
```

## Accessing the Web UI

Once started, open your browser to:
- **Web Frontend**: http://localhost:3001
- **API**: http://localhost:3000

## Testing the Screens

### 1. Test Home Page

```bash
# Open in browser
open http://localhost:3001
# or
xdg-open http://localhost:3001
```

You should see:
- "Legal & Real Estate Platform" heading
- "Frontend application" text

### 2. Test Document Viewer

To test the document viewer, you need:
1. A valid authentication token
2. A document ID from the database

**Get a token:**
```bash
# First, create a user and get a token via API
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "first_name": "Test",
    "last_name": "User"
  }'
```

**Then login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'
```

**Access document viewer:**
```
http://localhost:3001/documents/{document-id}/view
```

## About Chat Functionality

**Note:** There is currently **no chat functionality** implemented in this platform.

The platform focuses on:
- Legal case management
- Real estate asset management
- Document processing
- Investor portal
- Finance & accounting
- Knowledge management

If you need chat functionality, it would need to be added as a new feature.

## Troubleshooting

### Port Already in Use

If port 3001 is in use:
```bash
# Use a different port
npm run dev -- -p 3002
```

### API Connection Issues

Make sure the API is running:
```bash
docker compose -f infrastructure/docker/docker-compose.yml ps api
```

Check API health:
```bash
curl http://localhost:3000/health
```

### Authentication Issues

The document viewer requires:
- Valid JWT token in `sessionStorage` or `localStorage` as `auth_token`
- Token must have access to the document's tenant

## Next Steps

To add more screens or features:
1. Create new pages in `apps/web/src/app/`
2. Add components in `apps/web/src/components/`
3. Update API client in `apps/web/src/lib/api.ts`
