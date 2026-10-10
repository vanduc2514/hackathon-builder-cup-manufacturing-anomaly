"""Tests for 8D Report & SOP Document Viewer with Shift Leader Approval (Issue #35).

Validates:
1. Component topology: DocumentApprovals.tsx and Report8DCard.tsx exist and export default components.
2. Architecture invariant #5: No hardcoded 'localhost:8000' backend URLs; uses relative paths.
3. 8D Disciplines completeness: Renders all D1-D8 sections (Team through Congratulate/Closure).
4. Work Order requisition: Displays drafted spare parts (WNMG-080408, torque 4.2 Nm, runout tolerance).
5. SOP Revision proposal: Displays SOP-MNT-CNC-04 with 1,900-part warning and 2,000-part lockout rules.
6. Shift Leader sign-off contract: POST /api/incidents/approve enforces closed-state gatekeeping (Invariant #3).
7. Downloadable artifacts: Markdown, JSON, and PDF/print export capabilities present.
8. Approval audit trail: Approver profile, timestamp, SHA-256 signature hash, and ISO/IATF compliance standards.
9. Schema compatibility: Backend Pydantic models (EightDReport, WorkOrder, SOPRevisionProposal) mirror UI structures.
"""

from __future__ import annotations

from pathlib import Path
from typing import Generator

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import (
    EightDReport,
    SOPRevisionProposal,
    WorkOrder,
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
SRC_DIR = FRONTEND_DIR / "src"
COMPONENTS_DIR = SRC_DIR / "components"


@pytest.fixture(autouse=True)
def clean_test_environment() -> Generator[None, None, None]:
    """Ensures clean blackboard and orchestrator state before and after each test."""
    blackboard.reset()
    yield
    blackboard.reset()


def test_document_approvals_component_exists_and_exports_default() -> None:
    """Verifies DocumentApprovals.tsx and Report8DCard.tsx exist and have default exports."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    assert doc_approvals_path.exists(), "DocumentApprovals.tsx must exist in frontend/src/components"
    content = doc_approvals_path.read_text(encoding="utf-8")
    assert "export default function DocumentApprovals" in content

    report_8d_path = COMPONENTS_DIR / "Report8DCard.tsx"
    assert report_8d_path.exists(), "Report8DCard.tsx must exist in frontend/src/components"
    report_content = report_8d_path.read_text(encoding="utf-8")
    assert "export default function Report8DCard" in report_content
    assert "DocumentApprovals" in report_content, "Report8DCard should compose DocumentApprovals"


def test_no_hardcoded_backend_urls_key_invariant_5() -> None:
    """Enforces Key Invariant #5: No frontend component hardcodes localhost:8000."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    content = doc_approvals_path.read_text(encoding="utf-8")

    assert "localhost:8000" not in content, "DocumentApprovals.tsx must not hardcode localhost:8000"
    assert "/api/incidents/approve" in content, "Must use relative /api/incidents/approve endpoint"


def test_eight_d_disciplines_content_completeness() -> None:
    """Verifies presence of all 8 standard automotive/electronics disciplines (D1-D8)."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    content = doc_approvals_path.read_text(encoding="utf-8")

    expected_disciplines = [
        ("D1", "Team Formation"),
        ("D2", "Problem Description"),
        ("D3", "Containment Actions"),
        ("D4", "Root Cause Analysis"),
        ("D5", "Permanent Corrective Actions"),
        ("D6", "Verification & Validation"),
        ("D7", "Prevent Recurrence"),
        ("D8", "Team Recognition & Closure"),
    ]

    for code, title in expected_disciplines:
        assert code in content, f"Discipline {code} missing in DocumentApprovals.tsx"
        assert title in content, f"Discipline title '{title}' missing in DocumentApprovals.tsx"


def test_work_order_spare_parts_requisition_specifications() -> None:
    """Verifies maintenance work order view includes tool T07 spare parts and torque specs."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    content = doc_approvals_path.read_text(encoding="utf-8")

    assert "WO-2026-1004" in content or "WO-8821" in content
    assert "WNMG-080408" in content, "Must specify WNMG-080408 carbide turning insert"
    assert "4.2 Nm" in content, "Must specify calibrated 4.2 Nm clamping torque"
    assert "0.005 mm" in content, "Must specify spindle TIR runout tolerance"


def test_sop_revision_piece_counter_threshold_alerts() -> None:
    """Verifies SOP revision view proposes 1,900-part warning and 2,000-part lockout rules."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    content = doc_approvals_path.read_text(encoding="utf-8")

    assert "SOP-MNT-CNC-04" in content, "Must reference target SOP SOP-MNT-CNC-04"
    assert "1,900" in content or "1900" in content, "Must specify 1,900-part warning threshold alert"
    assert "2,000" in content or "2000" in content, "Must specify 2,000-part hard lockout"


def test_downloadable_artifacts_and_export_capabilities() -> None:
    """Verifies presence of Markdown, JSON, and PDF/Print export handlers."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    content = doc_approvals_path.read_text(encoding="utf-8")

    assert "handleExportMarkdown" in content, "Must implement Markdown export"
    assert "handleExportJson" in content, "Must implement JSON archive export"
    assert "handlePrint" in content or "window.print" in content, "Must implement print/PDF export"
    assert "8D_Report_" in content, "Must set filename for downloaded report"


def test_approval_audit_trail_metadata_and_signature_hash() -> None:
    """Verifies approval audit trail renders approver, timestamp, and digital signature hash."""
    doc_approvals_path = COMPONENTS_DIR / "DocumentApprovals.tsx"
    content = doc_approvals_path.read_text(encoding="utf-8")

    assert "SL-702" in content, "Must display Shift Leader ID SL-702"
    assert "sha256:" in content, "Must display cryptographic SHA-256 digital signature hash"
    assert "ISO 9001" in content, "Must reference ISO 9001 quality compliance"
    assert "IATF 16949" in content, "Must reference IATF 16949 automotive standard"


def test_backend_shift_leader_approval_workflow_invariant_gatekeeping() -> None:
    """Tests POST /api/incidents/approve gatekeeping: only closed incidents can be approved."""
    client = TestClient(app)

    # 1. When status is 'normal' or 'detecting', approval must fail with 409 Conflict
    blackboard.update_status("detecting")
    resp_premature = client.post("/api/incidents/approve")
    assert resp_premature.status_code == 409
    assert "No closed incident awaiting approval" in resp_premature.json()["detail"]

    # 2. Transition incident to closed (simulating 50/50 streak completion)
    blackboard.update_status("closed")
    snap = blackboard.get_state()
    assert snap.status == "closed"
    assert not snap.approved

    # 3. Approving closed incident succeeds
    resp_approve = client.post("/api/incidents/approve")
    assert resp_approve.status_code == 200
    approved_data = resp_approve.json()
    assert "Incident approved by Shift Leader" in approved_data["message"]
    assert approved_data["state"]["approved"] is True
    assert approved_data["state"]["status"] == "closed"

    # Verify blackboard state is now approved
    updated_snap = blackboard.get_state()
    assert updated_snap.approved is True

    # 4. Subsequent approval request returns 409 (already approved)
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
