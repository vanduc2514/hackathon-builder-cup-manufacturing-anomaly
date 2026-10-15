"""API Entrypoint: FastAPI backend server serving incident board APIs and WebSocket/SSE streams."""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.agents.orchestrator import orchestrator
from backend.api.routes_auth import router as auth_router
from backend.api.routes_gemini_live import router as gemini_live_router
from backend.api.routes_impact import router as impact_router
from backend.api.routes_incidents import router as incidents_router
from backend.api.routes_knowledge import router as knowledge_router
from backend.api.routes_oee import router as oee_router
from backend.api.routes_simulation import router as simulation_router
from backend.api.routes_telemetry import router as telemetry_router
from backend.core.auth import require_user
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.rate_limit import RateLimitMiddleware

logger = logging.getLogger(__name__)
logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Reloads open incident and starts Pub/Sub subscribers; stops them on shutdown."""
    import asyncio

    from backend.core.pubsub_manager import pubsub_manager

    try:
        reloaded = blackboard.load_open_incident()
        if reloaded:
            logger.info(
                "Recovered open incident %s (status=%s) from Firestore on startup",
                reloaded.incident_id,
                reloaded.status,
            )
    except Exception as exc:
        logger.warning("Failed to recover incident from Firestore on startup: %s", exc)

    orchestrator._loop = asyncio.get_running_loop()
    pubsub_manager.start_subscribers()
    try:
        yield
    finally:
        pubsub_manager.stop_subscribers()
        await orchestrator.cancel()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Kaizen Agent: Product-first AI Team for Manufacturing Anomaly Detection and Root-Cause Tracing",
    # The schema maps every route, so production serves neither it nor /docs and /redoc
    # (FastAPI mounts both only when openapi_url is set).
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

# Every request, incl. /health, login and streams; added before CORS so CORS stays outermost
# and 429 responses still carry the CORS headers the browser needs to read them.
app.add_middleware(RateLimitMiddleware)

# The Hosting rewrite cannot carry SSE, so the frontends open streams straight against Cloud
# Run; only those origins may read responses cross-origin.
if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET"],
    )

# Every /api router except login requires a signed token; a router added without it is public.
_auth = [Depends(require_user)]
app.include_router(auth_router)
app.include_router(incidents_router, dependencies=_auth)
app.include_router(simulation_router, dependencies=_auth)
app.include_router(gemini_live_router, dependencies=_auth)
app.include_router(impact_router, dependencies=_auth)
app.include_router(telemetry_router, dependencies=_auth)
app.include_router(knowledge_router, dependencies=_auth)
app.include_router(oee_router, dependencies=_auth)


@app.get("/healthz", include_in_schema=False)
@app.get("/health")
@app.get("/healthz")
async def health_check():
    from backend.core.pubsub_manager import pubsub_manager

    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.version,
        "gcp_project": settings.gcp_project_id,
        "pubsub_available": pubsub_manager.is_available(),
    }
