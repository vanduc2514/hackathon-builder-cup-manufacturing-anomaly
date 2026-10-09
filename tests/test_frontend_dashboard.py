"""Tests for Frontend Web Dashboard Execution, Component Topology, and API Proxying (Issue #83).

Validates:
1. Frontend build and TypeScript type-checking execute without errors.
2. Vite configuration sets port 3000 and proxies /api to localhost:8000.
3. Architecture invariant: No frontend component hardcodes localhost backend addresses.
4. All dashboard components (Telemetry, SPC, Andon, 5-Whys, 8D Report, Impact) exist and export valid modules.
5. SSE connection contracts (/api/incidents/stream and /api/incidents/events) deliver valid IncidentState packets.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import AgentFinding, IncidentState

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
SRC_DIR = FRONTEND_DIR / "src"


def test_vite_config_proxy_and_port() -> None:
    """Verifies vite.config.ts configures port 3000 and reverse proxies /api to localhost:8000."""
    vite_config_path = FRONTEND_DIR / "vite.config.ts"
    assert vite_config_path.exists(), "vite.config.ts must exist"

    content = vite_config_path.read_text(encoding="utf-8")
    assert "port: 3000" in content, "Vite server port must be configured to 3000"
    assert "'/api'" in content or '"/api"' in content, "Vite must proxy /api prefix"
    assert "http://localhost:8000" in content, "Vite proxy target must be http://localhost:8000"
    assert "changeOrigin: true" in content, "Vite proxy must enable changeOrigin"


def test_frontend_components_architecture_invariants() -> None:
    """Verifies that no frontend source files violate Key Invariant #5 (no hardcoded backend hostnames)."""
    tsx_files = list(SRC_DIR.glob("**/*.tsx")) + list(SRC_DIR.glob("**/*.ts"))
    assert len(tsx_files) >= 8, (
        f"Expected at least 8 frontend TS/TSX source files, found {len(tsx_files)}"
    )

    for file_path in tsx_files:
        content = file_path.read_text(encoding="utf-8")
        # Invariant 5: Frontend never calls backend directly by hostname. All API calls use relative URLs (/api/...)
        assert "localhost:8000" not in content, (
            f"Violation of Key Invariant #5 in {file_path.relative_to(FRONTEND_DIR)}: "
            "Found hardcoded 'localhost:8000'. All API calls must use relative URLs."
        )


def test_required_dashboard_components_exist() -> None:
    """Verifies all required dashboard views and components exist in frontend/src/components."""
    components_dir = SRC_DIR / "components"
    required_components = [
        "AndonPhaseTracker.tsx",
        "DemoController.tsx",
        "ImpactCard.tsx",
        "IncidentStream.tsx",
        "IshikawaViewer.tsx",
        "ProductionLine.tsx",
        "Report8DCard.tsx",
        "RootCauseCard.tsx",
        "SpcChart.tsx",
        "TelemetryChart.tsx",
    ]

    for comp in required_components:
        comp_path = components_dir / comp
        assert comp_path.exists(), f"Dashboard component {comp} is missing in {components_dir}"
        content = comp_path.read_text(encoding="utf-8")
        assert "export default function" in content, f"{comp} must have a default export component"


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


def test_frontend_typescript_typecheck() -> None:
    """Executes 'npm run typecheck' to verify zero TypeScript compilation errors."""
    result = subprocess.run(
        ["npm", "run", "typecheck"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"TypeScript typecheck failed:\n{result.stdout}\n{result.stderr}"


def test_frontend_vite_build() -> None:
    """Executes 'npm run build' to verify production bundle generation succeeds cleanly."""
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"Vite build failed:\n{result.stdout}\n{result.stderr}"

    dist_index = FRONTEND_DIR / "dist" / "index.html"
    assert dist_index.exists(), "Build artifact dist/index.html must be generated"
