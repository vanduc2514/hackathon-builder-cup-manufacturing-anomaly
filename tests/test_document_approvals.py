"""Tests for the 8D Report & SOP Shift Leader approval backend contract (Issue #35).

Validates:
6. Shift Leader sign-off contract: POST /api/incidents/approve enforces closed-state gatekeeping (Invariant #3).
9. Schema compatibility: Backend Pydantic models (EightDReport, WorkOrder, SOPRevisionProposal) mirror UI structures.
"""

from __future__ import annotations

from typing import Generator

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import (
    EightDReport,
    ImpactMetrics,
    SOPRevisionProposal,
    WorkOrder,
)


@pytest.fixture(autouse=True)
def clean_test_environment() -> Generator[None, None, None]:
    """Ensures clean blackboard and orchestrator state before and after each test."""
    blackboard.reset()
    yield
    blackboard.reset()


def test_backend_shift_leader_approval_workflow_invariant_gatekeeping() -> None:
    """Tests POST /api/incidents/approve gatekeeping: only learning-complete incidents can be approved."""
    client = TestClient(app)

    # 1. When status is 'normal' or 'detecting', approval must fail with 409 Conflict
    blackboard.update_status("detecting")
    resp_premature = client.post("/api/incidents/approve")
    assert resp_premature.status_code == 409
    assert "No incident awaiting approval" in resp_premature.json()["detail"]

    # 2. Approval before learning finishes (status 'closed' after close_incident) is rejected
    blackboard.update_status("closed")
    resp_pre_learning = client.post("/api/incidents/approve")
    assert resp_pre_learning.status_code == 409
    assert not blackboard.get_state().approved

    # 3. Learning completes: the incident moves to 'pending_approval'
    blackboard.update_status("pending_approval", impact=ImpactMetrics())
    snap = blackboard.get_state()
    assert snap.status == "pending_approval"
    assert not snap.approved
    assert snap.approved_by is None

    # 4. Approving the learning-complete incident succeeds and records the signed-in user
    resp_approve = client.post("/api/incidents/approve")
    assert resp_approve.status_code == 200
    approved_data = resp_approve.json()
    assert approved_data["message"] == "Incident approved by test"
    assert approved_data["state"]["approved"] is True
    assert approved_data["state"]["status"] == "closed"
    assert approved_data["state"]["approved_by"] == "test"
    assert approved_data["state"]["approved_at"] is not None

    # Verify blackboard state is now approved with the approver identity
    updated_snap = blackboard.get_state()
    assert updated_snap.approved is True
    assert updated_snap.approved_by == "test"
    assert updated_snap.approved_at is not None

    # 5. Subsequent approval request returns 409 (already approved)
    resp_repeat = client.post("/api/incidents/approve")
    assert resp_repeat.status_code == 409


def test_pydantic_models_schema_parity() -> None:
    """Verifies backend Pydantic models for 8D Report, Work Order, and SOP Revision."""
    # EightDReport model validation
    report = EightDReport(
        incident_id="INC-0412",
        d1_team="Kaizen Multi-Agent Team & Shift Leader SL-702",
        d2_problem="Vertical scratch defect rate 7.7% > 3.0% UCL",
        d3_containment="Quarantine lot CNC-02-B, 100% optical inspection",
        d4_root_cause="Insert flank wear VB > 0.30 mm causing chatter",
        d5_corrective_actions="Replace T07 insert with WNMG-080408, torque 4.2 Nm",
        d6_implementation="50 consecutive defect-free parts confirmed",
        d7_preventive_action="SOP-MNT-CNC-04 revised with 1,900-part warning limit",
        d8_congratulate_team="Knowledge base updated in Vertex AI Search RAG",
        pending_approval="shift_leader",
        approved=False,
    )
    assert report.incident_id == "INC-0412"
    assert report.approved is False

    # WorkOrder model validation
    wo = WorkOrder(
        work_order_id="WO-2026-1004",
        title="Emergency Tooling Replacement & Spindle Calibration",
        equipment_id="CNC-02",
        description="Replace insert T07, torque to 4.2 Nm, verify TIR <= 0.005 mm",
        parts_required=["WNMG-080408 Carbide Insert", "M4x10 Torx Screw"],
        priority="HIGH",
        status="DRAFT",
    )
    assert wo.work_order_id == "WO-2026-1004"
    assert len(wo.parts_required) == 2

    # SOPRevisionProposal model validation
    sop = SOPRevisionProposal(
        sop_id="SOP-MNT-CNC-04",
        title="CNC Turning Tool Wear Management",
        equipment_id="CNC-02",
        current_procedure="Calendar-based inspection every 14 days",
        proposed_revision="Automated piece counter alert at 1,900 parts and lockout at 2,000 parts",
        justification="Prevents flank wear from exceeding 0.30 mm limit",
        threshold_alert_parts=1900,
    )
    assert sop.sop_id == "SOP-MNT-CNC-04"
    assert sop.threshold_alert_parts == 1900
