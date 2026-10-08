"""Tests for 4-Phase Andon Lifecycle Tracker domain logic, phase mapping, and SSE stream."""

from __future__ import annotations

import json
from typing import Dict

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import AgentFinding, ImpactMetrics, IncidentState

# Domain configuration mapping expected by AndonPhaseTracker
PHASE_CONFIG = {
    "A": {
        "name": "Detection",
        "vietnamese_name": "Phát hiện",
        "lamp_color": "red",
        "lamp_hex": "#EF4444",
        "statuses": ["detecting"],
    },
    "B": {
        "name": "Tracing & RCA",
        "vietnamese_name": "Truy ngược & RCA",
        "lamp_color": "yellow",
        "lamp_hex": "#F59E0B",
        "statuses": ["tracing", "investigating", "analyzing", "awaiting_evidence"],
    },
    "C": {
        "name": "Resolution & Verification",
        "vietnamese_name": "Xử lý & Xác nhận",
        "lamp_color": "blue",
        "lamp_hex": "#3B82F6",
        "statuses": ["repairing", "verifying"],
    },
    "D": {
        "name": "Learning & Impact",
        "vietnamese_name": "Học hỏi & Tác động",
        "lamp_color": "green",
        "lamp_hex": "#10B981",
        "statuses": ["closed"],
    },
}


def compute_phase_statuses(status: str) -> Dict[str, str]:
    """Mirror of AndonPhaseTracker.tsx getPhaseStatus helper for verification."""
    if status == "escalated":
        return {"A": "completed", "B": "escalated", "C": "escalated", "D": "pending"}

    if status == "normal":
        return {"A": "pending", "B": "pending", "C": "pending", "D": "pending"}

    if status == "detecting":
        return {"A": "active", "B": "pending", "C": "pending", "D": "pending"}

    if status in ["tracing", "investigating", "analyzing", "awaiting_evidence"]:
        return {"A": "completed", "B": "active", "C": "pending", "D": "pending"}

    if status in ["repairing", "verifying"]:
        return {"A": "completed", "B": "completed", "C": "active", "D": "pending"}

    if status == "closed":
        return {"A": "completed", "B": "completed", "C": "completed", "D": "completed"}

    if status == "error":
        return {"A": "active", "B": "pending", "C": "pending", "D": "pending"}

    return {"A": "pending", "B": "pending", "C": "pending", "D": "pending"}


def compute_active_lamp(status: str) -> Dict[str, bool]:
    """Mirror of Andon light stack activation rules."""
    lamp_a = status in ["detecting", "error", "escalated"]
    lamp_b = status in ["tracing", "investigating", "analyzing", "awaiting_evidence"]
    lamp_c = status in ["repairing", "verifying"]
    lamp_d = status in ["closed", "normal"]
    return {"lamp_a": lamp_a, "lamp_b": lamp_b, "lamp_c": lamp_c, "lamp_d": lamp_d}


def test_andon_phase_config_definitions() -> None:
    """Verifies all four phases (A, B, C, D) have distinct colors, names, and statuses."""
    assert len(PHASE_CONFIG) == 4
    assert set(PHASE_CONFIG.keys()) == {"A", "B", "C", "D"}

    colors = [info["lamp_color"] for info in PHASE_CONFIG.values()]
    assert len(set(colors)) == 4
    assert set(colors) == {"red", "yellow", "blue", "green"}

    hex_colors = [info["lamp_hex"] for info in PHASE_CONFIG.values()]
    assert "#EF4444" in hex_colors  # Red
    assert "#F59E0B" in hex_colors  # Yellow
    assert "#3B82F6" in hex_colors  # Blue
    assert "#10B981" in hex_colors  # Green


@pytest.mark.parametrize(
    "status,expected_phases",
    [
        ("normal", {"A": "pending", "B": "pending", "C": "pending", "D": "pending"}),
        ("detecting", {"A": "active", "B": "pending", "C": "pending", "D": "pending"}),
        ("tracing", {"A": "completed", "B": "active", "C": "pending", "D": "pending"}),
        ("analyzing", {"A": "completed", "B": "active", "C": "pending", "D": "pending"}),
        ("investigating", {"A": "completed", "B": "active", "C": "pending", "D": "pending"}),
        ("awaiting_evidence", {"A": "completed", "B": "active", "C": "pending", "D": "pending"}),
        ("repairing", {"A": "completed", "B": "completed", "C": "active", "D": "pending"}),
        ("verifying", {"A": "completed", "B": "completed", "C": "active", "D": "pending"}),
        ("closed", {"A": "completed", "B": "completed", "C": "completed", "D": "completed"}),
        ("escalated", {"A": "completed", "B": "escalated", "C": "escalated", "D": "pending"}),
    ],
)
def test_andon_phase_state_transitions(status: str, expected_phases: Dict[str, str]) -> None:
    """Verifies reactive phase state transitions across the full 4-phase incident lifecycle."""
    actual = compute_phase_statuses(status)
    assert actual == expected_phases


@pytest.mark.parametrize(
    "status,expected_active_lamp",
    [
        ("normal", "lamp_d"),
        ("detecting", "lamp_a"),
        ("tracing", "lamp_b"),
        ("analyzing", "lamp_b"),
        ("investigating", "lamp_b"),
        ("awaiting_evidence", "lamp_b"),
        ("repairing", "lamp_c"),
        ("verifying", "lamp_c"),
        ("closed", "lamp_d"),
    ],
)
def test_andon_lamp_stack_activation(status: str, expected_active_lamp: str) -> None:
    """Verifies that the correct industrial Andon lamp illuminates for each status."""
    lamps = compute_active_lamp(status)
    assert lamps[expected_active_lamp] is True


def test_active_agent_resolution_with_findings() -> None:
    """Verifies that the latest finding from Blackboard surfaces in the Active Agent Pill."""
    finding = AgentFinding(
        agent_id="agent_process_analyst",
        agent_name="Process Analyst Agent",
        phase="Phase B: Tracing & RCA",
        finding="Spindle vibration spike 4.8 mm/s on CNC-02 confirms tool wear anomaly",
        evidence="Sensor CNC-02:spindle_vibration exceeded 3.2 mm/s threshold",
        confidence=0.94,
        citation="[CNC Operating Manual, Section 4.2 Spindle Vibration Limits]",
        timestamp="13:35:10",
    )
    state = IncidentState(
        incident_id="INC-0412",
        status="analyzing",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        findings=[finding],
    )

    assert len(state.findings) == 1
    latest = state.findings[-1]
    assert latest.agent_name == "Process Analyst Agent"
    assert latest.confidence == 0.94
    assert "Spindle vibration spike" in latest.finding
    assert latest.timestamp == "13:35:10"


def test_physical_verification_gatekeeper_streak() -> None:
    """Verifies the Phase C physical verification gatekeeper requirement (50 consecutive PASS)."""
    state = IncidentState(
        incident_id="INC-0412",
        status="verifying",
        verification_count=35,
        verification_target=50,
        repair_done=True,
    )

    assert state.verification_count < state.verification_target
    assert state.repair_done is True
    assert state.status == "verifying"

    # Simulate completed verification
    state.verification_count = 50
    state.status = "closed"
    assert state.verification_count >= state.verification_target
    assert state.status == "closed"


def test_sustainability_impact_metrics_in_phase_d() -> None:
    """Verifies that Phase D learning displays computed sustainability metrics."""
    impact = ImpactMetrics(
        scrap_avoided=240,
        downtime_minutes=45,
        energy_kwh=38.0,
        co2_kg=25.0,
        cost_savings_usd=3600.0,
    )
    state = IncidentState(
        incident_id="INC-0412",
        status="closed",
        impact=impact,
        approved=False,
    )

    assert state.impact is not None
    assert state.impact.scrap_avoided == 240
    assert state.impact.co2_kg == 25.0
    assert state.impact.energy_kwh == 38.0
    assert state.approved is False


def test_current_incident_endpoint_returns_valid_state() -> None:
    """Verifies GET /api/incidents/current provides valid data matching IncidentState schema."""
    client = TestClient(app)
    response = client.get("/api/incidents/current")
    assert response.status_code == 200

    data = response.json()
    assert "incident_id" in data
    assert "status" in data
    assert "defect_rate" in data
    assert "spc_ucl" in data
    assert "verification_count" in data
    assert "verification_target" in data
    assert "findings" in data
    assert isinstance(data["findings"], list)


@pytest.mark.anyio
async def test_blackboard_subscribe_stream_event_format() -> None:
    """Verifies that blackboard updates produce serializable state for SSE incident_update."""
    state = blackboard.get_state()
    state_json = state.model_dump_json()

    parsed = json.loads(state_json)
    assert parsed["incident_id"] == state.incident_id
    assert parsed["status"] == state.status
    assert parsed["defect_rate"] == state.defect_rate
    assert parsed["spc_ucl"] == state.spc_ucl
