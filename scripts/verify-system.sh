#!/bin/bash

# Comprehensive System Verification Script
# Tests all components of the platform

set -e

echo "=========================================="
echo "  Platform System Verification"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Function to check status
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $1"
        ((FAILED++))
        return 1
    fi
}

# 1. Docker Services Status
echo "1. Checking Docker Services..."
cd "$(dirname "$0")/../infrastructure/docker" || exit 1

if docker compose ps | grep -q "platform-api.*Up.*healthy"; then
    check_status "API service is running and healthy"
else
    check_status "API service is NOT healthy"
fi

if docker compose ps | grep -q "platform-postgres.*Up.*healthy"; then
    check_status "PostgreSQL service is running and healthy"
else
    check_status "PostgreSQL service is NOT healthy"
fi

if docker compose ps | grep -q "platform-redis.*Up.*healthy"; then
    check_status "Redis service is running and healthy"
else
    check_status "Redis service is NOT healthy"
fi

echo ""

# 2. Health Endpoints
echo "2. Testing Health Endpoints..."

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/health | tail -1)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    check_status "Health endpoint responds with 200"
else
    check_status "Health endpoint returned $HEALTH_RESPONSE"
fi

READY_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/health/ready | tail -1)
if [ "$READY_RESPONSE" = "200" ]; then
    check_status "Readiness endpoint responds with 200"
else
    check_status "Readiness endpoint returned $READY_RESPONSE"
fi

LIVE_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/health/live | tail -1)
if [ "$LIVE_RESPONSE" = "200" ]; then
    check_status "Liveness endpoint responds with 200"
else
    check_status "Liveness endpoint returned $LIVE_RESPONSE"
fi

echo ""

# 3. Database Connectivity
echo "3. Testing Database Connectivity..."

if docker compose exec -T postgres psql -U platform_user -d platform_db -c "SELECT 1;" > /dev/null 2>&1; then
    check_status "Database connection successful"
else
    check_status "Database connection failed"
fi

TABLE_COUNT=$(docker compose exec -T postgres psql -U platform_user -d platform_db -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')
if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ]; then
    check_status "Database has $TABLE_COUNT tables"
else
    check_status "Database tables check failed"
fi

echo ""

# 4. Redis Connectivity
echo "4. Testing Redis Connectivity..."

if docker compose exec -T redis redis-cli -a change_me_in_production PING > /dev/null 2>&1; then
    check_status "Redis connection successful"
else
    check_status "Redis connection failed"
fi

echo ""

# 5. API Functionality
echo "5. Testing API Functionality..."

ROOT_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/ | tail -1)
if [ "$ROOT_RESPONSE" = "200" ]; then
    check_status "API root endpoint responds"
else
    check_status "API root endpoint returned $ROOT_RESPONSE"
fi

echo ""

# 6. Service Inter-connectivity
echo "6. Testing Service Inter-connectivity..."

if docker compose exec -T api ping -c 1 postgres > /dev/null 2>&1; then
    check_status "API can reach PostgreSQL"
else
    check_status "API cannot reach PostgreSQL"
fi

if docker compose exec -T api ping -c 1 redis > /dev/null 2>&1; then
    check_status "API can reach Redis"
else
    check_status "API cannot reach Redis"
fi

echo ""

# 7. Check for Errors
echo "7. Checking for Errors..."

ERROR_COUNT=$(docker compose logs api --tail=100 2>&1 | grep -i "error\|exception\|fatal" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    check_status "No errors in recent API logs"
else
    echo -e "${YELLOW}⚠${NC} Found $ERROR_COUNT potential errors in logs (check manually)"
    ((FAILED++))
fi

echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! System is running correctly.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please review the output above.${NC}"
    exit 1
fi
