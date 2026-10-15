"""API Routes: Real-time Overall Equipment Effectiveness (OEE) metrics and loss attribution."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from backend.core.models import LineOeeResponse
from backend.tools.production_stats import (
    DEFAULT_LINE_ID,
    calculate_production_stats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/oee", tags=["oee"])


@router.get(
    "",
    response_model=LineOeeResponse,
    summary="Get real-time OEE metrics and loss attribution for a production line",
)
@router.get(
    "/",
    response_model=LineOeeResponse,
    include_in_schema=False,
)
async def get_line_oee(
    line_id: str = Query(DEFAULT_LINE_ID, description="Target production line ID"),
    window_minutes: int = Query(60, ge=5, le=1440, description="Analysis time window in minutes"),
) -> LineOeeResponse:
    """Calculates live A x P x Q factors, machine breakdowns, trend series and loss waterfall.

    Replaces client-side synthetic simulations with real BigQuery traceability records,
    sensor telemetry spindle speed, and active incident repair downtime.
    """
    logger.info("Computing real OEE metrics for line=%s, window=%d min", line_id, window_minutes)
    return calculate_production_stats(line_id=line_id, window_minutes=window_minutes)
