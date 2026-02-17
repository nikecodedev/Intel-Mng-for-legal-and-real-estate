# Complete Testing Guide - Copy-Paste Commands

## Step 1: Navigate to Project Directory
```bash
cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate
```

## Step 2: Check Docker is Running
```bash
docker --version
docker compose version
```

## Step 3: Stop Any Running Containers (Clean Start)
```bash
docker compose -f infrastructure/docker/docker-compose.yml down
docker compose -f infrastructure/docker/docker-compose.prod.yml down
```

## Step 4: Build Docker Images
```bash
cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate
docker compose -f infrastructure/docker/docker-compose.yml build
```

**Expected**: Images build successfully (may take 5-10 minutes first time)

## Step 5: Start All Services
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

**Expected**: All services start in detached mode

## Step 6: Wait for Services to be Healthy (30 seconds)
```bash
sleep 30
```

## Step 7: Check Service Status
```bash
docker compose -f infrastructure/docker/docker-compose.yml ps
```

**Expected Output**: All services show "healthy" or "running"
```
NAME                    STATUS
platform-postgres       healthy
platform-redis          healthy  
platform-api            healthy
platform-intelligence   healthy
```

## Step 8: Check Service Logs (if any errors)
```bash
# Check API logs
docker compose -f infrastructure/docker/docker-compose.yml logs api | tail -20

# Check PostgreSQL logs
docker compose -f infrastructure/docker/docker-compose.yml logs postgres | tail -20

# Check Redis logs
docker compose -f infrastructure/docker/docker-compose.yml logs redis | tail -20
```

## Step 9: Test Health Endpoints

### 9.1 Test Main Health Endpoint
```bash
curl http://localhost:3000/health
```

**Expected**: JSON response with `"status": "healthy"`

### 9.2 Test Database Health
```bash
curl http://localhost:3000/health/db
```

**Expected**: `{"status":"healthy","database":"connected"}`

### 9.3 Test Redis Health
```bash
curl http://localhost:3000/health/redis
```

**Expected**: `{"status":"healthy","redis":"connected"}`

### 9.4 Test Intelligence Service Health
```bash
curl http://localhost:8000/health
```

**Expected**: `{"status":"healthy"}`

## Step 10: Run Database Migrations
```bash
./scripts/run-migrations.sh
```

**Expected**: All migrations complete successfully

## Step 11: Test API Root Endpoint
```bash
curl http://localhost:3000/
```

**Expected**: 
```json
{
  "success": true,
  "message": "Legal & Real Estate Platform API",
  "version": "v1",
  "documentation": "/api/v1"
}
```

## Step 12: Test API Info Endpoint
```bash
curl http://localhost:3000/api/v1
```

**Expected**: API information response

## Step 13: Run Automated Test Suite
```bash
chmod +x tests/homologation-test-scenarios.sh
./tests/homologation-test-scenarios.sh
```

**Expected**: All 8 test scenarios pass

## Step 14: Quick Manual Authentication Test

### 14.1 Test Registration (if endpoint exists)
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!Password",
    "first_name": "Test",
    "last_name": "User"
  }'
```

### 14.2 Test Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!Password"
  }'
```

**Expected**: Returns access_token and refresh_token

## Step 15: Verify All Services Are Accessible

### 15.1 Check PostgreSQL Connection
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec postgres psql -U platform_user -d platform_db -c "SELECT version();"
```

**Expected**: PostgreSQL version information

### 15.2 Check Redis Connection
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec redis redis-cli ping
```

**Expected**: `PONG`

## Step 16: Check Resource Usage
```bash
docker stats --no-stream
```

**Expected**: Shows CPU and memory usage for all containers

## Step 17: View All Logs (Optional)
```bash
docker compose -f infrastructure/docker/docker-compose.yml logs --tail=50
```

## Step 18: Stop Services (When Done Testing)
```bash
docker compose -f infrastructure/docker/docker-compose.yml down
```

## Troubleshooting Commands

### If services won't start:
```bash
# Check for port conflicts
netstat -tulpn | grep -E "3000|5432|6379|8000"

# Check Docker disk space
docker system df

# Remove old containers
docker compose -f infrastructure/docker/docker-compose.yml down -v
```

### If health checks fail:
```bash
# Restart specific service
docker compose -f infrastructure/docker/docker-compose.yml restart api

# Check detailed logs
docker compose -f infrastructure/docker/docker-compose.yml logs api
```

### If database connection fails:
```bash
# Test database connection directly
docker compose -f infrastructure/docker/docker-compose.yml exec postgres psql -U platform_user -d platform_db -c "\dt"
```

## Success Criteria

✅ All services show "healthy" status
✅ Health endpoints return 200 OK
✅ Database migrations complete successfully
✅ API responds to requests
✅ Automated tests pass (if run)
✅ No critical errors in logs

## Quick Test Script (All-in-One)

Save this as `quick-test.sh`:

```bash
#!/bin/bash
set -e

echo "=========================================="
echo "  QUICK PROJECT TEST"
echo "=========================================="

cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate

echo "1. Building images..."
docker compose -f infrastructure/docker/docker-compose.yml build

echo "2. Starting services..."
docker compose -f infrastructure/docker/docker-compose.yml up -d

echo "3. Waiting for services (30s)..."
sleep 30

echo "4. Checking service status..."
docker compose -f infrastructure/docker/docker-compose.yml ps

echo "5. Testing health endpoints..."
curl -s http://localhost:3000/health | jq -r '.status' && echo "✓ API healthy" || echo "✗ API unhealthy"
curl -s http://localhost:3000/health/db | jq -r '.status' && echo "✓ Database healthy" || echo "✗ Database unhealthy"
curl -s http://localhost:3000/health/redis | jq -r '.status' && echo "✓ Redis healthy" || echo "✗ Redis unhealthy"

echo "6. Testing API root..."
curl -s http://localhost:3000/ | jq -r '.success' && echo "✓ API responding" || echo "✗ API not responding"

echo ""
echo "=========================================="
echo "  TEST COMPLETE"
echo "=========================================="
```

Run it:
```bash
chmod +x quick-test.sh
./quick-test.sh
```
