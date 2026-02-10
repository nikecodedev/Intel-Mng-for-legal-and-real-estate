#!/bin/bash

# Quick Start Script for Platform
# This script helps you quickly set up and run the platform

set -e

echo "🚀 Platform Quick Start Script"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"

# Navigate to docker directory
cd "$DOCKER_DIR" || exit 1

echo -e "${YELLOW}📦 Creating required directories...${NC}"
mkdir -p data/postgres data/redis

# Fix permissions if directories exist with wrong ownership
if [ -d "data/postgres" ]; then
    echo -e "${YELLOW}🔧 Fixing permissions on data directories...${NC}"
    sudo chown -R $USER:$USER data/ 2>/dev/null || {
        # If sudo fails, try to remove problematic subdirectories
        echo -e "${YELLOW}⚠️  Removing old data directories...${NC}"
        rm -rf data/postgres/pgdata data/redis/appendonlydir 2>/dev/null || true
    }
fi

echo -e "${YELLOW}🔧 Checking environment variables...${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from defaults...${NC}"
    cat > .env << EOF
# Database
POSTGRES_USER=platform_user
POSTGRES_PASSWORD=change_me_in_production
POSTGRES_DB=platform_db
POSTGRES_PORT=5432

# Redis
REDIS_PASSWORD=change_me_in_production
REDIS_PORT=6379
REDIS_DB=0

# API
API_PORT=3000
JWT_SECRET=change_me_in_production_min_32_characters_long_please
LOG_LEVEL=info

# Intelligence Service
INTELLIGENCE_PORT=8000
EOF
    echo -e "${GREEN}✅ Created .env file. Please update with secure values!${NC}"
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

echo -e "${YELLOW}🏗️  Building Docker images...${NC}"
# Build from project root to ensure .dockerignore is used
cd "$PROJECT_ROOT" || exit 1
docker compose -f infrastructure/docker/docker-compose.yml build
cd "$DOCKER_DIR" || exit 1

echo -e "${YELLOW}🚀 Starting services...${NC}"
cd "$PROJECT_ROOT" || exit 1
docker compose -f infrastructure/docker/docker-compose.yml up -d
cd "$DOCKER_DIR" || exit 1

echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
MAX_WAIT=60
WAIT_COUNT=0
cd "$PROJECT_ROOT" || exit 1
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if docker compose -f infrastructure/docker/docker-compose.yml ps | grep -q "healthy"; then
        echo -e "${GREEN}✅ Services are healthy!${NC}"
        break
    fi
    echo -n "."
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
done
cd "$DOCKER_DIR" || exit 1

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo -e "${RED}❌ Services did not become healthy in time. Check logs: docker compose logs${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All services are running!${NC}"
echo ""
echo "📊 Service Status:"
cd "$PROJECT_ROOT" || exit 1
docker compose -f infrastructure/docker/docker-compose.yml ps
cd "$DOCKER_DIR" || exit 1

echo ""
echo -e "${YELLOW}🧪 Testing health endpoints...${NC}"

# Test health endpoint
if curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✅ API health check passed${NC}"
else
    echo -e "${RED}❌ API health check failed${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "1. Run database migrations:"
echo "   docker compose exec postgres psql -U platform_user -d platform_db -f /path/to/migration.sql"
echo ""
echo "2. Test the API:"
echo "   curl http://localhost:3000/health"
echo ""
echo "3. View logs:"
echo "   docker compose logs -f"
echo ""
echo "4. Stop services:"
echo "   docker compose down"
echo ""
echo "📖 For more information, see RUN_AND_TEST.md"
