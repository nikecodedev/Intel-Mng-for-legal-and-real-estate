"""
Intelligence Services - Main entry point
Production-ready with health checks and structured logging
"""
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
import logging
import json
from datetime import datetime
from contextlib import asynccontextmanager

from health import health_service

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)

logger = logging.getLogger(__name__)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    logger.info("Intelligence service starting up", extra={
        "service": "intelligence",
        "environment": os.getenv("ENV", "development"),
        "version": "1.0.0"
    })
    yield
    logger.info("Intelligence service shutting down", extra={
        "service": "intelligence"
    })


app = FastAPI(
    title="Intelligence Services",
    description="AI/ML services for the platform",
    version="1.0.0",
    lifespan=lifespan
)


# Structured logging middleware
@app.middleware("http")
async def structured_logging_middleware(request: Request, call_next):
    """Structured logging middleware"""
    start_time = datetime.utcnow()
    
    # Log request
    logger.info("HTTP Request", extra={
        "service": "intelligence",
        "method": request.method,
        "path": request.url.path,
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "request_id": request.headers.get("x-request-id"),
    })
    
    try:
        response = await call_next(request)
        process_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Log response
        log_level = logging.ERROR if response.status_code >= 500 else \
                   logging.WARN if response.status_code >= 400 else logging.INFO
        
        logger.log(log_level, "HTTP Response", extra={
            "service": "intelligence",
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "response_time_ms": round(process_time, 2),
            "request_id": request.headers.get("x-request-id"),
        })
        
        return response
    except Exception as e:
        process_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        logger.error("Request failed", extra={
            "service": "intelligence",
            "method": request.method,
            "path": request.url.path,
            "error": str(e),
            "response_time_ms": round(process_time, 2),
            "request_id": request.headers.get("x-request-id"),
        }, exc_info=True)
        raise


# Error tracking placeholder
def track_error(error: Exception, context: dict = None):
    """Placeholder for error tracking SaaS integration"""
    logger.error("Error tracked", extra={
        "service": "intelligence",
        "error_type": type(error).__name__,
        "error_message": str(error),
        "context": context or {},
    })
    # TODO: Integrate with error tracking SaaS (Sentry, Datadog, etc.)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler with error tracking"""
    track_error(exc, {
        "method": request.method,
        "path": request.url.path,
        "request_id": request.headers.get("x-request-id"),
    })
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An internal error occurred",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        }
    )


@app.get("/health")
async def health_check():
    """Comprehensive health check endpoint"""
    health_data = health_service.perform_all_checks()
    
    status_code = 200 if health_data["overall"] in ["healthy", "degraded"] else 503
    
    logger.info("Health check performed", extra={
        "service": "intelligence",
        "overall": health_data["overall"],
        "checks": [c["name"] for c in health_data["checks"]],
    })
    
    return JSONResponse(
        status_code=status_code,
        content={
            "success": health_data["overall"] == "healthy",
            "status": health_data["overall"],
            "timestamp": health_data["timestamp"],
            "uptime": health_data["uptime"],
            "environment": os.getenv("ENV", "development"),
            "version": "1.0.0",
            "service": "intelligence",
            "checks": health_data["checks"],
        }
    )


@app.get("/health/ready")
async def readiness_probe():
    """Kubernetes readiness probe"""
    is_ready = health_service.is_ready()
    
    if is_ready:
        logger.debug("Readiness check passed", extra={"service": "intelligence"})
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "status": "ready",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        )
    else:
        logger.warn("Readiness check failed", extra={"service": "intelligence"})
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "status": "not ready",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "message": "Service dependencies are not healthy",
            }
        )


@app.get("/health/live")
async def liveness_probe():
    """Kubernetes liveness probe"""
    is_alive = health_service.is_alive()
    
    if is_alive:
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "status": "alive",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "uptime": health_service.uptime,
            }
        )
    else:
        logger.error("Liveness check failed", extra={"service": "intelligence"})
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "status": "dead",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "message": "Service is not responding",
            }
        )


@app.get("/api/v1")
async def api_info():
    """API information"""
    return {
        "success": True,
        "message": "Intelligence Services API v1",
        "version": "1.0.0",
        "service": "intelligence"
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_config=None  # Use our custom logging
    )
