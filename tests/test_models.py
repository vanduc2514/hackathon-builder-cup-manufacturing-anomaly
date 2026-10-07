"""Unit tests for core Pydantic models."""

from __future__ import annotations

from backend.core.models import AgentFinding, ImpactMetrics, IncidentState


def test_agent_finding_schema():
    finding = AgentFinding(
        agent_id="QUALITY",
        agent_name="Quality Inspector",
        phase="Phase A - Detection",
        finding="Defect rate breached Upper Control Limit (UCL 0.05).",
        evidence="Observed rate 0.082 across 100 parts window.",
        confidence=0.96,
        citation="SPC Engine v1.2",
    )
    assert finding.agent_id == "QUALITY"
    assert finding.confidence == 0.96
    assert finding.citation == "SPC Engine v1.2"


def test_incident_state_lifecycle():
    state = IncidentState(
        incident_id="INC-TEST-001",
        status="investigating",
        defect_rate=0.075,
        verification_count=0,
        verification_target=50,
    )
    assert state.status == "investigating"
    assert state.verification_target == 50
    assert len(state.findings) == 0


def test_impact_metrics():
    impact = ImpactMetrics(
        scrap_avoided=120,
        downtime_minutes=30,
        energy_kwh=22.5,
        co2_kg=15.0,
    )
    assert impact.scrap_avoided == 120
    assert impact.co2_kg == 15.0


def test_incident_state_repair_done_default():
    state = IncidentState()
    assert state.repair_done is False


def test_repair_checkpoint_schema():
    from backend.core.models import RepairCheckpoint

    cp = RepairCheckpoint(
        step_number=4,
        title_vi="Đo độ đảo",
        instruction_vi="Dùng đồng hồ so rà độ đảo",
        citation="Sổ tay CNC trang 112",
        metric_name="Độ đảo",
        target_threshold=0.005,
        comparator="<=",
        unit="mm",
        is_verified=False,
    )
    assert cp.step_number == 4
    assert cp.target_threshold == 0.005
    assert cp.comparator == "<="
    assert cp.is_verified is False


def test_copilot_session_telemetry_schema():
    from backend.core.models import CopilotSessionTelemetry, CopilotTurn

    turn = CopilotTurn(
        turn_id=1,
        speaker="copilot",
        message_vi="Xin chào kỹ thuật viên",
        citation="OEM",
    )
    telemetry = CopilotSessionTelemetry(
        session_id="VN-TEST-01",
        incident_id="INC-0412",
        machine_id="CNC-02",
        checkpoints_total=5,
        checkpoints_passed=1,
        transcript=[turn],
    )
    assert telemetry.session_id == "VN-TEST-01"
    assert telemetry.checkpoints_total == 5
    assert len(telemetry.transcript) == 1
    assert telemetry.repair_done is False
