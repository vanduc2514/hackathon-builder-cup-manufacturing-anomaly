"""Unit and integration tests for Incident Scribe Agent (8D reports, work orders, SOP proposals, and HITL sign-off)."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.agents import agent_incident_scribe, agent_technician_copilot
from backend.agents.agent_incident_scribe import (
    AGENT_ID,
    AGENT_NAME,
    DEFAULT_CITATION,
    DEFAULT_IM_CITATION,
    PHASE,
    build_eight_d_report,
    build_scribe_draft,
    build_sop_proposal,
    build_work_order,
)
from backend.agents.workflow_nodes import record_resolution
from backend.core.blackboard import blackboard
from backend.core.models import (
    EightDReport,
    FindingDraft,
    IncidentState,
    ScribeDraft,
    SOPRevisionProposal,
    WorkOrder,
)


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_agent_incident_scribe_adk_definition():
    """Ensures Incident Scribe ADK agent is properly configured with contract and token limits."""
    assert agent_incident_scribe.agent.name == "incident_scribe"
    assert agent_incident_scribe.agent.output_schema == ScribeDraft
    assert agent_incident_scribe.agent.generate_content_config is not None
    assert agent_incident_scribe.agent.generate_content_config.max_output_tokens == 2048

    assert AGENT_ID == "DOC"
    assert AGENT_NAME == "Incident Scribe"
    assert PHASE == "Phase C - Documentation"


def test_build_eight_d_report_cnc_scenario():
    """Verifies complete 8D incident report generation (D1-D8) for CNC-02 tool wear."""
    state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
        defect_rate=0.077,
        spc_ucl=0.030,
    )

    report = build_eight_d_report(state)
    assert isinstance(report, EightDReport)
    assert report.incident_id == "INC-0412"
    assert report.pending_approval == "shift_leader"
    assert report.approved is False

    # D1: Cross-functional team
    assert "Quality Inspector" in report.d1_team
    assert "Root Cause Agent" in report.d1_team
    assert "Shift Leader" in report.d1_team

    # D2: 5W2H Problem description
    assert "CNC-02" in report.d2_problem
    assert "scratch_vertical" in report.d2_problem
    assert "7.7%" in report.d2_problem

    # D3: Containment
    assert "diverter" in report.d3_containment.lower()
    assert "AL-5083-B4" in report.d3_containment

    # D4: Root cause (5-Whys and Ishikawa)
    assert "T07" in report.d4_root_cause
    assert "2,400" in report.d4_root_cause
    assert "2,000" in report.d4_root_cause
    assert "flank wear" in report.d4_root_cause

    # D5: Corrective actions
    assert "WNMG-080408" in report.d5_corrective_actions
    assert "4.2 N·m" in report.d5_corrective_actions

    # D6: Verification
    assert "50 consecutive defect-free parts" in report.d6_implementation

    # D7: Preventive actions
    assert "SOP-MNT-CNC-04" in report.d7_preventive_action
    assert "1,900" in report.d7_preventive_action

    # D8: Congratulate team
    assert "shift leader sign-off" in report.d8_congratulate_team.lower()


def test_build_eight_d_report_im_scenario():
    """Verifies complete 8D incident report generation for Injection Molding scenario."""
    state = IncidentState(
        incident_id="INC-0520",
        suspect_machine="IM-05",
        suspect_tool="Cavity 3",
        defect_type="short_fill",
        defect_rate=0.082,
        spc_ucl=0.030,
    )

    report = build_eight_d_report(state)
    assert isinstance(report, EightDReport)
    assert report.incident_id == "INC-0520"
    assert report.pending_approval == "shift_leader"
    assert "IM-05" in report.d2_problem
    assert "FLT-DM-04" in report.d4_root_cause
    assert "Dryer-03" in report.d4_root_cause
    assert "SOP-MNT-IM-05" in report.d7_preventive_action
    assert "-30°C" in report.d7_preventive_action


def test_build_work_order_cnc_and_im():
    """Verifies work order drafting for both equipment archetypes."""
    # CNC Work Order
    cnc_state = IncidentState(suspect_machine="CNC-02", suspect_tool="T07")
    cnc_wo = build_work_order(cnc_state)
    assert isinstance(cnc_wo, WorkOrder)
    assert cnc_wo.work_order_id == "WO-8821"
    assert cnc_wo.equipment_id == "CNC-02"
    assert cnc_wo.pending_approval == "shift_leader"
    assert cnc_wo.priority == "HIGH"
    assert any("WNMG-080408" in p for p in cnc_wo.parts_required)
    assert "4.2 N·m" in cnc_wo.description
    assert "<= 0.005 mm" in cnc_wo.description

    # IM Work Order
    im_state = IncidentState(suspect_machine="IM-05", defect_type="short_fill")
    im_wo = build_work_order(im_state)
    assert isinstance(im_wo, WorkOrder)
    assert im_wo.work_order_id == "WO-8822"
    assert im_wo.equipment_id == "IM-05"
    assert im_wo.pending_approval == "shift_leader"
    assert any("FLT-DM-04" in p for p in im_wo.parts_required)


def test_build_sop_proposal_cnc_and_im():
    """Verifies preventive SOP modification generation."""
    # CNC SOP proposal
    cnc_state = IncidentState(suspect_machine="CNC-02")
    cnc_sop = build_sop_proposal(cnc_state)
    assert isinstance(cnc_sop, SOPRevisionProposal)
    assert cnc_sop.sop_id == "SOP-MNT-CNC-04"
    assert cnc_sop.threshold_alert_parts == 1900
    assert cnc_sop.pending_approval == "shift_leader"
    assert "weekly" in cnc_sop.current_procedure.lower()
    assert "1,900" in cnc_sop.proposed_revision

    # IM SOP proposal
    im_state = IncidentState(suspect_machine="IM-05", defect_type="short_fill")
    im_sop = build_sop_proposal(im_state)
    assert isinstance(im_sop, SOPRevisionProposal)
    assert im_sop.sop_id == "SOP-MNT-IM-05"
    assert im_sop.pending_approval == "shift_leader"
    assert "-30°C" in im_sop.proposed_revision


def test_build_scribe_draft_cnc_scenario():
    """Verifies complete ScribeDraft assembly with valid serialized JSON documents."""
    state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
    )

    draft = build_scribe_draft(state)
    assert isinstance(draft, ScribeDraft)
    assert draft.confidence == 0.95
    assert draft.citation == DEFAULT_CITATION
    assert "8D Incident Report" in draft.finding
    assert "WO-8821" in draft.finding
    assert "SOP-MNT-CNC-04" in draft.finding

    # Validate JSON serializability and document contents
    wo_data = json.loads(draft.work_order)
    report_data = json.loads(draft.report_8d)
    sop_data = json.loads(draft.sop_proposal)

    assert wo_data["pending_approval"] == "shift_leader"
    assert wo_data["work_order_id"] == "WO-8821"

    assert report_data["pending_approval"] == "shift_leader"
    assert report_data["incident_id"] == "INC-0412"

    assert sop_data["pending_approval"] == "shift_leader"
    assert sop_data["sop_id"] == "SOP-MNT-CNC-04"


def test_build_scribe_draft_im_scenario():
    """Verifies ScribeDraft assembly for injection molding scenario."""
    state = IncidentState(
        incident_id="INC-0520",
        suspect_machine="IM-05",
        suspect_tool="Cavity 3",
        defect_type="short_fill",
    )

    draft = build_scribe_draft(state)
    assert isinstance(draft, ScribeDraft)
    assert draft.confidence == 0.95
    assert draft.citation == DEFAULT_IM_CITATION
    assert "WO-8822" in draft.finding
    assert "SOP-MNT-IM-05" in draft.finding


def test_record_resolution_workflow_node_integration():
    """Tests that record_resolution populates blackboard documents with 8D, WO, and SOP."""
    copilot_draft = FindingDraft(
        finding="Technician completed tool T07 replacement and runout calibration.",
        evidence="Torque 4.2 N·m and dial runout <= 0.005 mm confirmed.",
        confidence=0.94,
        citation="Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2",
    )
    scribe_draft = build_scribe_draft(IncidentState(suspect_machine="CNC-02", suspect_tool="T07"))

    node_input = {
        agent_technician_copilot.agent.name: copilot_draft.model_dump(),
        agent_incident_scribe.agent.name: scribe_draft.model_dump(),
    }

    state = asyncio.run(record_resolution(node_input))

    assert state.repair_done is True
    assert state.status == "verifying"
    assert set(state.documents.keys()) == {"work_order", "report_8d", "sop_proposal"}

    # Ensure documents have pending_approval
    wo = json.loads(state.documents["work_order"])
    r8d = json.loads(state.documents["report_8d"])
    sop = json.loads(state.documents["sop_proposal"])

    assert wo["pending_approval"] == "shift_leader"
    assert r8d["pending_approval"] == "shift_leader"
    assert sop["pending_approval"] == "shift_leader"
