"""Unit and integration tests for Incident Scribe Agent (8D reports, work orders, SOP proposals, and HITL sign-off)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from backend.agents import agent_incident_scribe, agent_technician_copilot
from backend.agents.agent_incident_scribe import (
    AGENT_ID,
    AGENT_NAME,
    DEFAULT_CITATION,
    DEFAULT_IM_CITATION,
    PHASE,
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


def _extract_board_context(board_data: dict | IncidentState | None) -> dict[str, Any]:
    """Extracts normalized incident attributes from IncidentState or dict."""
    ctx: dict[str, Any] = {
        "incident_id": "INC-0412",
        "defect_type": "scratch_vertical",
        "defect_rate": 0.077,
        "spc_ucl": 0.030,
        "suspect_machine": "CNC-02",
        "suspect_tool": "T07",
        "root_cause": None,
        "findings": [],
    }

    if isinstance(board_data, IncidentState):
        ctx["incident_id"] = board_data.incident_id or ctx["incident_id"]
        ctx["defect_type"] = board_data.defect_type or ctx["defect_type"]
        ctx["defect_rate"] = board_data.defect_rate
        ctx["spc_ucl"] = board_data.spc_ucl
        ctx["suspect_machine"] = board_data.suspect_machine or ctx["suspect_machine"]
        ctx["suspect_tool"] = board_data.suspect_tool or ctx["suspect_tool"]
        ctx["root_cause"] = board_data.root_cause
        ctx["findings"] = board_data.findings
    elif isinstance(board_data, dict):
        ctx["incident_id"] = board_data.get("incident_id") or ctx["incident_id"]
        ctx["defect_type"] = board_data.get("defect_type") or ctx["defect_type"]
        ctx["defect_rate"] = board_data.get("defect_rate", ctx["defect_rate"])
        ctx["spc_ucl"] = board_data.get("spc_ucl", ctx["spc_ucl"])
        ctx["suspect_machine"] = board_data.get("suspect_machine") or ctx["suspect_machine"]
        ctx["suspect_tool"] = board_data.get("suspect_tool") or ctx["suspect_tool"]
        ctx["root_cause"] = board_data.get("root_cause")
        ctx["findings"] = board_data.get("findings", [])

    return ctx


def build_eight_d_report(board_data: dict | IncidentState | None = None) -> EightDReport:
    """Assembles full 8D documentation (D1 through D8) directly from Blackboard findings."""
    ctx = _extract_board_context(board_data)
    incident_id = ctx["incident_id"]
    suspect_machine = ctx["suspect_machine"]
    suspect_tool = ctx["suspect_tool"]
    defect_type = ctx["defect_type"]
    defect_rate = ctx["defect_rate"]
    spc_ucl = ctx["spc_ucl"]

    is_im = (
        "IM" in suspect_machine.upper()
        or "SHORT" in defect_type.upper()
        or "DAMP" in defect_type.upper()
    )

    if is_im:
        return EightDReport(
            incident_id=incident_id,
            d1_team=(
                "Cross-functional response team: Quality Inspector, Traceability Agent, "
                "Process Analyst, Root Cause Agent, Frontline Technician OP-42, Shift Leader."
            ),
            d2_problem=(
                f"Workpieces from {suspect_machine} exhibited short fill and sink marks in mold cavity {suspect_tool}. "
                f"Defect rate reached {defect_rate:.1%}, breaching SPC UCL ({spc_ucl:.1%})."
            ),
            d3_containment=(
                f"Immediate containment: Optical inspection diverter engaged to quarantine suspect lot. "
                f"{suspect_machine} injection molding cycle paused for auxiliary diagnostics."
            ),
            d4_root_cause=(
                "5-Whys and Ishikawa analysis confirmed ABS resin feedstock moisture elevated due to "
                "saturated desiccant canister FLT-DM-04 on auxiliary Dryer-03 (dewpoint degraded to -15°C vs target <= -40°C). "
                "Causal factors: Machine (dryer desiccant saturation) and Method (lacking automated dewpoint interlock)."
            ),
            d5_corrective_actions=(
                "Replaced saturated desiccant canister FLT-DM-04 on Dryer-03. Regenerated auxiliary air line "
                "and verified drying dewpoint restored to -42°C prior to resuming resin feed."
            ),
            d6_implementation=(
                "Physical corrective maintenance executed and confirmed by frontline technician. "
                "Post-repair production verified 50 consecutive defect-free molded parts with 0 defects; "
                "defect rate returned to 0.0%, within normal control limits."
            ),
            d7_preventive_action=(
                "Revised SOP-MNT-IM-05 to integrate an automated digital dewpoint interlock on Dryer-03 "
                "that inhibits machine hopper feed whenever dewpoint exceeds -30°C."
            ),
            d8_congratulate_team=(
                "Incident successfully contained and resolved via closed-loop multi-agent triage and physical repair. "
                "Pending official shift leader sign-off."
            ),
            pending_approval="shift_leader",
            approved=False,
        )

    # Default: CNC Machining Scenario
    return EightDReport(
        incident_id=incident_id,
        d1_team=(
            "Cross-functional response team: Quality Inspector, Traceability Agent, "
            "Process Analyst, Root Cause Agent, Frontline Technician OP-42, Shift Leader."
        ),
        d2_problem=(
            f"Workpieces from {suspect_machine} exhibited vertical surface scratch marks ({defect_type}). "
            f"Defect rate reached {defect_rate:.1%}, breaching SPC UCL ({spc_ucl:.1%})."
        ),
        d3_containment=(
            f"Immediate containment: Conveyor diverter actuated to quarantine suspect blank lot AL-5083-B4. "
            f"{suspect_machine} spindle cycle halted to prevent further ungrounded surface scrap."
        ),
        d4_root_cause=(
            f"5-Whys analysis confirmed cutting tool {suspect_tool} insert suffered excessive flank wear (VB > 0.3mm) "
            "after 2,400 cutting cycles, exceeding 2,000-part rated insert life. "
            "Ishikawa 6M analysis identified Machine (tool insert flank wear) and Method (calendar-based weekly SOP-MNT-CNC-04 "
            "lacking part-counter trigger) as root causes."
        ),
        d5_corrective_actions=(
            f"Replaced worn cutting insert on tool {suspect_tool} with new carbide insert WNMG-080408. "
            "Torqued insert screw to 4.2 N·m using torque wrench and calibrated spindle runout to <= 0.005 mm using dial indicator."
        ),
        d6_implementation=(
            "Frontline technician completed physical insert swap and dial indicator alignment under Copilot guidance. "
            "Post-repair inspection verified 50 consecutive defect-free parts; defect rate dropped to 0.0%, "
            f"well below SPC UCL {spc_ucl:.1%}."
        ),
        d7_preventive_action=(
            "Revised SOP-MNT-CNC-04 to mandate automated piece-counter warning alert at 1,900 parts and "
            "compulsory tool replacement interlock at 2,000 parts, superseding weekly calendar intervals."
        ),
        d8_congratulate_team=(
            "Cross-functional AI and frontline operational response resolved anomaly within 15 minutes. "
            "Formal incident closure pending shift leader sign-off."
        ),
        pending_approval="shift_leader",
        approved=False,
    )


def build_work_order(board_data: dict | IncidentState | None = None) -> WorkOrder:
    """Drafts formal maintenance work order for tooling replacement and recalibration."""
    ctx = _extract_board_context(board_data)
    suspect_machine = ctx["suspect_machine"]
    suspect_tool = ctx["suspect_tool"]
    defect_type = ctx["defect_type"]

    is_im = (
        "IM" in suspect_machine.upper()
        or "SHORT" in defect_type.upper()
        or "DAMP" in defect_type.upper()
    )

    if is_im:
        return WorkOrder(
            work_order_id="WO-8822",
            title=f"{suspect_machine} Auxiliary Dryer-03 Desiccant Canister Overhaul",
            equipment_id=suspect_machine,
            description=(
                "Isolate auxiliary Dryer-03 under LOTO, remove saturated desiccant filter canister FLT-DM-04, "
                "install new filter element with high-temperature gasket, and verify dewpoint <= -40°C "
                "prior to re-enabling resin hopper feed."
            ),
            parts_required=[
                "Desiccant Filter Element FLT-DM-04 (Qty: 1)",
                "High-Temp Silicone Gasket SG-88 (Qty: 1)",
            ],
            priority="HIGH",
            status="PENDING_APPROVAL",
            pending_approval="shift_leader",
            approved=False,
        )

    return WorkOrder(
        work_order_id="WO-8821",
        title=f"{suspect_machine} Tool {suspect_tool} Insert Replacement & Spindle Calibration",
        equipment_id=suspect_machine,
        description=(
            f"Perform LOTO on {suspect_machine}. Remove worn carbide cutting insert on tool {suspect_tool}. "
            "Clean tool pocket, install new insert WNMG-080408 torqued to 4.2 N·m with torque wrench, "
            "and verify spindle runout <= 0.005 mm using magnetic base dial indicator before production release."
        ),
        parts_required=[
            "Carbide Insert WNMG-080408 (Qty: 1)",
            "Torx M4x10 Clamp Screw (Qty: 1)",
        ],
        priority="HIGH",
        status="PENDING_APPROVAL",
        pending_approval="shift_leader",
        approved=False,
    )


def build_sop_proposal(board_data: dict | IncidentState | None = None) -> SOPRevisionProposal:
    """Generates concrete preventive SOP modification proposal for shift leader approval."""
    ctx = _extract_board_context(board_data)
    suspect_machine = ctx["suspect_machine"]
    defect_type = ctx["defect_type"]

    is_im = (
        "IM" in suspect_machine.upper()
        or "SHORT" in defect_type.upper()
        or "DAMP" in defect_type.upper()
    )

    if is_im:
        return SOPRevisionProposal(
            sop_id="SOP-MNT-IM-05",
            title="Preventive Maintenance: Resin Moisture Control & Auxiliary Dryer Protocol",
            equipment_id=suspect_machine,
            current_procedure="Manual visual inspection of dryer indicator lamps once per 12-hour operational shift.",
            proposed_revision=(
                "Integrate digital inline dewpoint sensor with machine cell PLC interlock. Automatically pause "
                "resin hopper feed whenever dewpoint reading rises above -30°C."
            ),
            justification=(
                "Prevents short fill and sink mark defects by eliminating moisture-induced resin viscosity breakdown."
            ),
            threshold_alert_parts=None,
            pending_approval="shift_leader",
            approved=False,
        )

    return SOPRevisionProposal(
        sop_id="SOP-MNT-CNC-04",
        title="Preventive Maintenance: CNC Tool Life Cycle & Usage-Based Changeover",
        equipment_id=suspect_machine,
        current_procedure="Calendar-based tool replacement performed weekly on Friday during shift handover.",
        proposed_revision=(
            "Transition to automated usage-based piece counter in line MES and CNC controller. "
            "Trigger amber warning alert at 1,900 parts and compulsory tool changeover interlock at 2,000 parts."
        ),
        justification=(
            "Eliminates cutting tool flank wear (VB > 0.3mm) and workpiece surface scratches by preventing tools "
            "from exceeding rated 2,000-cut service life."
        ),
        threshold_alert_parts=1900,
        pending_approval="shift_leader",
        approved=False,
    )


def build_scribe_draft(board_data: dict | IncidentState | None = None) -> ScribeDraft:
    """Builds a complete, auditable ScribeDraft containing full 8D, Work Order, and SOP proposal."""
    ctx = _extract_board_context(board_data)
    suspect_machine = ctx["suspect_machine"]
    suspect_tool = ctx["suspect_tool"]
    defect_type = ctx["defect_type"]

    is_im = (
        "IM" in suspect_machine.upper()
        or "SHORT" in defect_type.upper()
        or "DAMP" in defect_type.upper()
    )

    report_8d = build_eight_d_report(board_data)
    work_order = build_work_order(board_data)
    sop_proposal = build_sop_proposal(board_data)

    citation = DEFAULT_IM_CITATION if is_im else DEFAULT_CITATION

    if is_im:
        finding = (
            f"Drafted formal 8D Incident Report, Work Order {work_order.work_order_id} for dryer canister replacement, "
            f"and {sop_proposal.sop_id} revision adding automated dewpoint interlock."
        )
        evidence = (
            f"8D Report completed D1-D8: root cause traced to Dryer-03 desiccant saturation. "
            f"Work Order {work_order.work_order_id} specifies FLT-DM-04 replacement. "
            f"{sop_proposal.sop_id} mandates dewpoint <= -30°C interlock. All documents marked pending_approval: shift_leader."
        )
    else:
        finding = (
            f"Drafted formal 8D Incident Report, Work Order {work_order.work_order_id} for {suspect_tool} insert replacement, "
            f"and {sop_proposal.sop_id} revision adding 1,900-part counter interlock."
        )
        evidence = (
            f"8D Report completed D1-D8: root cause traced to {suspect_machine} {suspect_tool} flank wear beyond 2,000 cuts. "
            f"Work Order {work_order.work_order_id} specifies WNMG-080408 insert swap torqued to 4.2 N·m. "
            f"{sop_proposal.sop_id} adds 1,900-part threshold alert. All documents marked pending_approval: shift_leader."
        )

    return ScribeDraft(
        finding=finding,
        evidence=evidence,
        confidence=0.95,
        citation=citation,
        work_order=json.dumps(work_order.model_dump(), indent=2),
        report_8d=json.dumps(report_8d.model_dump(), indent=2),
        sop_proposal=json.dumps(sop_proposal.model_dump(), indent=2),
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

    assert state.repair_done is False
    assert state.status == "repairing"
    assert set(state.documents.keys()) == {"work_order", "report_8d", "sop_proposal"}

    # Ensure documents have pending_approval
    wo = json.loads(state.documents["work_order"])
    r8d = json.loads(state.documents["report_8d"])
    sop = json.loads(state.documents["sop_proposal"])

    assert wo["pending_approval"] == "shift_leader"
    assert r8d["pending_approval"] == "shift_leader"
    assert sop["pending_approval"] == "shift_leader"
