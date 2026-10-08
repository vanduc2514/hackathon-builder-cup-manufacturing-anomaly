"""API Routes: Environmental and financial impact calculation and factory benchmarks."""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter

from backend.core.models import (
    ImpactCalculationRequest,
    ImpactMetrics,
    ManufacturingBenchmark,
)
from backend.tools.impact_calculator import (
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
