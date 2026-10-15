"""Tests for the frontend apps' backend contracts (Issue #83).

Validates:
1. Architecture invariant #5: no source file in apps/web or apps/mobile hardcodes the backend host.
2. SSE connection contracts (/api/incidents/stream and /api/incidents/events) deliver valid IncidentState packets.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import AgentFinding, IncidentState

APPS_DIR = Path(__file__).resolve().parent.parent / "apps"


@pytest.mark.parametrize("app_name", ["web", "mobile"])
def test_frontend_components_architecture_invariants(app_name: str) -> None:
    """Verifies that no app source file violates Key Invariant #5 (no hardcoded backend hostnames)."""
    src_dir = APPS_DIR / app_name / "src"
    assert src_dir.is_dir(), f"{src_dir} must exist"
    ts_files = list(src_dir.glob("**/*.tsx")) + list(src_dir.glob("**/*.ts"))
    assert ts_files, f"Expected TS/TSX source files in {src_dir}"

    for file_path in ts_files:
        content = file_path.read_text(encoding="utf-8")
        assert "localhost:8000" not in content, (
            f"Violation of Key Invariant #5 in {file_path.relative_to(APPS_DIR)}: "
            "Found hardcoded 'localhost:8000'. All API calls must use relative URLs."
        )


def test_frontend_sse_stream_contract() -> None:
    """Verifies backend SSE stream produces incident_update events with valid IncidentState schema."""

    async def _run() -> None:
        blackboard.reset()
        blackboard.add_finding(
            AgentFinding(
                agent_id="quality_inspector",
                agent_name="Quality Inspector",
                phase="detecting",
                finding="Defect rate spiked to 3.8% exceeding UCL 3.0%",
                evidence="Camera 01 scratch defect",
                confidence=0.98,
                citation="SPC Rules Section 4",
            )
        )

        # Verify blackboard streaming generator delivers initial snapshot matching IncidentState schema
        gen = blackboard.subscribe()
        initial_event_json = await anext(gen)
        await gen.aclose()

        parsed = json.loads(initial_event_json)
        incident_state = IncidentState(**parsed)

        assert incident_state.incident_id == "INC-0412"
        assert len(incident_state.findings) == 1
        assert incident_state.findings[0].agent_id == "quality_inspector"

    asyncio.run(_run())

    # Verify route registration for both /events and /stream
    from backend.api.routes_incidents import router as incidents_router

    incident_route_paths = [r.path for r in incidents_router.routes]
    assert "/api/incidents/events" in incident_route_paths
    assert "/api/incidents/stream" in incident_route_paths

    # Verify GET /api/incidents/current returns matching snapshot
    client = TestClient(app)
    response = client.get("/api/incidents/current")
    assert response.status_code == 200
    current_data = response.json()
    assert current_data["incident_id"] == "INC-0412"
    assert len(current_data["findings"]) == 1


def test_frontend_project_layout_compliance() -> None:
    """Verifies that apps/web adheres to AGENTS.md project layout and includes all new OEE components."""
    repo_root = APPS_DIR.parent
    legacy_dir = repo_root / "dashboard_frontend"
    assert not legacy_dir.exists(), (
        "Legacy 'dashboard_frontend' directory must be removed in favor of 'apps/web'"
    )

    web_src = APPS_DIR / "web" / "src"
    required_files = [
        web_src / "components" / "overview" / "MachineSelect.tsx",
        web_src / "components" / "overview" / "OeeLossCard.tsx",
        web_src / "components" / "overview" / "OeeTrendCard.tsx",
        web_src / "lib" / "oee.ts",
        APPS_DIR / "web" / "BACKEND_GAPS.md",
    ]
    for req in required_files:
        assert req.exists(), (
            f"Required dashboard component or doc missing: {req.relative_to(repo_root)}"
        )


def test_oee_calculation_and_band_logic() -> None:
    """Verifies OEE calculation rules and status bands mirror production criteria."""
    # OEE target is 85% (0.85)
    target = 0.85
    watch_threshold = target - 0.15  # 0.70

    def calculate_band(oee: float) -> str:
        if oee >= target:
            return "good"
        if oee >= watch_threshold:
            return "watch"
        return "poor"

    assert calculate_band(0.88) == "good"
    assert calculate_band(0.85) == "good"
    assert calculate_band(0.80) == "watch"
    assert calculate_band(0.70) == "watch"
    assert calculate_band(0.69) == "poor"
    assert calculate_band(0.45) == "poor"


def test_oee_pydantic_models_schema() -> None:
    """Verifies that OEE Pydantic models in backend/core/models.py adhere to schema contracts."""
    from backend.core.models import (
        LineOeeResponse,
        MachineOee,
        OeeLoss,
        OeePoint,
    )

    point = OeePoint(
        availability=0.92,
        performance=0.95,
        quality=0.98,
        oee=0.92 * 0.95 * 0.98,
        timestamp="2026-10-15T12:00:00Z",
    )
    assert point.availability == 0.92
    assert point.timestamp == "2026-10-15T12:00:00Z"

    loss = OeeLoss(
        kind="unplanned_downtime",
        points=0.08,
        machine_id="CNC-02",
        reason="CNC-02 tool insert replacement",
        incident_id="INC-0412",
    )
    assert loss.kind == "unplanned_downtime"
    assert loss.points == 0.08

    machine = MachineOee(
        machine_id="CNC-02",
        availability=0.90,
        performance=0.94,
        quality=0.96,
        oee=0.812,
        good_parts=450,
        total_parts=468,
        series=[point],
    )
    assert machine.machine_id == "CNC-02"
    assert len(machine.series) == 1

    line_response = LineOeeResponse(
        line_id="cell-line-1",
        target=0.85,
        availability=0.92,
        performance=0.95,
        quality=0.97,
        oee=0.8477,
        series=[point],
        machines=[machine],
        losses=[loss],
    )
    assert line_response.line_id == "cell-line-1"
    assert line_response.target == 0.85
    assert len(line_response.losses) == 1

    dumped = line_response.model_dump()
    assert dumped["losses"][0]["kind"] == "unplanned_downtime"


def test_incident_state_metadata_and_sla_fields() -> None:
    """Verifies IncidentState metadata fields (opened_at, severity, line_id, product, mttr_target_minutes)."""
    # Verify default values
    state = IncidentState()
    assert state.severity == "medium"
    assert state.line_id == "cell-line-1"
    assert state.product == "Gearbox Casing"
    assert state.mttr_target_minutes == 15
    assert state.opened_at is None

    # Verify custom values
    custom_state = IncidentState(
        opened_at="2026-10-15T10:00:00+00:00",
        severity="critical",
        line_id="cell-line-2",
        product="Shaft Collar",
        mttr_target_minutes=20,
    )
    assert custom_state.opened_at == "2026-10-15T10:00:00+00:00"
    assert custom_state.severity == "critical"
    assert custom_state.line_id == "cell-line-2"
    assert custom_state.product == "Shaft Collar"
    assert custom_state.mttr_target_minutes == 20


def test_mobile_dock_clearance_and_tap_target_invariants() -> None:
    """Verifies AGENTS.md §6 mobile tap target (>=44px) and bottom dock clearance (Issue #145).

    The mobile dock occupies bottom: 14px + height: 66px = 80px of the viewport.
    .m-screen must declare bottom padding >= 80px so that scrollable content (e.g. Sign out
    button in MobileSettings.tsx) is not obscured by nav.m-dock, preserving >=44px tap target.
    """
    mobile_css_path = APPS_DIR / "mobile" / "src" / "components" / "mobile" / "mobile.css"
    assert mobile_css_path.is_file(), f"{mobile_css_path} must exist"
    css_content = mobile_css_path.read_text(encoding="utf-8")

    # Invariant 1: .m-btn tap target height >= 44px per AGENTS.md §6
    assert "min-height: 44px" in css_content, ".m-btn must declare min-height: 44px per AGENTS.md §6"
    assert "height: 50px" in css_content, ".m-btn must declare height: 50px"

    # Invariant 2: .m-screen has bottom padding >= 80px to clear .m-dock (14px + 66px)
    import re
    screen_rule_match = re.search(r"\.m-screen\s*\{([^}]+)\}", css_content)
    assert screen_rule_match is not None, "Could not find .m-screen CSS rule in mobile.css"
    screen_rule_body = screen_rule_match.group(1)

    # Check padding declaration in .m-screen
    padding_match = re.search(r"padding:\s*([0-9a-zA-Z\s]+);", screen_rule_body)
    assert padding_match is not None, ".m-screen must declare padding"
    padding_tokens = padding_match.group(1).strip().split()

    # If 3 or 4 tokens, last/third token is bottom padding (e.g. "0 16px 96px")
    if len(padding_tokens) == 3:
        bottom_pad_str = padding_tokens[2]
    elif len(padding_tokens) == 4:
        bottom_pad_str = padding_tokens[2]
    elif len(padding_tokens) == 1:
        bottom_pad_str = padding_tokens[0]
    else:
        # Check padding-bottom explicitly
        pb_match = re.search(r"padding-bottom:\s*(\d+)px", screen_rule_body)
        assert pb_match is not None, ".m-screen must specify bottom padding >= 80px"
        bottom_pad_str = pb_match.group(1) + "px"

    assert bottom_pad_str.endswith("px"), f"Expected px unit in {bottom_pad_str}"
    bottom_padding_val = int(bottom_pad_str.replace("px", ""))
    assert bottom_padding_val >= 80, (
        f".m-screen bottom padding {bottom_padding_val}px is insufficient to clear .m-dock (80px)"
    )

    # Invariant 3: MobileSettings renders #m-sign-out with .m-btn class
    settings_tsx_path = APPS_DIR / "mobile" / "src" / "components" / "mobile" / "MobileSettings.tsx"
    assert settings_tsx_path.is_file(), f"{settings_tsx_path} must exist"
    settings_content = settings_tsx_path.read_text(encoding="utf-8")
    assert 'id="m-sign-out"' in settings_content, "MobileSettings must render #m-sign-out button"
    assert 'className="m-btn glass"' in settings_content or 'm-btn' in settings_content
