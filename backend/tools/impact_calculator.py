"""ADK Tool: Computes avoided scrap parts, downtime savings, kWh electricity, and CO2 emission reductions."""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from backend.core.models import (
    EsgLedgerEntryResponse,
    EsgLedgerResponse,
    EsgLedgerTotals,
    ImpactCalculationRequest,
    ImpactMetrics,
    IncidentState,
    ManufacturingBenchmark,
)

logger = logging.getLogger(__name__)

# Standard manufacturing benchmarks across factory archetypes
DEFAULT_BENCHMARKS: Dict[str, ManufacturingBenchmark] = {
    "aluminum_cnc": ManufacturingBenchmark(
        name="aluminum_cnc",
        description="Automotive aluminum CNC machining (e.g., gearbox housings)",
        line_speed_parts_per_min=2.0,
        detection_lead_time_minutes=120.0,
        manual_diagnosis_minutes=60.0,
        ai_diagnosis_minutes=15.0,
        energy_kwh_per_unit=38.0 / 240.0,  # ~0.15833 kWh/part (machining + remelt)
        part_mass_kg=0.35,
        grid_emission_factor_kg_per_kwh=0.40,  # Regional Scope 2 carbon intensity
        material_emission_factor_kg_per_kg=9.8 / (240.0 * 0.35),  # Embodied scrap factor
        part_cost_usd=15.0,  # $15/housing -> $3,600 avoided scrap
        downtime_cost_per_hour_usd=0.0,
    ),
    "abs_injection_molding": ManufacturingBenchmark(
        name="abs_injection_molding",
        description="Electronics ABS enclosure injection molding",
        line_speed_parts_per_min=4.0,
        detection_lead_time_minutes=60.0,
        manual_diagnosis_minutes=45.0,
        ai_diagnosis_minutes=15.0,
        energy_kwh_per_unit=0.05,
        part_mass_kg=0.08,
        grid_emission_factor_kg_per_kwh=0.40,
        material_emission_factor_kg_per_kg=3.10,  # Embodied carbon of virgin/processed ABS
        part_cost_usd=2.50,
        downtime_cost_per_hour_usd=150.0,
    ),
    "pcb_electronics_assembly": ManufacturingBenchmark(
        name="pcb_electronics_assembly",
        description="Surface Mount Technology (SMT) & PCB electronics assembly",
        line_speed_parts_per_min=6.0,
        detection_lead_time_minutes=40.0,
        manual_diagnosis_minutes=45.0,
        ai_diagnosis_minutes=10.0,
        energy_kwh_per_unit=0.025,
        part_mass_kg=0.05,
        grid_emission_factor_kg_per_kwh=0.40,
        material_emission_factor_kg_per_kg=1.80,
        part_cost_usd=8.00,
        downtime_cost_per_hour_usd=250.0,
    ),
}

_BENCHMARK_REGISTRY: Dict[str, ManufacturingBenchmark] = dict(DEFAULT_BENCHMARKS)


def register_benchmark(benchmark: ManufacturingBenchmark) -> None:
    """Registers or updates a manufacturing benchmark profile."""
    _BENCHMARK_REGISTRY[benchmark.name] = benchmark
    logger.info("Registered manufacturing benchmark: %s", benchmark.name)


def get_benchmark(factory_type: str = "aluminum_cnc") -> ManufacturingBenchmark:
    """Retrieves a benchmark by name, defaulting to aluminum_cnc if not found."""
    if factory_type in _BENCHMARK_REGISTRY:
        return _BENCHMARK_REGISTRY[factory_type]
    logger.warning("Unknown factory type '%s'; defaulting to aluminum_cnc", factory_type)
    return _BENCHMARK_REGISTRY["aluminum_cnc"]


def list_benchmarks() -> Dict[str, ManufacturingBenchmark]:
    """Returns a copy of all registered manufacturing benchmarks."""
    return dict(_BENCHMARK_REGISTRY)


def calculate_avoided_scrap(
    earlier_detection_minutes: float,
    line_speed_parts_per_min: float,
) -> int:
    """Formula 1: Avoided Scrap Parts = Earlier Detection Lead Time * Line Speed."""
    if earlier_detection_minutes <= 0 or line_speed_parts_per_min <= 0:
        return 0
    return int(round(earlier_detection_minutes * line_speed_parts_per_min))


def calculate_downtime_savings(
    manual_diagnosis_minutes: float,
    ai_diagnosis_minutes: float = 0.0,
) -> int:
    """Formula 2: Downtime Minutes Saved = max(0, Manual Diagnosis - AI Diagnosis)."""
    return max(0, int(round(manual_diagnosis_minutes - ai_diagnosis_minutes)))


def calculate_energy_savings(
    scrap_avoided: int,
    energy_kwh_per_unit: float,
) -> float:
    """Formula 3: Energy Savings (kWh) = Scrap Avoided * Energy Consumed per Unit."""
    if scrap_avoided <= 0 or energy_kwh_per_unit <= 0:
        return 0.0
    return round(float(scrap_avoided) * float(energy_kwh_per_unit), 2)


def calculate_co2_reduction(
    energy_kwh: float,
    material_kg: float,
    grid_factor: float = 0.40,
    material_emission_factor: float = 0.11666666666666667,
) -> Tuple[float, float, float]:
    """Formula 4: CO2e Reduction = (Energy kWh * Grid Factor) + (Material kg * Emission Factor).

    Returns:
        Tuple of (total_co2_kg, energy_co2_kg, material_co2_kg).
    """
    energy_co2 = max(0.0, energy_kwh * grid_factor)
    material_co2 = max(0.0, material_kg * material_emission_factor)
    total_co2 = round(energy_co2 + material_co2, 2)
    return total_co2, round(energy_co2, 2), round(material_co2, 2)


def calculate_financial_savings(
    scrap_avoided: int,
    part_cost_usd: float,
    downtime_minutes_saved: int = 0,
    downtime_cost_per_hour_usd: float = 0.0,
) -> float:
    """Calculates financial savings from avoided scrap and reduced downtime."""
    scrap_savings = max(0.0, float(scrap_avoided) * float(part_cost_usd))
    downtime_savings = (
        max(0.0, (float(downtime_minutes_saved) / 60.0) * float(downtime_cost_per_hour_usd))
        if downtime_cost_per_hour_usd > 0
        else 0.0
    )
    return round(scrap_savings + downtime_savings, 2)


def calculate_sustainability_impact(
    request: Optional[ImpactCalculationRequest] = None,
    *,
    factory_type: Optional[str] = None,
    custom_benchmark: Optional[ManufacturingBenchmark] = None,
    earlier_detection_minutes: Optional[float] = None,
    manual_diagnosis_minutes: Optional[float] = None,
    ai_diagnosis_minutes: Optional[float] = None,
    line_speed_parts_per_min: Optional[float] = None,
    energy_kwh_per_unit: Optional[float] = None,
    part_mass_kg: Optional[float] = None,
    part_cost_usd: Optional[float] = None,
    grid_emission_factor_kg_per_kwh: Optional[float] = None,
    material_emission_factor_kg_per_kg: Optional[float] = None,
    downtime_cost_per_hour_usd: Optional[float] = None,
) -> ImpactMetrics:
    """Master impact calculation function applying deterministic formulas with customizable benchmarks.

    Precedence:
    1. Explicit keyword arguments (highest)
    2. Request object attributes (if provided)
    3. Benchmark defaults (custom_benchmark or registered factory_type)
    """
    # Resolve target factory benchmark
    req_type = request.factory_type if request else None
    resolved_type = factory_type or req_type or "aluminum_cnc"

    req_benchmark = request.custom_benchmark if request else None
    base_benchmark = custom_benchmark or req_benchmark or get_benchmark(resolved_type)

    # Helper to resolve field value with fallback chain
    def resolve(kwarg_val: Optional[float], req_val: Optional[float], bench_val: float) -> float:
        if kwarg_val is not None:
            return kwarg_val
        if req_val is not None:
            return req_val
        return bench_val

    lead_time = resolve(
        earlier_detection_minutes,
        request.earlier_detection_minutes if request else None,
        base_benchmark.detection_lead_time_minutes,
    )
    line_speed = resolve(
        line_speed_parts_per_min,
        request.line_speed_parts_per_min if request else None,
        base_benchmark.line_speed_parts_per_min,
    )
    manual_diag = resolve(
        manual_diagnosis_minutes,
        request.manual_diagnosis_minutes if request else None,
        base_benchmark.manual_diagnosis_minutes,
    )
    ai_diag = resolve(
        ai_diagnosis_minutes,
        request.ai_diagnosis_minutes if request else None,
        base_benchmark.ai_diagnosis_minutes,
    )
    kwh_per_unit = resolve(
        energy_kwh_per_unit,
        request.energy_kwh_per_unit if request else None,
        base_benchmark.energy_kwh_per_unit,
    )
    mass_kg = resolve(
        part_mass_kg,
        request.part_mass_kg if request else None,
        base_benchmark.part_mass_kg,
    )
    part_cost = resolve(
        part_cost_usd,
        request.part_cost_usd if request else None,
        base_benchmark.part_cost_usd,
    )
    grid_factor = resolve(
        grid_emission_factor_kg_per_kwh,
        request.grid_emission_factor_kg_per_kwh if request else None,
        base_benchmark.grid_emission_factor_kg_per_kwh,
    )
    mat_factor = resolve(
        material_emission_factor_kg_per_kg,
        request.material_emission_factor_kg_per_kg if request else None,
        base_benchmark.material_emission_factor_kg_per_kg,
    )
    dt_cost_hr = resolve(
        downtime_cost_per_hour_usd,
        request.downtime_cost_per_hour_usd if request else None,
        base_benchmark.downtime_cost_per_hour_usd,
    )

    # 1. Avoided Scrap
    scrap_avoided = calculate_avoided_scrap(lead_time, line_speed)

    # 2. Downtime Minutes Saved
    downtime_saved = calculate_downtime_savings(manual_diag, ai_diag)

    # 3. Energy Conserved (kWh)
    energy_kwh = calculate_energy_savings(scrap_avoided, kwh_per_unit)

    # 4. Scope 1 & 2 CO2e Reduced
    total_material_kg = float(scrap_avoided) * mass_kg
    total_co2, energy_co2, material_co2 = calculate_co2_reduction(
        energy_kwh=energy_kwh,
        material_kg=total_material_kg,
        grid_factor=grid_factor,
        material_emission_factor=mat_factor,
    )

    # 5. Financial Savings
    cost_savings = calculate_financial_savings(
        scrap_avoided=scrap_avoided,
        part_cost_usd=part_cost,
        downtime_minutes_saved=downtime_saved,
        downtime_cost_per_hour_usd=dt_cost_hr,
    )

    return ImpactMetrics(
        scrap_avoided=scrap_avoided,
        downtime_minutes=downtime_saved,
        energy_kwh=energy_kwh,
        co2_kg=total_co2,
        cost_savings_usd=cost_savings,
        energy_co2_kg=energy_co2,
        material_co2_kg=material_co2,
        factory_type=base_benchmark.name,
    )


async def calculate_impact_adk_tool(
    factory_type: str = "aluminum_cnc",
    earlier_detection_minutes: Optional[float] = None,
    line_speed_parts_per_min: Optional[float] = None,
) -> ImpactMetrics:
    """Stateless async tool callable by ADK agents (Continuous Learning, Orchestrator)."""
    return calculate_sustainability_impact(
        factory_type=factory_type,
        earlier_detection_minutes=earlier_detection_minutes,
        line_speed_parts_per_min=line_speed_parts_per_min,
    )


def build_esg_ledger(incidents: Iterable[IncidentState]) -> EsgLedgerResponse:
    """Aggregates cumulative ESG savings and entries for closed, signed-off incidents.

    - Filters for status == "closed", approved is True, and impact is not None
    - De-duplicates by incident_id (keeps newest entry)
    - Orders entries newest-first by closed_at (fallback updated_at)
    - Sums 7 numeric metrics into EsgLedgerTotals with floats rounded to 2 decimal places
    - Resolves factory_type from the newest entry (default "aluminum_cnc")
    - Labels the ledger basis "benchmark" (no incident carries measured inputs today)
    """
    candidates = [
        inc
        for inc in incidents
        if inc.status == "closed" and inc.approved and inc.impact is not None
    ]
    candidates.sort(
        key=lambda inc: inc.closed_at or inc.updated_at or "",
        reverse=True,
    )
    seen: set[str] = set()
    entries: List[EsgLedgerEntryResponse] = []
    for inc in candidates:
        if inc.incident_id not in seen:
            seen.add(inc.incident_id)
            entries.append(
                EsgLedgerEntryResponse(
                    incident_id=inc.incident_id,
                    closed_at=inc.closed_at,
                    approved=inc.approved,
                    impact=inc.impact,
                    incident=inc,
                )
            )

    scrap_avoided = sum(e.impact.scrap_avoided for e in entries)
    downtime_minutes = sum(e.impact.downtime_minutes for e in entries)
    energy_kwh = round(sum(e.impact.energy_kwh for e in entries), 2)
    co2_kg = round(sum(e.impact.co2_kg for e in entries), 2)
    energy_co2_kg = round(sum(e.impact.energy_co2_kg for e in entries), 2)
    material_co2_kg = round(sum(e.impact.material_co2_kg for e in entries), 2)
    cost_savings_usd = round(sum(e.impact.cost_savings_usd for e in entries), 2)

    totals = EsgLedgerTotals(
        incidents=len(entries),
        scrap_avoided=scrap_avoided,
        downtime_minutes=downtime_minutes,
        energy_kwh=energy_kwh,
        co2_kg=co2_kg,
        energy_co2_kg=energy_co2_kg,
        material_co2_kg=material_co2_kg,
        cost_savings_usd=cost_savings_usd,
    )
    factory_type = (
        entries[0].impact.factory_type or "aluminum_cnc"
        if entries
        else "aluminum_cnc"
    )

    # Impact inputs (line speed, part cost, detection lead time) come from the
    # manufacturing benchmarks; no incident currently carries measured production
    # inputs, so every ledger figure is labelled as a benchmark-based estimate.
    basis: Literal["benchmark", "measured"] = "benchmark"

    return EsgLedgerResponse(
        totals=totals,
        entries=entries,
        factory_type=factory_type,
        basis=basis,
    )


def build_esg_ledger_from_rows(
    rows: Iterable[Dict[str, Any]],
    incidents: Iterable[IncidentState] = (),
) -> EsgLedgerResponse:
    """Builds the ESG ledger from persisted BigQuery ``sustainability_impact`` rows (issue #335).

    The warehouse rows carry only the DDL columns (scrap, downtime, energy,
    CO2). When the matching incident is still on the Blackboard, its full
    ``ImpactMetrics`` card (cost, energy/material CO2 split) wins so the
    ledger totals stay complete; otherwise a partial card is booked from the
    persisted columns with the non-persisted fields at 0. Delegates ordering,
    de-duplication, and summation to ``build_esg_ledger``.
    """
    by_id = {inc.incident_id: inc for inc in incidents if inc.incident_id}
    states: List[IncidentState] = []
    for row in rows:
        incident_id = str(row.get("incident_id") or "")
        if not incident_id:
            continue
        board = by_id.get(incident_id)
        if board is not None and board.impact is not None:
            states.append(board)
            continue
        ts = row.get("timestamp")
        closed_at = ts.isoformat() if hasattr(ts, "isoformat") else (str(ts) if ts else None)
        impact = ImpactMetrics(
            scrap_avoided=int(row.get("scrap_pieces_avoided") or 0),
            downtime_minutes=int(round(float(row.get("downtime_minutes_saved") or 0.0))),
            energy_kwh=round(float(row.get("energy_kwh_saved") or 0.0), 2),
            co2_kg=round(float(row.get("co2_kg_saved") or 0.0), 2),
            cost_savings_usd=0.0,
            energy_co2_kg=0.0,
            material_co2_kg=0.0,
        )
        states.append(
            IncidentState(
                incident_id=incident_id,
                status="closed",
                approved=True,
                closed_at=closed_at,
                impact=impact,
            )
        )
    return build_esg_ledger(states)
