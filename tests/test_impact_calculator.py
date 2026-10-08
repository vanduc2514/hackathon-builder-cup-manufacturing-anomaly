"""Unit tests for sustainability & financial impact calculator tool and API."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import (
    ImpactCalculationRequest,
    ImpactMetrics,
    ManufacturingBenchmark,
)
from backend.tools.impact_calculator import (
    calculate_avoided_scrap,
    calculate_co2_reduction,
    calculate_downtime_savings,
    calculate_energy_savings,
    calculate_financial_savings,
    calculate_impact_adk_tool,
    calculate_sustainability_impact,
    get_benchmark,
    list_benchmarks,
    register_benchmark,
)


def test_avoided_scrap_formula():
    """Validates Scrap Avoided = Earlier Detection Lead Time * Line Speed."""
    # Standard benchmark: 120 min earlier detection * 2 parts/min = 240 pieces
    assert calculate_avoided_scrap(120.0, 2.0) == 240

    # Custom inputs
    assert calculate_avoided_scrap(60.0, 4.0) == 240
    assert calculate_avoided_scrap(30.0, 5.0) == 150

    # Boundary and non-positive conditions
    assert calculate_avoided_scrap(0.0, 2.0) == 0
    assert calculate_avoided_scrap(-10.0, 2.0) == 0
    assert calculate_avoided_scrap(120.0, 0.0) == 0
    assert calculate_avoided_scrap(120.0, -1.0) == 0


def test_downtime_savings_formula():
    """Validates Downtime Savings = max(0, Manual Diagnosis - AI Diagnosis)."""
    # 60 min manual baseline - 15 min AI diagnosis = 45 min saved
    assert calculate_downtime_savings(60.0, 15.0) == 45

    # Direct baseline specification
    assert calculate_downtime_savings(45.0, 0.0) == 45

    # Boundary: AI takes longer than manual
    assert calculate_downtime_savings(30.0, 45.0) == 0


def test_energy_savings_formula():
    """Validates Energy Savings = Scrap Avoided * kWh per unit."""
    # 240 pieces * (38 / 240) kWh/unit = 38.0 kWh
    kwh_unit = 38.0 / 240.0
    assert calculate_energy_savings(240, kwh_unit) == 38.0

    # Custom inputs
    assert calculate_energy_savings(100, 0.5) == 50.0
    assert calculate_energy_savings(0, 0.5) == 0.0
    assert calculate_energy_savings(-10, 0.5) == 0.0
    assert calculate_energy_savings(100, -0.5) == 0.0


def test_co2_reduction_formula():
    """Validates Scope 1 & 2 GHG reduction: (Energy kWh * Grid Factor) + (Material kg * Factor)."""
    # 38.0 kWh * 0.40 = 15.2 kg CO2 (Energy)
    # 84.0 kg scrap material * 0.11666667 = 9.8 kg CO2 (Material)
    # Total = 25.0 kg CO2
    total, energy_co2, mat_co2 = calculate_co2_reduction(
        energy_kwh=38.0,
        material_kg=84.0,
        grid_factor=0.40,
        material_emission_factor=9.8 / 84.0,
    )
    assert total == 25.0
    assert energy_co2 == 15.2
    assert mat_co2 == 9.8

    # Zero input boundary
    assert calculate_co2_reduction(0.0, 0.0) == (0.0, 0.0, 0.0)


def test_financial_savings_formula():
    """Validates scrap part cost + optional downtime hourly rate savings."""
    # 240 parts * $15.00/housing = $3,600.00
    assert calculate_financial_savings(240, 15.0) == 3600.0

    # With downtime rate: 45 min saved @ $200/hr = $150 downtime savings + $3,600 = $3,750
    savings = calculate_financial_savings(
        scrap_avoided=240,
        part_cost_usd=15.0,
        downtime_minutes_saved=45,
        downtime_cost_per_hour_usd=200.0,
    )
    assert savings == 3750.0


def test_default_sustainability_impact_matches_specification():
    """Validates that default calculate_sustainability_impact matches all issue criteria."""
    impact = calculate_sustainability_impact()

    assert isinstance(impact, ImpactMetrics)
    assert impact.scrap_avoided == 240
    assert impact.downtime_minutes == 45
    assert impact.energy_kwh == 38.0
    assert impact.co2_kg == 25.0
    assert impact.cost_savings_usd == 3600.0
    assert impact.energy_co2_kg == 15.2
    assert impact.material_co2_kg == 9.8
    assert impact.factory_type == "aluminum_cnc"


def test_abs_injection_molding_benchmark():
    """Validates ABS injection molding manufacturing archetype calculation."""
    impact = calculate_sustainability_impact(factory_type="abs_injection_molding")

    # 60 min * 4 parts/min = 240 pieces
    assert impact.scrap_avoided == 240
    # 45 min - 15 min = 30 min saved
    assert impact.downtime_minutes == 30
    # 240 * 0.05 kWh = 12.0 kWh
    assert impact.energy_kwh == 12.0
    # Financial: (240 * $2.50) + (30/60 * $150) = $600 + $75 = $675.00
    assert impact.cost_savings_usd == 675.0
    assert impact.factory_type == "abs_injection_molding"


def test_pcb_assembly_benchmark():
    """Validates PCB electronics assembly benchmark."""
    impact = calculate_sustainability_impact(factory_type="pcb_electronics_assembly")

    # 40 min * 6 parts/min = 240 pieces
    assert impact.scrap_avoided == 240
    # 45 min - 10 min = 35 min
    assert impact.downtime_minutes == 35
    # 240 * 0.025 kWh = 6.0 kWh
    assert impact.energy_kwh == 6.0
    assert impact.factory_type == "pcb_electronics_assembly"


def test_impact_calculation_with_request_and_overrides():
    """Validates calculation with request payload and parameter overrides."""
    req = ImpactCalculationRequest(
        factory_type="aluminum_cnc",
        earlier_detection_minutes=60.0,  # 60 min * 2 = 120 parts
        part_cost_usd=20.0,
    )
    impact = calculate_sustainability_impact(req)

    assert impact.scrap_avoided == 120
    assert impact.cost_savings_usd == 2400.0

    # Overriding kwarg takes precedence over request object
    impact_override = calculate_sustainability_impact(req, earlier_detection_minutes=30.0)
    assert impact_override.scrap_avoided == 60


def test_custom_benchmark_registration():
    """Validates custom manufacturing benchmark registration and usage."""
    custom = ManufacturingBenchmark(
        name="battery_cell_winding",
        description="EV lithium-ion battery cell winding line",
        line_speed_parts_per_min=10.0,
        detection_lead_time_minutes=30.0,
        manual_diagnosis_minutes=90.0,
        ai_diagnosis_minutes=15.0,
        energy_kwh_per_unit=0.10,
        part_mass_kg=0.20,
        grid_emission_factor_kg_per_kwh=0.40,
        material_emission_factor_kg_per_kg=2.50,
        part_cost_usd=40.0,
        downtime_cost_per_hour_usd=500.0,
    )
    register_benchmark(custom)

    benchmarks = list_benchmarks()
    assert "battery_cell_winding" in benchmarks

    retrieved = get_benchmark("battery_cell_winding")
    assert retrieved.name == "battery_cell_winding"

    impact = calculate_sustainability_impact(factory_type="battery_cell_winding")
    # 30 min * 10 parts/min = 300 parts avoided
    assert impact.scrap_avoided == 300
    # 90 min - 15 min = 75 min saved
    assert impact.downtime_minutes == 75
    # 300 * 0.10 = 30.0 kWh
    assert impact.energy_kwh == 30.0


@pytest.mark.anyio
async def test_calculate_impact_adk_tool():
    """Validates the async ADK tool function signature and execution."""
    metrics = await calculate_impact_adk_tool(
        factory_type="aluminum_cnc",
        earlier_detection_minutes=120.0,
        line_speed_parts_per_min=2.0,
    )
    assert metrics.scrap_avoided == 240
    assert metrics.downtime_minutes == 45
    assert metrics.co2_kg == 25.0


def test_api_impact_endpoints():
    """Validates FastAPI routes for impact benchmarks and calculation."""
    client = TestClient(app)

    # 1. GET /api/impact/benchmarks
    resp = client.get("/api/impact/benchmarks")
    assert resp.status_code == 200
    data = resp.json()
    assert "aluminum_cnc" in data
    assert "abs_injection_molding" in data

    # 2. POST /api/impact/calculate
    calc_resp = client.post(
        "/api/impact/calculate",
        json={
            "factory_type": "aluminum_cnc",
            "earlier_detection_minutes": 120.0,
            "line_speed_parts_per_min": 2.0,
        },
    )
    assert calc_resp.status_code == 200
    metrics = calc_resp.json()
    assert metrics["scrap_avoided"] == 240
    assert metrics["downtime_minutes"] == 45
    assert metrics["energy_kwh"] == 38.0
    assert metrics["co2_kg"] == 25.0
    assert metrics["cost_savings_usd"] == 3600.0
