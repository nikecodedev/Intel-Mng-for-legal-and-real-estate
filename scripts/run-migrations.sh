#!/bin/bash

# Migration Runner Script
# Runs all database migrations in order

set -e

echo "🔄 Running Database Migrations"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if running in Docker
if [ -f /.dockerenv ] || [ -n "$DOCKER_CONTAINER" ]; then
    echo -e "${YELLOW}Running inside Docker container${NC}"
    DB_HOST="${DB_HOST:-postgres}"
    DB_USER="${POSTGRES_USER:-platform_user}"
    DB_NAME="${POSTGRES_DB:-platform_db}"
    MIGRATIONS_DIR="/app/database/migrations"
else
    # Check if Docker Compose is available
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        echo -e "${YELLOW}Using Docker Compose${NC}"
        cd "$(dirname "$0")/../infrastructure/docker" || exit 1
        
        DB_HOST="postgres"
        DB_USER="${POSTGRES_USER:-platform_user}"
        DB_NAME="${POSTGRES_DB:-platform_db}"
        MIGRATIONS_DIR="../../apps/api/database/migrations"
        
        # Copy migrations to container
        echo -e "${YELLOW}Copying migrations to container...${NC}"
        docker compose cp "$MIGRATIONS_DIR" postgres:/tmp/migrations
        
        # Run migrations
        echo -e "${YELLOW}Executing migrations...${NC}"
        for migration in "$MIGRATIONS_DIR"/*.sql; do
            if [ -f "$migration" ]; then
                filename=$(basename "$migration")
                echo -e "${YELLOW}Running: $filename${NC}"
                docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < "$migration" || {
                    echo -e "${RED}❌ Migration failed: $filename${NC}"
                    exit 1
                }
                echo -e "${GREEN}✅ $filename${NC}"
            fi
        done
        
        echo -e "${GREEN}✅ All migrations completed!${NC}"
        exit 0
    else
        # Local PostgreSQL
        echo -e "${YELLOW}Using local PostgreSQL${NC}"
        DB_HOST="${DB_HOST:-localhost}"
        DB_USER="${POSTGRES_USER:-platform_user}"
        DB_NAME="${POSTGRES_DB:-platform_db}"
        MIGRATIONS_DIR="$(dirname "$0")/../apps/api/database/migrations"
    fi
fi

# Find all migration files and sort them
MIGRATIONS=$(find "$MIGRATIONS_DIR" -name "*.sql" | sort)

if [ -z "$MIGRATIONS" ]; then
    echo -e "${RED}❌ No migration files found in $MIGRATIONS_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}Found $(echo "$MIGRATIONS" | wc -l) migration(s)${NC}"
echo ""

# Run each migration
for migration in $MIGRATIONS; do
    filename=$(basename "$migration")
    echo -e "${YELLOW}Running: $filename${NC}"
    
    if [ -f /.dockerenv ] || [ -n "$DOCKER_CONTAINER" ]; then
        # Inside Docker
        psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$migration" || {
            echo -e "${RED}❌ Migration failed: $filename${NC}"
            exit 1
        }
    else
        # Local
        PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$migration" || {
            echo -e "${RED}❌ Migration failed: $filename${NC}"
            exit 1
        }
    fi
    
    echo -e "${GREEN}✅ $filename${NC}"
done

echo ""
echo -e "${GREEN}✅ All migrations completed successfully!${NC}"
