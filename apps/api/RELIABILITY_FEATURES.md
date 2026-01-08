# Reliability Features

## Overview

Production-ready reliability features including health checks, probes, structured logging, and error tracking hooks.

## Health Check Endpoints

### API Service

**Base Health Check:**
```
GET /health
```
Returns comprehensive health status with all dependency checks.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 1234.56,
  "environment": "production",
  "version": "v1",
  "service": "api",
  "checks": [
    {
      "name": "database",
      "status": "healthy",
      "message": "Database connection successful",
      "latency": 5.2
    },
    {
      "name": "redis",
      "status": "healthy",
      "message": "Redis connection successful",
      "latency": 2.1
    },
    {
      "name": "memory",
      "status": "healthy",
      "message": "Heap: 128MB / 256MB (50%)",
      "details": {
        "heapUsed": 128,
        "heapTotal": 256,
        "rss": 512,
        "heapUsagePercent": 50
      }
    }
  ]
}
```

**Readiness Probe:**
```
GET /health/ready
```
Returns 200 if ready, 503 if not ready.

**Liveness Probe:**
```
GET /health/live
```
Returns 200 if alive, 500 if dead.

**Startup Probe:**
```
GET /health/startup
```
Used during initial startup with longer timeout.

### Intelligence Service

**Health Check:**
```
GET /health
GET /health/ready
GET /health/live
```
Same endpoints as API service, adapted for Python/FastAPI.

## Kubernetes Probe Configurations

### Liveness Probe
- **Purpose:** Detect if container is dead and needs restart
- **Endpoint:** `/health/live`
- **Initial Delay:** 30s (allows app to start)
- **Period:** 10s
- **Timeout:** 3s
- **Failure Threshold:** 3 (restart after 3 failures)

### Readiness Probe
- **Purpose:** Detect if container is ready for traffic
- **Endpoint:** `/health/ready`
- **Initial Delay:** 5s (API), 10s (Intelligence)
- **Period:** 5s
- **Timeout:** 3s
- **Failure Threshold:** 3 (stop traffic after 3 failures)

### Startup Probe
- **Purpose:** Allow slow-starting containers more time
- **Endpoint:** `/health/startup` or `/health`
- **Initial Delay:** 0s
- **Period:** 5s
- **Timeout:** 3s
- **Failure Threshold:** 30 (allows up to 150s for startup)

## Structured Logging

### Log Format

**Development:**
```
2024-01-01 12:00:00 [info]: HTTP Request {"method":"GET","path":"/api/v1/users","ip":"127.0.0.1"}
```

**Production (JSON):**
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "HTTP Request",
  "service": "api",
  "environment": "production",
  "method": "GET",
  "path": "/api/v1/users",
  "ip": "127.0.0.1",
  "requestId": "abc-123",
  "userId": "user-456"
}
```

### Logging Examples

**HTTP Request:**
```typescript
StructuredLogger.logRequest(req, {
  customField: "value"
});
```

**HTTP Response:**
```typescript
StructuredLogger.logResponse(req, 200, 45, {
  contentLength: "1024"
});
```

**Database Operation:**
```typescript
StructuredLogger.logDatabase("SELECT", "users", 12, true, {
  rowsReturned: 10
});
```

**Cache Operation:**
```typescript
StructuredLogger.logCache("GET", "user:123", true, 2, {
  ttl: 3600
});
```

**Business Event:**
```typescript
StructuredLogger.logEvent("user.created", userId, {
  email: "user@example.com"
});
```

**Performance Metric:**
```typescript
StructuredLogger.logMetric("query_time", 45, "ms", {
  query: "SELECT * FROM users"
});
```

**Security Event:**
```typescript
StructuredLogger.logSecurity("failed_login", "high", req, {
  attempts: 5
});
```

## Error Tracking Hooks

### Error Tracking Service

**Track Error:**
```typescript
ErrorTrackingService.trackError(error, {
  request: req,
  userId: req.user?.id,
  tags: {
    errorType: "operational",
    statusCode: "400"
  },
  extra: {
    customData: "value"
  }
});
```

**Track Warning:**
```typescript
ErrorTrackingService.trackWarning("Rate limit approaching", {
  request: req,
  userId: req.user?.id,
  tags: {
    severity: "medium"
  }
});
```

**Set User Context:**
```typescript
ErrorTrackingService.setUserContext(userId, email, {
  role: "admin"
});
```

**Add Breadcrumb:**
```typescript
ErrorTrackingService.addBreadcrumb(
  "User clicked button",
  "user_action",
  "info",
  { buttonId: "submit" }
);
```

### Integration Placeholders

**Sentry (Future):**
```typescript
// TODO: Uncomment when Sentry is configured
// Sentry.captureException(error, {
//   tags: errorData.tags,
//   extra: errorData.extra,
//   user: { id: userId },
// });
```

**Datadog (Future):**
```typescript
// TODO: Uncomment when Datadog is configured
// tracer.trace('error', () => {
//   tracer.setTag('error.message', error.message);
//   throw error;
// });
```

## Kubernetes Compatibility

### Log Aggregation

Structured JSON logs are compatible with:
- **GCP Cloud Logging** - Automatic JSON parsing
- **ELK Stack** - JSON field extraction
- **Loki** - JSON log parsing
- **Datadog** - Automatic JSON parsing

### Health Check Integration

Probes are configured in Kubernetes deployments:
- Liveness probes → Container restarts
- Readiness probes → Traffic routing
- Startup probes → Slow startup handling

### Monitoring Integration

Health check endpoints can be monitored by:
- **Prometheus** - Scrape `/health` for metrics
- **GCP Monitoring** - HTTP uptime checks
- **Datadog** - Health check monitors
- **Custom dashboards** - Query health check data

## Best Practices

1. **Health Checks:**
   - Check all critical dependencies
   - Return appropriate HTTP status codes
   - Include latency metrics
   - Don't check non-critical dependencies in readiness

2. **Probes:**
   - Use startup probes for slow-starting services
   - Set appropriate timeouts
   - Don't make probes too aggressive
   - Use separate endpoints for different probe types

3. **Logging:**
   - Always use structured logging
   - Include request IDs for tracing
   - Log at appropriate levels
   - Don't log sensitive data

4. **Error Tracking:**
   - Track all errors with context
   - Include user information when available
   - Add breadcrumbs for debugging
   - Don't break application on tracking errors

## File Structure

```
apps/api/src/
├── services/
│   ├── health.ts              # Health check service
│   └── error-tracking.ts      # Error tracking hooks
├── routes/
│   └── health.ts              # Health check endpoints
├── utils/
│   └── logger-enhanced.ts     # Structured logging
└── middleware/
    └── logger-enhanced.ts     # Enhanced logging middleware

services/intelligence/src/
├── health.py                  # Health check service
└── main.py                    # FastAPI app with health checks

infrastructure/k8s/
└── probes-config.yaml         # Kubernetes probe configurations
```

