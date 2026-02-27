#!/bin/bash
# Ensures the system tenant exists so /auth/register works.
# Run from repo root. Uses Docker Compose if available, else local psql.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$REPO_ROOT/scripts/ensure-system-tenant.sql"

if [ ! -f "$SQL" ]; then
  echo "Missing $SQL"
  exit 1
fi

# Prefer Docker Compose (same as run-migrations.sh)
DOCKER_DIR="$REPO_ROOT/infrastructure/docker"
if [ -f "$DOCKER_DIR/docker-compose.yml" ] && (command -v docker-compose &>/dev/null || docker compose version &>/dev/null 2>&1); then
  echo "Using Docker Compose..."
  ( cd "$DOCKER_DIR" && docker compose exec -T postgres psql -U "${POSTGRES_USER:-platform_user}" -d "${POSTGRES_DB:-platform_db}" < "$SQL" )
  echo "System tenant ensured."
  exit 0
fi

# Local PostgreSQL from apps/api/.env
if [ -f "$REPO_ROOT/apps/api/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/apps/api/.env" 2>/dev/null || true
  set +a
fi
DB_URL="${DATABASE_URL}"
if [ -n "$DB_URL" ]; then
  echo "Using DATABASE_URL..."
  psql "$DB_URL" -f "$SQL"
  echo "System tenant ensured."
  exit 0
fi

# Fallback: host postgres
echo "Using local PostgreSQL (platform_db, platform_user)..."
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
psql -h "${DB_HOST:-localhost}" -p "${PGPORT:-5432}" -U "${POSTGRES_USER:-platform_user}" -d "${POSTGRES_DB:-platform_db}" -f "$SQL"
echo "System tenant ensured."
