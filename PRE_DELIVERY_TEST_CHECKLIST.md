# Pre-Delivery Testing Checklist

## Quick Start Testing Guide

Follow these steps to verify the platform is ready for client delivery.

---

## Phase 1: Infrastructure & Services Health Check

### 1.1 Start All Services
```bash
# Navigate to project root
cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate

# Start all services using production config
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d

# Wait for services to be healthy (30-60 seconds)
sleep 30
```

### 1.2 Verify Service Health
```bash
# Check all services are running
docker compose -f infrastructure/docker/docker-compose.prod.yml ps

# Expected: All services show "healthy" or "running"

# Test API health endpoint
curl http://localhost:3000/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "services": {
#     "database": "healthy",
#     "redis": "healthy"
#   }
# }
```

### 1.3 Verify Database Connection
```bash
# Test database health
curl http://localhost:3000/health/db | jq

# Expected: { "status": "healthy", "database": "connected" }
```

### 1.4 Verify Redis Connection
```bash
# Test Redis health
curl http://localhost:3000/health/redis | jq

# Expected: { "status": "healthy", "redis": "connected" }
```

### 1.5 Verify Intelligence Service
```bash
# Test Intelligence service health
curl http://localhost:8000/health | jq

# Expected: { "status": "healthy" }
```

**✅ CHECKPOINT 1**: All services must be healthy before proceeding.

---

## Phase 2: Database Setup & Migrations

### 2.1 Run Database Migrations
```bash
# Run all migrations
./scripts/run-migrations.sh

# Expected: All migrations complete successfully
# Check for any errors in output
```

### 2.2 Verify Schema
```bash
# Connect to database and verify tables exist
docker compose -f infrastructure/docker/docker-compose.prod.yml exec postgres psql -U platform_user -d platform_db -c "\dt"

# Expected: Should list all tables (tenants, users, documents, etc.)
```

**✅ CHECKPOINT 2**: Database schema must be complete.

---

## Phase 3: Automated End-to-End Testing

### 3.1 Run Homologation Test Suite
```bash
# Make script executable (if not already)
chmod +x tests/homologation-test-scenarios.sh

# Run all test scenarios
./tests/homologation-test-scenarios.sh

# Expected: All 8 scenarios pass
# - Scenario 1: Tenant & User Management ✓
# - Scenario 2: Document Processing ✓
# - Scenario 3: Document Intelligence ✓
# - Scenario 4: Auction Management ✓
# - Scenario 5: Workflow Automation ✓
# - Scenario 6: Financial Management ✓
# - Scenario 7: Investor Portal ✓
# - Scenario 8: Security & Isolation ✓
```

**✅ CHECKPOINT 3**: All automated tests must pass.

---

## Phase 4: Manual Feature Verification

### 4.1 Authentication Flow
```bash
# Test 1: Create Super Admin (if needed)
# Note: May require database seed or manual creation

# Test 2: Create Tenant
curl -X POST http://localhost:3000/api/v1/super-admin/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {super_admin_token}" \
  -d '{
    "name": "Test Client Tenant",
    "subscription_plan": "STANDARD",
    "contact_email": "admin@client.com"
  }'

# Test 3: Register User
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "{tenant_id}",
    "email": "test@client.com",
    "password": "Test123!Password",
    "first_name": "Test",
    "last_name": "User"
  }'

# Test 4: Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@client.com",
    "password": "Test123!Password"
  }'

# Expected: Returns access_token and refresh_token
```

### 4.2 Document Upload & Processing
```bash
# Test: Upload Document
curl -X POST http://localhost:3000/api/v1/documents/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user_token}" \
  -d '{
    "title": "Test Contract",
    "document_type": "legal_contract",
    "file_path": "/path/to/test.pdf",
    "description": "Test document"
  }'

# Wait for OCR processing (check status)
curl http://localhost:3000/api/v1/documents/{document_id} \
  -H "Authorization: Bearer {user_token}"

# Expected: 
# - Document created
# - OCR processing completes
# - CPO status assigned (VERDE/AMARELO/VERMELHO)
```

### 4.3 Auction Asset Management
```bash
# Test: Create Auction Asset
curl -X POST http://localhost:3000/api/v1/auctions/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user_token}" \
  -d '{
    "title": "Test Property",
    "asset_reference": "PROP-001"
  }'

# Test: Calculate ROI
curl -X POST http://localhost:3000/api/v1/auctions/assets/{asset_id}/roi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user_token}" \
  -d '{
    "acquisition_price_cents": 50000000,
    "expected_resale_value_cents": 60000000
  }'

# Expected: ROI calculated and returned
```

### 4.4 Financial Transactions
```bash
# Test: Create Transaction
curl -X POST http://localhost:3000/api/v1/finance/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user_token}" \
  -d '{
    "transaction_type": "PAYABLE",
    "amount_cents": 100000,
    "currency": "BRL",
    "transaction_date": "2024-01-15",
    "description": "Test transaction"
  }'

# Expected: Transaction created successfully
```

**✅ CHECKPOINT 4**: All manual features must work.

---

## Phase 5: Security Validation

### 5.1 Test Tenant Isolation
```bash
# Create two tenants and verify isolation
# Test: User from Tenant 1 cannot access Tenant 2 data

# Expected: Cross-tenant access returns 403/404/AUTHORIZATION_ERROR
```

### 5.2 Test RBAC
```bash
# Test: User without permission cannot access protected endpoint
curl -X POST http://localhost:3000/api/v1/super-admin/tenants \
  -H "Authorization: Bearer {regular_user_token}" \
  -d '{"name": "Unauthorized"}'

# Expected: 403 Forbidden or AUTHORIZATION_ERROR
```

### 5.3 Test Audit Logging
```bash
# Verify audit logs are created
curl http://localhost:3000/api/v1/audit-integrity/verify \
  -H "Authorization: Bearer {user_token}"

# Expected: Audit logs present, hash chain valid
```

### 5.4 Test Rate Limiting
```bash
# Make multiple rapid requests
for i in {1..150}; do
  curl http://localhost:3000/api/v1/documents \
    -H "Authorization: Bearer {user_token}"
done

# Expected: Rate limit enforced (429 Too Many Requests after limit)
```

**✅ CHECKPOINT 5**: All security measures must be enforced.

---

## Phase 6: Performance & Stability

### 6.1 Response Time Check
```bash
# Test API response times
time curl http://localhost:3000/health
time curl http://localhost:3000/api/v1/documents \
  -H "Authorization: Bearer {user_token}"

# Expected: 
# - Health check: < 100ms
# - API endpoints: < 2 seconds
```

### 6.2 Concurrent Request Test
```bash
# Test concurrent requests
for i in {1..10}; do
  curl http://localhost:3000/health &
done
wait

# Expected: All requests complete successfully
```

### 6.3 Service Restart Test
```bash
# Restart services and verify recovery
docker compose -f infrastructure/docker/docker-compose.prod.yml restart api
sleep 10
curl http://localhost:3000/health

# Expected: Service recovers and health check passes
```

**✅ CHECKPOINT 6**: Performance must meet requirements.

---

## Phase 7: Documentation & Configuration

### 7.1 Verify Documentation
- [ ] TECHNICAL_DOCUMENTATION.md exists and is complete
- [ ] HOMOLOGATION_TEST_PLAN.txt exists
- [ ] README.md (if exists) is up to date

### 7.2 Verify Environment Configuration
```bash
# Check .env file exists (in infrastructure/docker/)
ls -la infrastructure/docker/.env

# Verify required variables are documented
# - POSTGRES_PASSWORD
# - REDIS_PASSWORD
# - JWT_SECRET (min 64 chars)
# - CORS_ORIGIN (not "*")
```

### 7.3 Verify Docker Configuration
```bash
# Check production docker-compose exists
ls -la infrastructure/docker/docker-compose.prod.yml

# Verify all Dockerfiles exist
ls -la infrastructure/docker/Dockerfile.*
```

**✅ CHECKPOINT 7**: Documentation and configuration must be complete.

---

## Phase 8: Final Verification

### 8.1 Clean Test Data (Optional)
```bash
# Remove test tenants/users if needed
# Note: Use with caution in production
```

### 8.2 Verify Git Tag
```bash
# Check release tag exists
git tag -l v1.0.0

# Expected: v1.0.0 tag exists
```

### 8.3 Final Health Check
```bash
# Run comprehensive health check
curl http://localhost:3000/health/detailed | jq

# Expected: All services healthy, no errors
```

---

## Quick Test Script

Save this as `quick-pre-delivery-test.sh`:

```bash
#!/bin/bash
set -e

echo "=========================================="
echo "  PRE-DELIVERY TEST CHECKLIST"
echo "=========================================="
echo ""

# Phase 1: Services
echo "Phase 1: Checking Services..."
docker compose -f infrastructure/docker/docker-compose.prod.yml ps | grep -q "healthy" && echo "✓ Services healthy" || echo "✗ Services not healthy"

# Phase 2: Health Endpoints
echo "Phase 2: Testing Health Endpoints..."
curl -s http://localhost:3000/health | jq -r '.status' | grep -q "healthy" && echo "✓ API healthy" || echo "✗ API not healthy"
curl -s http://localhost:3000/health/db | jq -r '.status' | grep -q "healthy" && echo "✓ Database healthy" || echo "✗ Database not healthy"
curl -s http://localhost:3000/health/redis | jq -r '.status' | grep -q "healthy" && echo "✓ Redis healthy" || echo "✗ Redis not healthy"

# Phase 3: Run Automated Tests
echo "Phase 3: Running Automated Tests..."
if [ -f "tests/homologation-test-scenarios.sh" ]; then
    ./tests/homologation-test-scenarios.sh
else
    echo "✗ Test script not found"
fi

echo ""
echo "=========================================="
echo "  TEST COMPLETE"
echo "=========================================="
```

---

## Critical Issues to Fix Before Delivery

If any of these fail, **DO NOT** deliver to client:

1. ❌ **Services not starting** - Fix Docker configuration
2. ❌ **Database connection fails** - Check credentials and network
3. ❌ **Cross-tenant access allowed** - CRITICAL SECURITY ISSUE
4. ❌ **Audit logs not working** - Compliance requirement
5. ❌ **OCR processing fails** - Core functionality broken
6. ❌ **Authentication fails** - Users cannot access system
7. ❌ **Rate limiting not enforced** - Security risk
8. ❌ **TypeScript compilation errors** - Code quality issue

---

## Pre-Delivery Checklist Summary

- [ ] All services running and healthy
- [ ] Database migrations applied
- [ ] All 8 homologation scenarios pass
- [ ] Manual feature testing completed
- [ ] Security validation passed (tenant isolation, RBAC)
- [ ] Performance acceptable (< 2s response time)
- [ ] Documentation complete
- [ ] Environment variables configured
- [ ] Git tag v1.0.0 created
- [ ] No critical errors in logs
- [ ] Backup scripts tested
- [ ] Production docker-compose verified

---

## Client Handoff Information

When delivering to client, provide:

1. **Access Information**:
   - API URL
   - Admin credentials (if applicable)
   - Database access (if needed)

2. **Documentation**:
   - TECHNICAL_DOCUMENTATION.md
   - HOMOLOGATION_TEST_PLAN.txt
   - Deployment guide

3. **Configuration**:
   - Environment variables template
   - Docker Compose production config
   - Migration scripts

4. **Support Information**:
   - Health check endpoints
   - Log locations
   - Backup procedures

---

## Post-Delivery Monitoring

After delivery, monitor:

1. Service health (first 24 hours)
2. Error logs
3. Performance metrics
4. User feedback
5. Security alerts

---

**Ready for Delivery**: All checkpoints must pass ✅
