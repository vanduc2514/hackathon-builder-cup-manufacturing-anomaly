"""Tests for the Sustainability & Avoided Scrap Impact backend contract (Issue #36).

Validates backend impact API route contracts (/api/impact/benchmarks and /api/impact/calculate).
"""

from __future__ import annotations

from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import ImpactCalculationRequest


def test_backend_impact_api_route_parity() -> None:
    """Validates FastAPI backend /api/impact endpoints match the frontend benchmark formulas."""
    with TestClient(app) as client:
        # 1. Benchmarks endpoint
        benchmarks_resp = client.get("/api/impact/benchmarks")
        assert benchmarks_resp.status_code == 200, "GET /api/impact/benchmarks must return 200 OK"
        benchmarks = benchmarks_resp.json()
        assert "aluminum_cnc" in benchmarks, "aluminum_cnc benchmark must be registered"
        cnc = benchmarks["aluminum_cnc"]
        assert cnc["line_speed_parts_per_min"] == 2.0
        assert cnc["detection_lead_time_minutes"] == 120.0
        assert cnc["part_cost_usd"] == 15.0
        assert cnc["grid_emission_factor_kg_per_kwh"] == 0.40

        # 2. Calculate endpoint
        calc_payload = ImpactCalculationRequest(
            factory_type="aluminum_cnc",
            earlier_detection_minutes=120.0,
            line_speed_parts_per_min=2.0,
        ).model_dump()

        calc_resp = client.post("/api/impact/calculate", json=calc_payload)
        assert calc_resp.status_code == 200, "POST /api/impact/calculate must return 200 OK"
        data = calc_resp.json()

        assert data["scrap_avoided"] == 240
        assert data["downtime_minutes"] == 45
        assert data["energy_kwh"] == 38.0
        assert data["co2_kg"] == 25.0
        assert data["cost_savings_usd"] == 3600.0
