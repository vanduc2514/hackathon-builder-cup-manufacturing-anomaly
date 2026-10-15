"""API Routes: Fleet registry and machine asset layout."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from backend.core.models import FleetRegistryResponse
from backend.tools.fleet_registry import get_fleet_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fleet", tags=["fleet"])


@router.get(
    "",
    response_model=FleetRegistryResponse,
    summary="Get cell fleet registry and operational configuration targets",
)
@router.get(
    "/",
    response_model=FleetRegistryResponse,
    include_in_schema=False,
)
async def get_fleet() -> FleetRegistryResponse:
    """Returns the registered machine assets and line-level operational targets.

    Provides machine types (CNC, IM), bay locations, tooling operations,
    and cell availability/MTTR/OEE targets configured for the line.
    """
    logger.info("Serving fleet registry")
    return get_fleet_registry()
