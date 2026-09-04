from contextlib import asynccontextmanager
from fastapi import FastAPI, status, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.logging import logger
from app.core.database import AsyncSessionLocal
from app.api.router import api_router
from app.websocket.router import router as websocket_router
from app.services.storage_service import storage_service
from app.workers.scheduler import job_scheduler
from app.events.pg_listener import pg_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Initializing ZeroTask Self-Hosted Backend...")
    try:
        storage_service.ensure_buckets()
    except Exception as e:
        logger.warning(f"Could not initialize MinIO buckets at startup: {e}")

    try:
        job_scheduler.start()
    except Exception as e:
        logger.error(f"Failed starting APScheduler: {e}")

    try:
        await pg_listener.start()
    except Exception as e:
        logger.warning(f"PostgreSQL event listener deferred: {e}")

    logger.info("ZeroTask Self-Hosted Backend started successfully")
    yield

    # --- Shutdown ---
    logger.info("Shutting down ZeroTask Backend...")
    try:
        job_scheduler.shutdown()
    except Exception:
        pass
    try:
        await pg_listener.stop()
    except Exception:
        pass
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# CORS Middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health", tags=["Observability"])
async def health_check():
    """Basic availability health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/ready", tags=["Observability"])
async def readiness_check(response: Response):
    """
    Verifies that critical dependencies (PostgreSQL database and MinIO storage)
    are reachable and operational.
    """
    db_ok = False
    storage_ok = False

    # Check Database
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        logger.error(f"Readiness check failed on database: {e}")

    # Check Storage
    try:
        client = storage_service.get_client()
        client.list_buckets()
        storage_ok = True
    except Exception as e:
        logger.error(f"Readiness check failed on MinIO: {e}")

    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unhealthy", "database": "disconnected", "storage": "ok" if storage_ok else "disconnected"}

    return {
        "status": "ready",
        "database": "connected",
        "storage": "connected" if storage_ok else "warning",
    }


# Include Routers
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(websocket_router)


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "ZeroTask Self-Hosted API Gateway",
        "version": "1.0.0",
        "documentation": f"{settings.API_V1_STR}/docs",
    }
