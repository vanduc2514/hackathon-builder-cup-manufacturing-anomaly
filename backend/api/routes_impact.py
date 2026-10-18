"""API Routes: Environmental and financial impact calculation and factory benchmarks."""

from __future__ import annotations

import asyncio
import logging
from typing import Dict

from fastapi import APIRouter, Query

from backend.core.blackboard import blackboard
from backend.core.models import (
    EsgLedgerResponse,
    ImpactCalculationRequest,
    ImpactMetrics,
    ManufacturingBenchmark,
)
from backend.tools.bigquery_tool import query_sustainability_impact_rows
from backend.tools.impact_calculator import (
    build_esg_ledger,
    build_esg_ledger_from_rows,
    calculate_sustainability_impact,
    list_benchmarks,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/impact", tags=["impact"])


@router.get("/benchmarks", response_model=Dict[str, ManufacturingBenchmark])
async def get_benchmarks():
    """Returns available manufacturing benchmark profiles."""
    return list_benchmarks()


@router.post("/calculate", response_model=ImpactMetrics)
async def calculate_impact(request: ImpactCalculationRequest):
    """Calculates avoided scrap, downtime, energy, CO2 reduction, and cost savings."""
    return calculate_sustainability_impact(request)


@router.get("/ledger", response_model=EsgLedgerResponse)
async def get_esg_ledger(
    limit: int = Query(default=100, ge=1, le=200, description="Max closed incidents to inspect"),
) -> EsgLedgerResponse:
    """Returns the cumulative ESG ledger and signed-off incident entries (newest first).

    Aggregates from the BigQuery ``sustainability_impact`` warehouse table when
    a client is available (live project or emulator, issue #335); otherwise
    falls back to the in-memory Blackboard aggregation (local dev mock mode).
    Read-only; no Blackboard mutations.
    """
    incidents = await asyncio.to_thread(blackboard.list_incidents, limit=limit, status="closed")
    try:
        rows = await asyncio.to_thread(query_sustainability_impact_rows, limit)
    except Exception as exc:
        logger.warning(
            "sustainability_impact warehouse read failed (%s); using Blackboard ledger",
            exc,
        )
        return build_esg_ledger(incidents)
    return build_esg_ledger_from_rows(rows, incidents)
