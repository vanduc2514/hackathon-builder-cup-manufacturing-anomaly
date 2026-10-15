"""API Routes: Statistical Process Control (SPC) run chart defect series and control limits."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Query

from backend.core.blackboard import blackboard
from backend.core.models import SpcSeriesResponse
from backend.tools.production_stats import get_inspection_window_with_source
from backend.tools.spc_calculator import build_spc_series

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/spc", tags=["spc"])


@router.get(
    "/series",
    response_model=SpcSeriesResponse,
    summary="Get SPC run chart defect rate series and control limits",
)
async def get_spc_series(
    machine_id: Optional[str] = Query(None, description="Optional machine ID filter, e.g. CNC-02"),
    window: int = Query(60, ge=10, le=500, description="Inspection window size (number of parts)"),
    subgroup: int = Query(20, ge=5, le=100, description="Moving subgroup sample size"),
) -> SpcSeriesResponse:
    """Calculates live SPC run chart series, UCL/LCL control limits, and Nelson rule violations.

    Queries BigQuery traceability records (falling back to local mock buffer/seed) and computes
    trailing-subgroup defect proportions and out-of-control conditions against the active incident UCL.
    """
    records, source = await asyncio.to_thread(
        get_inspection_window_with_source, limit=window, machine_id=machine_id
    )

    ucl = blackboard.get_state().spc_ucl

    return build_spc_series(
        records=records,
        ucl=ucl,
        subgroup=subgroup,
        machine_id=machine_id,
        source=source,
        window=window,
    )
