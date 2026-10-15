"""API Routes: Environmental and financial impact calculation and factory benchmarks."""

from __future__ import annotations

import asyncio
from typing import Dict

from fastapi import APIRouter, Query

from backend.core.blackboard import blackboard
from backend.core.models import (
    EsgLedgerResponse,
    ImpactCalculationRequest,
    ImpactMetrics,
    ManufacturingBenchmark,
)
from backend.tools.impact_calculator import (
    build_esg_ledger,
    calculate_sustainability_impact,
    list_benchmarks,
)

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

    Reads closed incidents from the Blackboard (or Firestore history) and aggregates
    cumulative avoided scrap, downtime, energy, CO2, and cost savings for shift-leader
    approved incidents. Read-only; no Blackboard mutations.
    """
    incidents = await asyncio.to_thread(blackboard.list_incidents, limit=limit, status="closed")
    return build_esg_ledger(incidents)
