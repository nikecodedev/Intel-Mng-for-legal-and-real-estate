# Complete Testing Solution - Copy-Paste Commands

## ✅ FIXED: Environment Variables Issue

The API was crashing due to missing environment variables. These have been fixed:
- ✅ `CORS_ORIGIN` added to docker-compose.yml
- ✅ `JWT_SECRET` updated to 64+ characters
- ✅ `REDIS_PASSWORD` added to docker-compose.yml

---

## 🚀 Quick Start Testing (All-in-One)

### Option 1: Use the Quick Test Script
```bash
cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate
./quick-test.sh
```

### Option 2: Manual Step-by-Step

#### Step 1: Navigate to Project
```bash
cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate
```

#### Step 2: Stop Any Running Containers
```bash
docker compose -f infrastructure/docker/docker-compose.yml down
```

#### Step 3: Build Images
```bash
docker compose -f infrastructure/docker/docker-compose.yml build
```

#### Step 4: Start All Services
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

#### Step 5: Wait for Services (30 seconds)
```bash
sleep 30
```

#### Step 6: Check Service Status
```bash
docker compose -f infrastructure/docker/docker-compose.yml ps
```

**Expected Output:**
```
NAME                    STATUS
platform-postgres       healthy
platform-redis          healthy
platform-api            healthy
platform-intelligence   healthy (or starting)
```

#### Step 7: Test Health Endpoints
```bash
# Main API health
curl http://localhost:3000/health

# Database health
curl http://localhost:3000/health/db

# Redis health
curl http://localhost:3000/health/redis

# Intelligence service health
curl http://localhost:8000/health

# API root
curl http://localhost:3000/
```

#### Step 8: Run Database Migrations
```bash
./scripts/run-migrations.sh
```

#### Step 9: Run Automated Test Suite
```bash
chmod +x tests/homologation-test-scenarios.sh
./tests/homologation-test-scenarios.sh
```

---

## 🔍 Verification Commands

### Check All Services Are Running
```bash
docker compose -f infrastructure/docker/docker-compose.yml ps
```

### Check Service Logs
```bash
# API logs
docker compose -f infrastructure/docker/docker-compose.yml logs api --tail 50

# All services logs
docker compose -f infrastructure/docker/docker-compose.yml logs --tail 50
```

### Test Database Connection
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec postgres psql -U platform_user -d platform_db -c "SELECT version();"
```

### Test Redis Connection
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec redis redis-cli ping
```

### Check Resource Usage
```bash
docker stats --no-stream
```

---

## ✅ Success Indicators

All of these should return success:

1. **Service Status**: All services show "healthy"
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml ps
   ```

2. **Health Endpoints**: All return 200 OK
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/health/db
   curl http://localhost:3000/health/redis
   ```

3. **API Responds**: Root endpoint works
   ```bash
   curl http://localhost:3000/
   ```

4. **No Errors in Logs**: Check for critical errors
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml logs api | grep -i error
   ```

---

## 🛠️ Troubleshooting

### If API is Restarting

Check logs:
```bash
docker compose -f infrastructure/docker/docker-compose.yml logs api --tail 50
```

Common issues:
- Missing environment variables (CORS_ORIGIN, JWT_SECRET, REDIS_PASSWORD)
- Database connection issues
- Port conflicts

### If Services Won't Start

Check for port conflicts:
```bash
netstat -tulpn | grep -E "3000|5432|6379|8000"
```

Check Docker resources:
```bash
docker system df
```

### Restart Specific Service
```bash
docker compose -f infrastructure/docker/docker-compose.yml restart api
```

### View Real-Time Logs
```bash
docker compose -f infrastructure/docker/docker-compose.yml logs -f api
```

---

## 📋 Complete Test Checklist

Run these commands in order:

```bash
# 1. Navigate
cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate

# 2. Clean start
docker compose -f infrastructure/docker/docker-compose.yml down

# 3. Build
docker compose -f infrastructure/docker/docker-compose.yml build

# 4. Start
docker compose -f infrastructure/docker/docker-compose.yml up -d

# 5. Wait
sleep 30

# 6. Check status
docker compose -f infrastructure/docker/docker-compose.yml ps

# 7. Test health
curl http://localhost:3000/health
curl http://localhost:3000/health/db
curl http://localhost:3000/health/redis
curl http://localhost:8000/health

# 8. Test API
curl http://localhost:3000/

# 9. Run migrations
./scripts/run-migrations.sh

# 10. Run automated tests
./tests/homologation-test-scenarios.sh
```

---

## 🎯 Expected Results

✅ **All services healthy**
✅ **Health endpoints return 200 OK**
✅ **API responds correctly**
✅ **Database migrations complete**
✅ **Automated tests pass**

---

## 📝 Notes

- First build takes 5-10 minutes
- Services need 30 seconds to become healthy
- API requires: CORS_ORIGIN, JWT_SECRET (64+ chars), REDIS_PASSWORD
- All environment variables are in `infrastructure/docker/.env`

---

**Project is now ready for testing!** 🎉
