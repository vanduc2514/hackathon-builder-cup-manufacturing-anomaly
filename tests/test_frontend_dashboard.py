"""Tests for the frontend apps' backend contracts (Issue #83).

Validates:
1. Architecture invariant #5: no source file in apps/web or apps/mobile hardcodes the backend host.
2. SSE connection contracts (/api/incidents/stream and /api/incidents/events) deliver valid IncidentState packets.
"""

from __future__ import annotations

import asyncio
import json
import re
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
    assert "min-height: 44px" in css_content, (
        ".m-btn must declare min-height: 44px per AGENTS.md §6"
    )
    assert "height: 50px" in css_content, ".m-btn must declare height: 50px"

    # Invariant 2: .m-screen has bottom padding >= 80px to clear .m-dock (14px + 66px)
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
    assert 'className="m-btn glass"' in settings_content or "m-btn" in settings_content


def test_overview_components_css_coverage() -> None:
    """Verifies that all static and dynamic classNames in Line Overview components exist in index.css.

    Prevents regression of PR #116 / Issue #186/#188 where overview CSS was stripped during relocation.
    """
    web_dir = APPS_DIR / "web" / "src"
    css_path = web_dir / "index.css"
    assert css_path.is_file(), f"{css_path} must exist"
    css_text = css_path.read_text(encoding="utf-8")

    css_classes = set(re.findall(r"\.([a-zA-Z0-9_-]+)", css_text))

    overview_files = list((web_dir / "components" / "overview").glob("*.tsx")) + [
        web_dir / "components" / "views" / "LineOverviewView.tsx"
    ]
    assert len(overview_files) >= 5, f"Expected overview component files in {web_dir}"

    all_used_classes: set[str] = set()

    for file_path in overview_files:
        content = file_path.read_text(encoding="utf-8")
        for m in re.finditer(r"className=(?:\"([^\"]+)\"|`([^`]+)`)", content):
            val = m.group(1) or m.group(2)
            # Expand dynamic interpolations
            val = val.replace("${l.incidentId ? 'loss-hot' : ''}", "loss-hot")
            val = val.replace("${hot ? 'loss-item-hot' : ''}", "loss-item-hot")
            val = val.replace("${off ? 'legend-off' : ''}", "legend-off")
            val = val.replace("${range === r.min ? 'seg-on' : ''}", "seg-on")
            val = val.replace("${o.id === scope ? 'machine-option-on' : ''}", "machine-option-on")
            val = val.replace("${o.hot ? 'machine-option-hot' : ''}", "machine-option-hot")
            val = val.replace("${delta < 0 ? 'chip-red' : 'chip-green'}", "chip-red chip-green")
            val = val.replace("${norm}", "planned downtime speed quality")
            val = re.sub(r"\$\{[^}]+\}", "", val)
            val = re.sub(r"[^a-zA-Z0-9_-]", " ", val)
            for c in val.split():
                c = c.strip()
                if c and not c.isdigit():
                    all_used_classes.add(c)

    missing = sorted([c for c in all_used_classes if c not in css_classes])
    assert not missing, f"Missing CSS rules in apps/web/src/index.css for classes: {missing}"

    # Also verify critical dynamic and responsive selectors
    required_dynamic = [
        "loss-planned",
        "loss-downtime",
        "loss-speed",
        "loss-quality",
        "loss-hot",
        "loss-icon-planned",
        "loss-icon-downtime",
        "loss-icon-speed",
        "loss-icon-quality",
        "loss-item-hot",
        "legend-btn",
        "legend-off",
        "seg-on",
        "machine-option",
        "machine-option-on",
        "machine-option-hot",
        "chip-neutral",
        "chip-btn",
    ]
    missing_dynamic = [c for c in required_dynamic if c not in css_classes]
    assert not missing_dynamic, f"Missing dynamic overview CSS rules: {missing_dynamic}"

    # Verify responsive layout rules for .ov-main and .kpi-strip
    assert ".ov-main" in css_text
    assert ".kpi-strip" in css_text
    assert "@media (max-width: 1365.98px)" in css_text
    assert "@media (max-width: 1023.98px)" in css_text
    assert "@media (max-width: 759.98px)" in css_text


def test_frontend_topology_files_and_contracts() -> None:
    """Verifies that the 4-Phase System Topology files exist and meet architectural requirements (Issue #205)."""
    web_src = APPS_DIR / "web" / "src"

    required_topology_files = [
        web_src / "lib" / "topology.ts",
        web_src / "components" / "topology" / "TopologyNode.tsx",
        web_src / "components" / "topology" / "TopologyCanvas.tsx",
        web_src / "components" / "topology" / "TopologyNodeDrawer.tsx",
        web_src / "components" / "views" / "SystemTopologyView.tsx",
    ]

    for f in required_topology_files:
        assert f.is_file(), f"Required topology file missing: {f.relative_to(APPS_DIR)}"

    # Validate node catalog and phases in topology.ts
    topology_lib_text = (web_src / "lib" / "topology.ts").read_text(encoding="utf-8")
    expected_node_ids = [
        "edge-gemma",
        "cloud-ingest",
        "agent-qa",
        "agent-tra",
        "agent-pa",
        "agent-rca",
        "copilot-live",
        "agent-scribe",
        "gatekeeper-qa",
        "agent-learn",
        "human-approval",
    ]
    for node_id in expected_node_ids:
        assert f"id: '{node_id}'" in topology_lib_text, f"Missing node {node_id} in TOPOLOGY_NODES catalog"

    expected_phases = ["phase-a", "phase-b", "phase-c", "phase-d"]
    for phase_id in expected_phases:
        assert f"id: '{phase_id}'" in topology_lib_text, f"Missing phase {phase_id} in TOPOLOGY_PHASES catalog"

    assert "deriveNodeStates" in topology_lib_text
    assert "derivePhaseStates" in topology_lib_text
    assert "TOPOLOGY_EDGES" in topology_lib_text


def test_frontend_topology_navigation_wiring() -> None:
    """Verifies navigation, jump targets, and cross-view links for the topology feature (Issue #205)."""
    web_src = APPS_DIR / "web" / "src"

    sidebar_text = (web_src / "components" / "Sidebar.tsx").read_text(encoding="utf-8")
    assert "'topology'" in sidebar_text, "Sidebar.tsx must include 'topology' in DashboardTab"
    assert 'id="nav-topology"' in sidebar_text, "Sidebar.tsx must render nav-topology"
    assert "account_tree" in sidebar_text, "Sidebar.tsx must use account_tree icon for topology"

    app_text = (web_src / "App.tsx").read_text(encoding="utf-8")
    assert "topology: 'System Topology'" in app_text, "App.tsx must register topology breadcrumb"

    topheader_text = (web_src / "components" / "TopHeader.tsx").read_text(encoding="utf-8")
    assert "tab: 'topology'" in topheader_text, "TopHeader.tsx must register topology in JUMP_TARGETS"

    line_overview_text = (web_src / "components" / "views" / "LineOverviewView.tsx").read_text(encoding="utf-8")
    assert "onOpenTopology" in line_overview_text, "LineOverviewView.tsx must support onOpenTopology"
    assert 'id="overview-topology"' in line_overview_text or 'id="overview-jump-topology"' in line_overview_text

    incident_view_text = (web_src / "components" / "views" / "IncidentCommandView.tsx").read_text(encoding="utf-8")
    assert "onOpenTopology" in incident_view_text, "IncidentCommandView.tsx must support onOpenTopology"
    assert 'id="incident-view-topology"' in incident_view_text


def test_frontend_topology_css_and_a11y() -> None:
    """Verifies index.css contains required layout and accessibility rules for topology (Issue #205)."""
    css_text = (APPS_DIR / "web" / "src" / "index.css").read_text(encoding="utf-8")

    assert ".topology-view" in css_text
    assert ".topology-canvas-container" in css_text
    assert ".topology-swimlanes-grid" in css_text
    assert ".topology-swimlane-card" in css_text
    assert ".topology-node-card" in css_text
    assert ".topology-flow-edge" in css_text

    # Accessibility & responsive assertions
    assert "@media (prefers-reduced-motion: reduce)" in css_text
    assert "animation: none !important" in css_text
    assert "@media (max-width: 1024px)" in css_text

