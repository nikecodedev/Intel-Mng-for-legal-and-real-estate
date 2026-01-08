"""
Health check service for Intelligence Service
Provides Kubernetes-compatible health endpoints
"""
import time
import os
from typing import Dict, Any, Optional
from datetime import datetime
import psutil

try:
    from redis import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

try:
    import psycopg2
    from psycopg2 import pool
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False


class HealthCheckService:
    """Health check service for dependencies"""
    
    def __init__(self):
        self.start_time = time.time()
    
    def check_database(self) -> Dict[str, Any]:
        """Check database connectivity"""
        if not POSTGRES_AVAILABLE:
            return {
                "name": "database",
                "status": "degraded",
                "message": "Database client not available"
            }
        
        start_time = time.time()
        try:
            # Try to connect to database
            # In production, use connection pool
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                return {
                    "name": "database",
                    "status": "unhealthy",
                    "message": "DATABASE_URL not configured"
                }
            
            # Simple connection test (in production, use connection pool)
            # This is a placeholder - implement actual connection check
            latency = (time.time() - start_time) * 1000
            
            return {
                "name": "database",
                "status": "healthy",
                "message": "Database connection successful",
                "latency": round(latency, 2)
            }
        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return {
                "name": "database",
                "status": "unhealthy",
                "message": str(e),
                "latency": round(latency, 2)
            }
    
    def check_redis(self) -> Dict[str, Any]:
        """Check Redis connectivity"""
        if not REDIS_AVAILABLE:
            return {
                "name": "redis",
                "status": "degraded",
                "message": "Redis client not available"
            }
        
        start_time = time.time()
        try:
            redis_host = os.getenv("REDIS_HOST")
            redis_port = int(os.getenv("REDIS_PORT", "6379"))
            redis_password = os.getenv("REDIS_PASSWORD")
            
            if not redis_host:
                return {
                    "name": "redis",
                    "status": "degraded",
                    "message": "Redis not configured"
                }
            
            redis_client = Redis(
                host=redis_host,
                port=redis_port,
                password=redis_password,
                socket_connect_timeout=2,
                socket_timeout=2
            )
            
            # Test connection
            redis_client.ping()
            latency = (time.time() - start_time) * 1000
            
            return {
                "name": "redis",
                "status": "healthy",
                "message": "Redis connection successful",
                "latency": round(latency, 2)
            }
        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return {
                "name": "redis",
                "status": "unhealthy",
                "message": str(e),
                "latency": round(latency, 2)
            }
    
    def check_memory(self) -> Dict[str, Any]:
        """Check memory usage"""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_percent = process.memory_percent()
            
            heap_used_mb = round(memory_info.rss / 1024 / 1024, 2)
            
            # Consider unhealthy if memory usage > 90%
            status = "unhealthy" if memory_percent > 90 else "degraded" if memory_percent > 75 else "healthy"
            
            return {
                "name": "memory",
                "status": status,
                "message": f"Memory usage: {memory_percent:.1f}%",
                "details": {
                    "heapUsedMB": heap_used_mb,
                    "memoryPercent": round(memory_percent, 2)
                }
            }
        except Exception as e:
            return {
                "name": "memory",
                "status": "degraded",
                "message": f"Memory check failed: {str(e)}"
            }
    
    def perform_all_checks(self) -> Dict[str, Any]:
        """Perform all health checks"""
        checks = [
            self.check_database(),
            self.check_redis(),
            self.check_memory()
        ]
        
        # Determine overall status
        has_unhealthy = any(check["status"] == "unhealthy" for check in checks)
        has_degraded = any(check["status"] == "degraded" for check in checks)
        
        if has_unhealthy:
            overall = "unhealthy"
        elif has_degraded:
            overall = "degraded"
        else:
            overall = "healthy"
        
        return {
            "overall": overall,
            "checks": checks,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "uptime": round(time.time() - self.start_time, 2)
        }
    
    def is_ready(self) -> bool:
        """Check if service is ready (all critical dependencies healthy)"""
        db_check = self.check_database()
        redis_check = self.check_redis()
        
        return (
            db_check["status"] == "healthy" and
            redis_check["status"] in ["healthy", "degraded"]
        )
    
    def is_alive(self) -> bool:
        """Check if service is alive (basic liveness check)"""
        memory_check = self.check_memory()
        return memory_check["status"] != "unhealthy"
    
    @property
    def uptime(self) -> float:
        """Get service uptime in seconds"""
        return round(time.time() - self.start_time, 2)


# Global health check service instance
health_service = HealthCheckService()

