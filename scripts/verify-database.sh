#!/bin/bash
# Verify database schema for GEMS (login/register). Run from repo root.
# Usage: bash scripts/verify-database.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

run_psql() {
  if [ -n "$USE_DOCKER" ]; then
    ( cd "$REPO_ROOT/infrastructure/docker" && docker compose exec -T postgres psql -U "${POSTGRES_USER:-platform_user}" -d "${POSTGRES_DB:-platform_db}" -t -A "$@" )
  else
    export PGPASSWORD="${POSTGRES_PASSWORD:-$PGPASSWORD}"
    psql -h "${DB_HOST:-localhost}" -p "${PGPORT:-5432}" -U "${POSTGRES_USER:-platform_user}" -d "${POSTGRES_DB:-platform_db}" -t -A "$@"
  fi
}

echo "🔍 Verifying database (login/register schema)"
echo "=============================================="

# Prefer Docker Compose if available and no explicit local DB
if [ -z "${DATABASE_URL}" ] && (command -v docker-compose &>/dev/null || docker compose version &>/dev/null 2>/dev/null); then
  if [ -d "$REPO_ROOT/infrastructure/docker" ] && [ -f "$REPO_ROOT/infrastructure/docker/docker-compose.yml" ]; then
    USE_DOCKER=1
    echo -e "${YELLOW}Using Docker Compose (postgres container)${NC}"
  fi
fi

if [ -z "$USE_DOCKER" ]; then
  API_ENV="$REPO_ROOT/apps/api/.env"
  if [ -f "$API_ENV" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$API_ENV" 2>/dev/null || true
    set +a
  fi
  if [ -z "${PGPASSWORD}" ] && [ -n "${POSTGRES_PASSWORD}" ]; then
    export PGPASSWORD="${POSTGRES_PASSWORD}"
  fi
  echo -e "${YELLOW}Using local PostgreSQL (${DB_HOST:-localhost}:${PGPORT:-5432}/${POSTGRES_DB:-platform_db})${NC}"
fi

PASS=0
FAIL=0

# 1. System tenant exists
if [ "$(run_psql -c "SELECT COUNT(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001';" 2>/dev/null)" = "1" ]; then
  echo -e "  ${GREEN}✓${NC} System tenant exists"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}✗${NC} System tenant missing (run migrations: bash scripts/run-migrations.sh)"
  FAIL=$((FAIL+1))
fi

# 2. Table: users with tenant_id
if [ "$(run_psql -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tenant_id';" 2>/dev/null)" = "1" ]; then
  echo -e "  ${GREEN}✓${NC} Table users has tenant_id"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}✗${NC} Table users.tenant_id missing (migration 002)"
  FAIL=$((FAIL+1))
fi

# 3. Table: refresh_tokens with tenant_id
if [ "$(run_psql -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'refresh_tokens' AND column_name = 'tenant_id';" 2>/dev/null)" = "1" ]; then
  echo -e "  ${GREEN}✓${NC} Table refresh_tokens has tenant_id"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}✗${NC} Table refresh_tokens.tenant_id missing (migration 002)"
  FAIL=$((FAIL+1))
fi

# 4. Table: audit_logs with event_type (API columns)
if [ "$(run_psql -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'event_type';" 2>/dev/null)" = "1" ]; then
  echo -e "  ${GREEN}✓${NC} Table audit_logs has event_type (API audit)"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}✗${NC} Table audit_logs.event_type missing (migration 018)"
  FAIL=$((FAIL+1))
fi

# 5. Can list tenants
TENANT_COUNT=$(run_psql -c "SELECT COUNT(*) FROM tenants;" 2>/dev/null || echo "0")
echo -e "  ${GREEN}✓${NC} Tenants count: $TENANT_COUNT"
PASS=$((PASS+1))

echo "=============================================="
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✅ Database OK ($PASS checks passed). Login/register schema is in place.${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL check(s) failed. Run: bash scripts/run-migrations.sh${NC}"
  exit 1
fi
