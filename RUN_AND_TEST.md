# How to Run and Test the Project

This guide will help you set up, run, and test the entire platform.

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Node.js 18+** (if running locally)
- **PostgreSQL 14+** (if running locally without Docker)
- **Redis 6+** (if running locally without Docker)

## Quick Start with Docker (Recommended)

### 1. Navigate to Docker Directory

```bash
cd infrastructure/docker
```

### 2. Create Required Directories

```bash
mkdir -p data/postgres data/redis
```

### 3. Set Environment Variables (Optional)

Create a `.env` file in `infrastructure/docker/`:

```bash
# Database
POSTGRES_USER=platform_user
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=platform_db
POSTGRES_PORT=5432

# Redis
REDIS_PASSWORD=secure_redis_password
REDIS_PORT=6379
REDIS_DB=0

# API
API_PORT=3000
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long
LOG_LEVEL=info

# Intelligence Service
INTELLIGENCE_PORT=8000
```

### 4. Build and Start Services

```bash
# Build all images
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check service status
docker compose ps
```

### 5. Wait for Services to be Healthy

```bash
# Check health status
docker compose ps

# All services should show "healthy" status
```

### 6. Run Database Migrations

```bash
# Execute migrations inside the API container
docker compose exec api npm run migrate

# Or if you have a migrate script, run:
docker compose exec api sh -c "cd /app && npm run migrate"
```

**Note:** If migrations aren't set up as a script, you can run them manually:

```bash
# Connect to postgres container
docker compose exec postgres psql -U platform_user -d platform_db

# Then run migrations manually or copy them:
docker compose cp apps/api/database/migrations postgres:/tmp/migrations
docker compose exec postgres psql -U platform_user -d platform_db -f /tmp/migrations/001_*.sql
```

## Running Locally (Without Docker)

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install API dependencies
cd apps/api
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in `apps/api/`:

```bash
NODE_ENV=development
PORT=3000
API_VERSION=v1
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://platform_user:password@localhost:5432/platform_db

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Start PostgreSQL and Redis

```bash
# Using Docker for just DB services
cd infrastructure/docker
docker compose up -d postgres redis

# Or use local installations
# PostgreSQL: pg_ctl start
# Redis: redis-server
```

### 4. Run Migrations

```bash
cd apps/api

# If you have a migrate script
npm run migrate

# Or manually
psql -U platform_user -d platform_db -f database/migrations/001_*.sql
# ... repeat for all migrations
```

### 5. Start the API

```bash
cd apps/api

# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

## Testing the Application

### 1. Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Liveness probe
curl http://localhost:3000/health/live

# Readiness probe (checks DB + Redis)
curl http://localhost:3000/health/ready

# Detailed health check
curl http://localhost:3000/health/detailed

# Prometheus metrics
curl http://localhost:3000/health/metrics
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime_seconds": 123
}
```

### 2. API Root Endpoint

```bash
curl http://localhost:3000/

# Expected:
# {
#   "success": true,
#   "message": "Legal & Real Estate Platform API",
#   "version": "v1",
#   "documentation": "/api/v1"
# }
```

### 3. Authentication (Create User & Login)

```bash
# Register a new user (if endpoint exists)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "first_name": "Test",
    "last_name": "User"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'

# Save the token from response
export TOKEN="your_jwt_token_here"
```

### 4. Test Authenticated Endpoints

```bash
# Get current user
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Get dashboards
curl -X GET http://localhost:3000/api/v1/dashboards \
  -H "Authorization: Bearer $TOKEN"

# Get KPIs
curl -X GET http://localhost:3000/api/v1/dashboards/kpis/all \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Test Rate Limiting

```bash
# Make multiple rapid requests
for i in {1..110}; do
  curl -X GET http://localhost:3000/api/v1/dashboards \
    -H "Authorization: Bearer $TOKEN" \
    -w "\nStatus: %{http_code}\n"
done

# After 100 requests, you should see:
# Status: 429 (Too Many Requests)
# With headers:
# X-RateLimit-Limit: 1000
# X-RateLimit-Remaining: 0
# Retry-After: 60
```

### 6. Test Health Checks

```bash
# Test all health endpoints
echo "=== Basic Health ==="
curl http://localhost:3000/health

echo -e "\n=== Liveness ==="
curl http://localhost:3000/health/live

echo -e "\n=== Readiness ==="
curl http://localhost:3000/health/ready

echo -e "\n=== Detailed ==="
curl http://localhost:3000/health/detailed

echo -e "\n=== Metrics ==="
curl http://localhost:3000/health/metrics
```

### 7. Test Monitoring Metrics

```bash
# Get application metrics (requires auth)
curl -X GET http://localhost:3000/api/v1/metrics \
  -H "Authorization: Bearer $TOKEN"

# Expected response includes:
# - requests (total, successful, failed)
# - performance (response times)
# - errors
# - system (memory, CPU, uptime)
# - database (connection pool)
# - cache (hit rate)
```

### 8. Test Background Jobs (if implemented)

```bash
# Add a job (example)
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "queue": "email-queue",
    "data": {
      "to": "test@example.com",
      "subject": "Test",
      "body": "Test email"
    }
  }'
```

## Testing Production Features

### 1. Rate Limiting Test Script

Create `test-rate-limit.sh`:

```bash
#!/bin/bash
TOKEN="your_token_here"
ENDPOINT="http://localhost:3000/api/v1/dashboards"

echo "Testing rate limiting..."
for i in {1..105}; do
  response=$(curl -s -w "\n%{http_code}" -X GET "$ENDPOINT" \
    -H "Authorization: Bearer $TOKEN")
  status=$(echo "$response" | tail -n1)
  
  if [ "$status" = "429" ]; then
    echo "Rate limit hit at request $i"
    break
  fi
  
  if [ $((i % 10)) -eq 0 ]; then
    echo "Request $i: Status $status"
  fi
done
```

### 2. Load Testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/dashboards

# Using wrk
wrk -t4 -c100 -d30s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/dashboards
```

### 3. Database Connection Pool Test

```bash
# Check database metrics
curl -X GET http://localhost:3000/api/v1/metrics \
  -H "Authorization: Bearer $TOKEN" | jq '.metrics.database'
```

### 4. Redis Cache Test

```bash
# Check cache metrics
curl -X GET http://localhost:3000/api/v1/metrics \
  -H "Authorization: Bearer $TOKEN" | jq '.metrics.cache'
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker compose logs api
docker compose logs postgres
docker compose logs redis

# Check if ports are in use
netstat -tulpn | grep -E ':(3000|5432|6379)'

# Restart services
docker compose restart
```

### Database Connection Errors

```bash
# Test database connection
docker compose exec postgres psql -U platform_user -d platform_db -c "SELECT 1;"

# Check if database exists
docker compose exec postgres psql -U platform_user -l

# Check environment variables
docker compose exec api env | grep DATABASE
```

### Redis Connection Errors

```bash
# Test Redis connection
docker compose exec redis redis-cli -a your_password ping

# Check Redis logs
docker compose logs redis

# Check environment variables
docker compose exec api env | grep REDIS
```

### Migration Issues

```bash
# Check migration files
ls -la apps/api/database/migrations/

# Run migrations manually
docker compose exec postgres psql -U platform_user -d platform_db \
  -f /path/to/migration.sql

# Check current schema
docker compose exec postgres psql -U platform_user -d platform_db \
  -c "\dt"
```

### Rate Limiting Not Working

```bash
# Check Redis is running
docker compose exec redis redis-cli ping

# Check rate limit headers in response
curl -v http://localhost:3000/api/v1/dashboards \
  -H "Authorization: Bearer $TOKEN" 2>&1 | grep -i ratelimit
```

## Development Workflow

### 1. Make Code Changes

```bash
# Edit files in apps/api/src/
# Changes are automatically picked up in dev mode
```

### 2. Rebuild Docker Images (if needed)

```bash
# Rebuild specific service
docker compose build api

# Rebuild and restart
docker compose up -d --build api
```

### 3. View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail=100 api
```

### 4. Access Container Shell

```bash
# API container
docker compose exec api sh

# Postgres container
docker compose exec postgres psql -U platform_user -d platform_db

# Redis container
docker compose exec redis redis-cli
```

## Testing Checklist

- [ ] All services start successfully
- [ ] Health checks return 200
- [ ] Database migrations run successfully
- [ ] Can create user and login
- [ ] JWT token works for authenticated requests
- [ ] Rate limiting works (429 after limit)
- [ ] Health check endpoints work
- [ ] Metrics endpoint returns data
- [ ] Database connection pool is configured
- [ ] Redis caching works
- [ ] Background jobs process (if implemented)
- [ ] Error handling works correctly

## Next Steps

1. **Set up monitoring**: Configure Prometheus/Grafana
2. **Set up logging**: Configure log aggregation (ELK, Loki)
3. **Set up CI/CD**: Configure automated testing and deployment
4. **Load testing**: Run comprehensive load tests
5. **Security audit**: Review security configurations
6. **Documentation**: Update API documentation

## Useful Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes data)
docker compose down -v

# View service status
docker compose ps

# Restart a service
docker compose restart api

# Scale services
docker compose up -d --scale api=3

# View resource usage
docker stats

# Clean up
docker compose down
docker system prune -a
```

## Support

For issues or questions:
1. Check logs: `docker compose logs`
2. Check health: `curl http://localhost:3000/health/detailed`
3. Review documentation: `PRODUCTION_CONFIG.md`
4. Check environment variables are set correctly
