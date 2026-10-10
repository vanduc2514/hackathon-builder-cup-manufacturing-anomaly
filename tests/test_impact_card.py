"""Unit and integration tests for Sustainability & Avoided Scrap Impact Card (Issue #36).

Validates:
1. ImpactCard.tsx exists, exports default component, and satisfies Key Invariant #5.
2. Implements 4 core sustainability metrics (Avoided Scrap, Downtime Saved, Energy Conserved, CO2e Reduced).
3. Implements mathematical formula breakdown tooltips and industrial parameter references.
4. Implements single-incident vs annualized factory cumulative fleet toggle.
5. Implements visual polish, animated counter integration, and celebratory completion state on closure.
6. Implements Dashboard integration in frontend/src/pages/Dashboard.tsx.
7. Validates backend impact API route contracts (/api/impact/benchmarks and /api/impact/calculate).
"""

from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import ImpactCalculationRequest

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
COMPONENTS_DIR = FRONTEND_DIR / "src" / "components"
IMPACT_CARD_FILE = COMPONENTS_DIR / "ImpactCard.tsx"
DASHBOARD_FILE = FRONTEND_DIR / "src" / "pages" / "Dashboard.tsx"


def test_impact_card_component_exists_and_exports() -> None:
    """Verifies that ImpactCard.tsx exists and has a default export function."""
    assert IMPACT_CARD_FILE.exists(), f"ImpactCard.tsx must exist at {IMPACT_CARD_FILE}"
    content = IMPACT_CARD_FILE.read_text(encoding="utf-8")
    assert "export default function ImpactCard" in content, (
        "ImpactCard.tsx must export default function ImpactCard"
    )
    # Architecture invariant #5
    assert "localhost:8000" not in content, (
        "Key Invariant #5: ImpactCard must not contain hardcoded localhost backend address."
    )


def test_impact_card_four_core_sustainability_metrics() -> None:
    """Verifies that ImpactCard.tsx implements all 4 core sustainability and business value metrics."""
    content = IMPACT_CARD_FILE.read_text(encoding="utf-8")

    # Metric 1: Avoided Scrap (240 parts baseline)
    assert "Avoided Scrap" in content or "scrap_avoided" in content, (
        "ImpactCard must render Avoided Scrap metric"
    )
    assert "parts" in content, "Avoided Scrap must specify 'parts' unit"
    assert "240" in content, "Must include 240 parts baseline default"

    # Metric 2: Downtime Saved (45 minutes baseline)
    assert "Downtime Saved" in content or "downtime_minutes" in content, (
        "ImpactCard must render Downtime Saved metric"
    )
    assert "min" in content, "Downtime Saved must specify 'min' or 'hours' unit"
    assert "45" in content, "Must include 45 minutes baseline default"

    # Metric 3: Energy Conserved (38.0 kWh baseline)
    assert "Energy Conserved" in content or "energy_kwh" in content, (
        "ImpactCard must render Energy Conserved metric"
    )
    assert "kWh" in content, "Energy Conserved must specify 'kWh' unit"
    assert "38.0" in content or "38" in content, "Must include 38 kWh baseline default"

    # Metric 4: CO2e Emissions Reduced (25.0 kg CO2e baseline)
    assert "CO₂e" in content or "co2_kg" in content or "CO2e" in content, (
        "ImpactCard must render CO2e Reduced metric"
    )
    assert "kg CO₂e" in content or "kg" in content, "Must specify kg CO2e unit"
    assert "25.0" in content or "25" in content, "Must include 25 kg CO2e baseline default"

    # Financial ROI ($3,600 USD baseline)
    assert "Financial" in content or "cost_savings_usd" in content, (
        "ImpactCard must render Financial ROI metric"
    )
    assert "3600" in content or "3,600" in content, "Must include $3,600 USD baseline default"


def test_impact_card_mathematical_formulas_and_parameters() -> None:
    """Verifies mathematical breakdown tooltips and industrial parameter standards."""
    content = IMPACT_CARD_FILE.read_text(encoding="utf-8")

    # Check for expandable formula section
    assert "Formula Breakdown" in content, "ImpactCard must offer Formula Breakdown toggle"
    assert "Deterministic Formulas" in content or "Methodology" in content

    # Formulas 1 to 5
    assert "Earlier Detection Lead Time × Line Speed" in content, (
        "Formula 1: Avoided scrap formula must be documented"
    )
    assert "max(0, Manual Diagnosis − AI Diagnosis)" in content or "Manual Diagnosis − AI Diagnosis" in content, (
        "Formula 2: Downtime savings formula must be documented"
    )
    assert "Scrap Avoided × Specific Energy per Unit" in content, (
        "Formula 3: Energy savings formula must be documented"
    )
    assert "Grid Factor" in content and "Material Factor" in content, (
        "Formula 4: Scope 1 & 2 GHG formula must be documented"
    )
    assert "Part Unit Cost" in content, "Formula 5: Financial ROI formula must be documented"

    # Industrial parameter reference values
    assert "2.0 parts/min" in content, "Parameter reference must show 2.0 parts/min line speed"
    assert "120" in content, "Parameter reference must show 120 min lead time"
    assert "0.40" in content, "Parameter reference must show 0.40 kg CO2/kWh grid factor"
    assert "0.35 kg" in content, "Parameter reference must show 0.35 kg part mass"
    assert "$15.00" in content, "Parameter reference must show $15.00 unit cost"


def test_impact_card_cumulative_vs_incident_toggle() -> None:
    """Verifies single incident vs annualized factory fleet toggle."""
    content = IMPACT_CARD_FILE.read_text(encoding="utf-8")

    assert "Single Incident" in content, "Must offer Single Incident toggle mode"
    assert "Annualized" in content, "Must offer Annualized fleet toggle mode"
    assert "48" in content, "Must include 48x multiplier for annualization across 4 CNC lines"
    assert "viewMode" in content, "Must maintain viewMode reactive state"


def test_impact_card_celebratory_completion_state() -> None:
    """Verifies visual polish, gradients, and celebratory completion state on closure."""
    content = IMPACT_CARD_FILE.read_text(encoding="utf-8")

    # Closure state check
    assert "isClosed" in content or "closed" in content, (
        "ImpactCard must react to incident closed status"
    )
    assert "Incident Resolved" in content, (
        "ImpactCard must render celebratory resolution banner when incident is closed"
    )
    assert "50/50 Streak Verified" in content or "Streak Verified" in content, (
        "Celebratory state must reference zero-defect verification streak"
    )

    # Emerald and cyan gradients
    assert "#10B981" in content or "#065F46" in content, "Must utilize emerald theme palette"
    assert "#38BDF8" in content or "#0284C7" in content or "#2DD4BF" in content, (
        "Must utilize cyan/sky theme palette"
    )

    # Animated counter
    assert "useAnimatedCounter" in content or "requestAnimationFrame" in content, (
        "Must implement smooth animated counter transitions"
    )

    # Export capabilities
    assert "Copy ESG" in content or "copy" in content.lower(), (
        "Must implement copy ESG summary action"
    )
    assert "Export JSON" in content or "download" in content.lower(), (
        "Must implement JSON export action"
    )


def test_dashboard_integration() -> None:
    """Verifies Dashboard.tsx imports and passes props to ImpactCard."""
    dashboard_content = DASHBOARD_FILE.read_text(encoding="utf-8")

    assert "import ImpactCard from '../components/ImpactCard';" in dashboard_content, (
        "Dashboard.tsx must import ImpactCard"
    )
    assert "<ImpactCard" in dashboard_content, "Dashboard.tsx must render ImpactCard"
    assert "impact={incident?.impact" in dashboard_content, (
        "Dashboard.tsx must pass incident impact metrics"
    )


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
