"""Unit tests for core Pydantic models."""

from __future__ import annotations

import json

from backend.core.models import (
    AgentFinding,
    ImpactMetrics,
    IncidentState,
    MachineTelemetryPayload,
)


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


def test_eight_d_report_and_document_schemas():
    from backend.core.models import (
        EightDReport,
        KnowledgeBaseEntry,
        RepairVideoAnalysis,
        SOPRevisionProposal,
        WorkOrder,
    )

    r8d = EightDReport(
        incident_id="INC-0412",
        d1_team="Team",
        d2_problem="Problem",
        d3_containment="Containment",
        d4_root_cause="Root cause",
        d5_corrective_actions="Corrective",
        d6_implementation="Verification",
        d7_preventive_action="Preventive",
        d8_congratulate_team="Closure",
    )
    assert r8d.pending_approval == "shift_leader"
    assert r8d.approved is False

    wo = WorkOrder(
        work_order_id="WO-8821",
        title="Replace insert",
        equipment_id="CNC-02",
        description="Replace tool T07 insert",
        parts_required=["WNMG-080408"],
    )
    assert wo.work_order_id == "WO-8821"
    assert wo.pending_approval == "shift_leader"

    sop = SOPRevisionProposal(
        sop_id="SOP-MNT-CNC-04",
        title="Tool Life Management",
        equipment_id="CNC-02",
        current_procedure="Weekly",
        proposed_revision="1900 parts alarm",
        justification="Tool life",
        threshold_alert_parts=1900,
    )
    assert sop.threshold_alert_parts == 1900
    assert sop.pending_approval == "shift_leader"

    video = RepairVideoAnalysis(
        video_uri="gs://bucket/video.mp4",
        title="Walkthrough",
        equipment_id="CNC-02",
        key_steps=["Step 1"],
    )
    assert video.equipment_id == "CNC-02"

    kb = KnowledgeBaseEntry(
        entry_id="KB-001",
        incident_id="INC-0412",
        defect_type="scratch_vertical",
        machine_id="CNC-02",
        tool_id="T07",
        root_cause="Flank wear",
        resolution_steps=["Replace insert"],
        preventive_action="Update SOP",
        video_metadata=video,
    )
    assert kb.entry_id == "KB-001"
    assert kb.impact.scrap_avoided == 240
    assert kb.video_metadata is not None


def test_incident_summary_schema():
    from backend.core.models import IncidentSummary

    state = IncidentState(
        incident_id="INC-0412",
        status="closed",
        status_reason="All 50 parts passed verification",
        severity="high",
        defect_type="scratch_vertical",
        defect_rate=0.082,
        spc_ucl=0.030,
        suspect_machine="CNC-02",
        suspect_tool="T07",
        root_cause="Insert T07 flank wear exceeded 0.3mm",
        repair_done=True,
        approved=True,
        verification_count=50,
        verification_target=50,
        opened_at="2026-10-15T09:30:00Z",
        closed_at="2026-10-15T09:42:00Z",
        updated_at="09:42:15",
    )
    summary = IncidentSummary.from_incident(state)
    assert summary.incident_id == "INC-0412"
    assert summary.status == "closed"
    assert summary.status_reason == "All 50 parts passed verification"
    assert summary.severity == "high"
    assert summary.suspect_machine == "CNC-02"
    assert summary.suspect_tool == "T07"
    assert summary.repair_done is True
    assert summary.approved is True
    assert summary.verification_count == 50
    assert summary.opened_at == "2026-10-15T09:30:00Z"
    assert summary.closed_at == "2026-10-15T09:42:00Z"
    dump = summary.model_dump()
    assert dump["incident_id"] == "INC-0412"
    assert dump["closed_at"] == "2026-10-15T09:42:00Z"


# ---------------------------------------------------------------------------
# TKT-071 / issue #269 — Competition MQTT nested payload schema adapter
# ---------------------------------------------------------------------------


_NESTED_SPEC = {
    "timestamp": "2026-10-01T09:00:00Z",
    "asset": {
        "factory_id": "FACTORY_01",
        "line_id": "LINE_01",
        "machine_id": "MOTOR_01",
        "machine_type": "INDUCTION_MOTOR",
    },
    "operating": {"status": "RUNNING", "load_percent": 70, "runtime_hours": 1200},
    "sensor": {
        "temperature": {"value": 65.2, "unit": "C"},
        "vibration": {"value": 2.1, "unit": "mm/s"},
        "rpm": {"value": 1480, "unit": "rpm"},
        "current": {"value": 12.3, "unit": "A"},
    },
    "health": {"status": "NORMAL", "anomaly_score": 0.12},
}


def test_nested_payload_validation():
    """Exact nested JSON from AI-sensor-spec.md maps to canonical flat model."""
    payload = MachineTelemetryPayload.model_validate(_NESTED_SPEC)
    # asset.machine_id present → machine_id resolves to the asset leaf
    assert payload.machine_id == "MOTOR_01"
    assert payload.tool_id == "MOTOR_01"
    assert payload.timestamp == "2026-10-01T09:00:00Z"
    assert payload.operating_status == "NORMAL"
    assert payload.spindle_vibration == pytest_approx(2.1)
    assert payload.spindle_temp == pytest_approx(65.2)
    assert payload.motor_current == pytest_approx(12.3)
    assert payload.rpm == 1480
    assert payload.anomaly_score == pytest_approx(0.12)


def test_nested_payload_via_json_string():
    """Accepts JSON-formatted nested payload (the actual wire format)."""
    raw = json.dumps(_NESTED_SPEC)
    payload = MachineTelemetryPayload.model_validate_json(raw)
    assert payload.machine_id == "MOTOR_01"
    assert payload.spindle_vibration == pytest_approx(2.1)
    assert payload.rpm == 1480


def test_flat_payload_still_validates():
    """Backward compatibility — legacy flat schema still parses unchanged."""
    flat = {
        "machine_id": "CNC-02",
        "tool_id": "T07",
        "operating_status": "WARNING",
        "spindle_vibration": 3.1,
        "spindle_temp": 55.5,
        "motor_current": 14.2,
        "rpm": 1470,
        "anomaly_score": 0.42,
        "timestamp": "2026-10-15T11:00:00Z",
    }
    payload = MachineTelemetryPayload.model_validate(flat)
    assert payload.machine_id == "CNC-02"
    assert payload.operating_status == "WARNING"
    assert payload.spindle_vibration == pytest_approx(3.1)
    assert payload.spindle_temp == pytest_approx(55.5)
    assert payload.motor_current == pytest_approx(14.2)
    assert payload.rpm == 1470
    assert payload.anomaly_score == pytest_approx(0.42)


def test_nested_operating_status_mapping():
    """NORMAL->NORMAL, ANOMALY/ABNORMAL/FAULT/ALARM->ALARM, anything else->WARNING."""
    cases = [
        ("NORMAL", "NORMAL"),
        (
            "RUNNING",
            "WARNING",
        ),  # Tech Lead plan: only the canonical health statuses map; others → WARNING
        ("FAULT", "ALARM"),
        ("ALARM", "ALARM"),
        ("ANOMALY", "ALARM"),
        ("ABNORMAL", "ALARM"),
        ("WARNING", "WARNING"),
        ("DEGRADED", "WARNING"),
        ("", "WARNING"),
    ]
    for raw, expected in cases:
        nested = {
            "asset": {"machine_id": "MOTOR_01"},
            "health": {"status": raw},
            "sensor": {
                "temperature": {"value": 50.0},
                "vibration": {"value": 1.0},
                "rpm": {"value": 1000},
                "current": {"value": 5.0},
            },
        }
        payload = MachineTelemetryPayload.model_validate(nested)
        assert payload.operating_status == expected, (
            f"raw={raw!r} expected={expected!r} got={payload.operating_status!r}"
        )


def test_anomaly_score_fallback_when_missing():
    """health.anomaly_score missing -> model default (0.0)."""
    nested = {
        "asset": {"machine_id": "MOTOR_01"},
        "health": {"status": "NORMAL"},  # no anomaly_score key
        "sensor": {
            "temperature": {"value": 50.0},
            "vibration": {"value": 1.0},
            "rpm": {"value": 1000},
            "current": {"value": 5.0},
        },
    }
    payload = MachineTelemetryPayload.model_validate(nested)
    assert payload.anomaly_score == 0.0


def test_mixed_batch_mapping_invariant():
    """Several nested payloads share consistent field mapping rules."""
    rows = [
        {
            "asset": {"machine_id": "MOTOR_01"},
            "health": {"status": "NORMAL", "anomaly_score": 0.05},
            "sensor": {
                "temperature": {"value": 42.0},
                "vibration": {"value": 1.8},
                "rpm": {"value": 1480},
                "current": {"value": 12.0},
            },
        },
        {
            "asset": {"machine_id": "MOTOR_02"},
            "health": {"status": "ALARM", "anomaly_score": 0.91},
            "sensor": {
                "temperature": {"value": 88.0},
                "vibration": {"value": 5.5},
                "rpm": {"value": 1320},
                "current": {"value": 19.7},
            },
        },
    ]
    results = [MachineTelemetryPayload.model_validate(r) for r in rows]
    assert results[0].operating_status == "NORMAL"
    assert results[1].operating_status == "ALARM"
    assert results[0].spindle_vibration == pytest_approx(1.8)
    assert results[1].spindle_vibration == pytest_approx(5.5)
    assert results[0].rpm == 1480
    assert results[1].rpm == 1320
    assert results[0].motor_current == pytest_approx(12.0)
    assert results[1].motor_current == pytest_approx(19.7)


def test_machine_id_fallback_from_factory_line_segments():
    """machine_id falls back to asset.factory_id/line_id/asset.machine_id concatenation."""
    nested = {
        "asset": {
            "factory_id": "FACTORY_02",
            "line_id": "LINE_07",
            # asset.machine_id deliberately missing
        },
        "sensor": {
            "temperature": {"value": 50.0},
            "vibration": {"value": 1.0},
            "rpm": {"value": 1000},
            "current": {"value": 5.0},
        },
        "health": {"status": "NORMAL"},
    }
    payload = MachineTelemetryPayload.model_validate(nested)
    assert payload.machine_id == "FACTORY_02/LINE_07"


# Tiny inline pytest.approx substitute so the suite does not depend on pytest
# internals. Real pytest.approx would also work fine, but this keeps the test
# file standalone-runnable.
class _Approx:
    def __init__(self, value: float) -> None:
        self.value = value

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, (int, float)):
            return False
        return abs(float(other) - self.value) < 1e-6


def pytest_approx(value: float) -> _Approx:
    return _Approx(float(value))
