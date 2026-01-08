# Reliability Features Summary

## Overview

Production-ready reliability features including health checks, Kubernetes probes, structured logging, and error tracking hooks.

## Health Check Endpoints

### API Service

**Comprehensive Health Check:**
```bash
GET /health
```
Returns detailed health status with all dependency checks.

**Readiness Probe:**
```bash
GET /health/ready
```
Returns 200 if ready, 503 if not ready. Used by Kubernetes to route traffic.

**Liveness Probe:**
```bash
GET /health/live
```
Returns 200 if alive, 500 if dead. Used by Kubernetes to restart containers.

**Startup Probe:**
```bash
GET /health/startup
```
Used during initial startup with longer timeout.

### Intelligence Service (Python)

Same endpoints as API service:
- `GET /health` - Comprehensive health check
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

## Kubernetes Probe Configurations

### API Service Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /health/startup
    port: 3000
  initialDelaySeconds: 0
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 30
```

### Intelligence Service Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 0
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 30
```

## Structured Logging Examples

### API Service (TypeScript)

**HTTP Request:**
```typescript
import { StructuredLogger } from '../utils/logger-enhanced';

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

**Business Event:**
```typescript
StructuredLogger.logEvent("user.created", userId, {
  email: "user@example.com"
});
```

**Security Event:**
```typescript
StructuredLogger.logSecurity("failed_login", "high", req, {
  attempts: 5
});
```

### Intelligence Service (Python)

**Structured Logging:**
```python
logger.info("HTTP Request", extra={
    "service": "intelligence",
    "method": request.method,
    "path": request.url.path,
    "ip": request.client.host,
    "request_id": request.headers.get("x-request-id"),
})
```

## Error Tracking Hooks

### Track Error

```typescript
import { ErrorTrackingService } from '../services/error-tracking';

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

### Track Warning

```typescript
ErrorTrackingService.trackWarning("Rate limit approaching", {
  request: req,
  userId: req.user?.id,
  tags: {
    severity: "medium"
  }
});
```

### Set User Context

```typescript
ErrorTrackingService.setUserContext(userId, email, {
  role: "admin"
});
```

### Add Breadcrumb

```typescript
ErrorTrackingService.addBreadcrumb(
  "User clicked button",
  "user_action",
  "info",
  { buttonId: "submit" }
);
```

## Log Output Examples

### Development (Human-readable)

```
2024-01-01 12:00:00 [info]: HTTP Request {"method":"GET","path":"/api/v1/users","ip":"127.0.0.1"}
2024-01-01 12:00:01 [info]: HTTP Response {"method":"GET","path":"/api/v1/users","statusCode":200,"responseTime":45}
```

### Production (JSON)

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

## Kubernetes Compatibility

### Log Aggregation

Structured JSON logs work with:
- **GCP Cloud Logging** - Automatic JSON parsing
- **ELK Stack** - JSON field extraction
- **Loki** - JSON log parsing
- **Datadog** - Automatic JSON parsing

### Health Check Integration

- **Liveness probes** → Container restarts on failure
- **Readiness probes** → Traffic routing control
- **Startup probes** → Slow startup handling

### Monitoring

Health endpoints can be monitored by:
- **Prometheus** - Scrape `/health` for metrics
- **GCP Monitoring** - HTTP uptime checks
- **Custom dashboards** - Query health data

## Files Created

### API Service
- `src/services/health.ts` - Health check service
- `src/services/error-tracking.ts` - Error tracking hooks
- `src/routes/health.ts` - Health endpoints
- `src/utils/logger-enhanced.ts` - Structured logging
- `src/middleware/logger-enhanced.ts` - Enhanced logging middleware

### Intelligence Service
- `src/health.py` - Health check service
- `src/main.py` - FastAPI app with health checks and logging

### Kubernetes
- `infrastructure/k8s/probes-config.yaml` - Probe configurations
- Updated deployments with startup probes

## Next Steps

1. **Integrate Error Tracking SaaS:**
   - Uncomment Sentry/Datadog code in `error-tracking.ts`
   - Configure API keys
   - Set up error alerts

2. **Configure Log Aggregation:**
   - Set up Cloud Logging (GCP)
   - Or configure ELK/Loki stack
   - Create log-based alerts

3. **Set up Monitoring:**
   - Configure Prometheus scraping
   - Create Grafana dashboards
   - Set up alerting rules

4. **Tune Probe Settings:**
   - Adjust timeouts based on actual startup times
   - Fine-tune failure thresholds
   - Monitor probe success rates

