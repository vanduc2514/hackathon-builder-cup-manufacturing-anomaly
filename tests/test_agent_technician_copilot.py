"""Unit and integration tests for Technician Copilot Agent (ADK agent definitions, finding builders, and workflow nodes)."""

from __future__ import annotations

import asyncio

import pytest

from backend.agents import agent_technician_copilot
from backend.agents.agent_technician_copilot import (
    AGENT_ID,
    AGENT_NAME,
    DEFAULT_CNC_CITATION,
    DEFAULT_DIAGNOSTIC_CNC_CITATION,
    DEFAULT_DIAGNOSTIC_IM_CITATION,
    DEFAULT_IM_CITATION,
    DIAGNOSTIC_PHASE,
    PHASE,
)
from backend.agents.workflow_nodes import record_field_evidence, record_resolution
from backend.core.blackboard import blackboard
from backend.core.models import FindingDraft, IncidentState, ScribeDraft


def build_copilot_finding(board_data: dict | IncidentState | None = None) -> FindingDraft:
    """Builds a deterministic FindingDraft representing completed interactive repair guidance."""
    suspect_machine = "CNC-02"
    suspect_tool = "T07"

    if isinstance(board_data, IncidentState):
        suspect_machine = board_data.suspect_machine or suspect_machine
        suspect_tool = board_data.suspect_tool or suspect_tool
    elif isinstance(board_data, dict):
        suspect_machine = board_data.get("suspect_machine") or suspect_machine
        suspect_tool = board_data.get("suspect_tool") or suspect_tool

    is_im = "IM" in suspect_machine.upper()

    if is_im:
        return FindingDraft(
            finding=(
                f"Guided frontline technician in Vietnamese through {suspect_machine} dryer de-energization, "
                "desiccant filter FLT-ABS-04 replacement, and dewpoint verification (-35.0 °C <= -30.0 °C) "
                "following SOP-MOLD-02."
            ),
            evidence=(
                "Completed 5/5 OEM checkpoints: heaters de-energized and air pressure vented, "
                "saturated filter removed, new FLT-ABS-04 filter installed with new O-ring, "
                "dewpoint measured at -35.0 °C (within -30.0 °C limit), and resin re-drying set at 85 °C for 4 hours."
            ),
            confidence=0.94,
            citation=DEFAULT_IM_CITATION,
        )

    return FindingDraft(
        finding=(
            f"Guided frontline technician in Vietnamese through {suspect_machine} enclosure removal, "
            f"tool {suspect_tool} insert replacement at 4.2 N·m torque, and dial indicator runout verification "
            "(0.003 mm <= 0.005 mm) following OEM manual."
        ),
        evidence=(
            f"Completed 5/5 OEM checkpoints: E-Stop/LOTO engaged, insert {suspect_tool} flank wear confirmed, "
            "new WNMG-080408 insert torqued to 4.2 N·m, spindle runout measured at 0.003 mm "
            "(within 0.005 mm tolerance), and 1500 RPM test spin completed with 0 safety violations."
        ),
        confidence=0.94,
        citation=DEFAULT_CNC_CITATION,
    )


def build_diagnostic_finding(board_data: dict | IncidentState | None = None) -> FindingDraft:
    """Builds a deterministic FindingDraft representing gathered technician diagnostic field evidence."""
    suspect_machine = "CNC-02"
    suspect_tool = "T07"

    if isinstance(board_data, IncidentState):
        suspect_machine = board_data.suspect_machine or suspect_machine
        suspect_tool = board_data.suspect_tool or suspect_tool
    elif isinstance(board_data, dict):
        suspect_machine = board_data.get("suspect_machine") or suspect_machine
        suspect_tool = board_data.get("suspect_tool") or suspect_tool

    is_im = "IM" in suspect_machine.upper()

    if is_im:
        return FindingDraft(
            finding=(
                f"Technician visual and sensor inspection on {suspect_machine} confirms desiccant saturation "
                "and oil contamination in Dryer-03 filter canister."
            ),
            evidence=(
                "Diagnostic inspection via Gemini Live mobile stream confirms discolored desiccant beads "
                "and degraded canister dewpoint (-15°C) starving cavity 3, corroborating short fill defect."
            ),
            confidence=0.92,
            citation=DEFAULT_DIAGNOSTIC_IM_CITATION,
        )

    return FindingDraft(
        finding=(
            f"Technician macro camera probe on {suspect_machine} confirms severe flank wear (VB > 0.3mm) "
            f"and micro-chipping on cutting insert {suspect_tool}."
        ),
        evidence=(
            f"Diagnostic close-up photo received via Gemini Live mobile video stream shows abrasive flank wear "
            f"exceeding 0.3mm across cutting edge of insert {suspect_tool}, matching workpiece vertical scratch pattern."
        ),
        confidence=0.92,
        citation=DEFAULT_DIAGNOSTIC_CNC_CITATION,
    )


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_agent_technician_copilot_adk_definition():
    """Ensures ADK agents are properly configured with contracts, schemas, and token limits."""
    # Main resolution agent
    assert agent_technician_copilot.agent.name == "technician_copilot"
    assert agent_technician_copilot.agent.output_schema == FindingDraft
    assert agent_technician_copilot.agent.generate_content_config is not None
    assert agent_technician_copilot.agent.generate_content_config.max_output_tokens == 2048

    # Diagnostic probe agent
    assert agent_technician_copilot.diagnostic_agent.name == "technician_copilot_diagnostic"
    assert agent_technician_copilot.diagnostic_agent.output_schema == FindingDraft
    assert agent_technician_copilot.diagnostic_agent.generate_content_config is not None
    assert (
        agent_technician_copilot.diagnostic_agent.generate_content_config.max_output_tokens == 2048
    )

    # Module constants
    assert AGENT_ID == "COPILOT"
    assert AGENT_NAME == "Technician Copilot"
    assert PHASE == "Phase C - Resolution"
    assert DIAGNOSTIC_PHASE == "Phase B - Field Evidence"


def test_build_copilot_finding_cnc_scenario():
    """Verifies deterministic copilot finding generation for CNC-02 mechanical tool wear."""
    board_state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        root_cause="Tool T07 worn past 2,000 part limit",
    )
    draft = build_copilot_finding(board_state)

    assert isinstance(draft, FindingDraft)
    assert "CNC-02" in draft.finding
    assert "T07" in draft.finding
    assert "0.003 mm" in draft.finding
    assert "0.005 mm" in draft.finding

    # Evidence details
    assert "5/5 OEM checkpoints" in draft.evidence
    assert "4.2 N·m" in draft.evidence
    assert "1500 RPM" in draft.evidence
    assert draft.confidence == 0.94
    assert draft.citation == DEFAULT_CNC_CITATION


def test_build_copilot_finding_im_scenario():
    """Verifies deterministic copilot finding generation for IM-05 damp resin short fill."""
    board_state = IncidentState(
        incident_id="INC-0413",
        suspect_machine="IM-05",
        suspect_tool="MOLD-03",
        root_cause="Clogged dryer filter causing damp ABS pellets",
    )
    draft = build_copilot_finding(board_state)

    assert isinstance(draft, FindingDraft)
    assert "IM-05" in draft.finding
    assert "FLT-ABS-04" in draft.finding
    assert "-35.0 °C" in draft.finding
    assert "-30.0 °C" in draft.finding

    # Evidence details
    assert "5/5 OEM checkpoints" in draft.evidence
    assert "85 °C" in draft.evidence
    assert draft.confidence == 0.94
    assert draft.citation == DEFAULT_IM_CITATION


def test_build_diagnostic_finding_cnc_scenario():
    """Verifies diagnostic field evidence draft when RCA confidence is low for CNC-02."""
    board_state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        suspect_tool="T07",
    )
    draft = build_diagnostic_finding(board_state)

    assert isinstance(draft, FindingDraft)
    assert "CNC-02" in draft.finding
    assert "T07" in draft.finding
    assert "flank wear" in draft.finding
    assert "chipping" in draft.finding

    assert "VB > 0.3mm" in draft.finding or "0.3mm" in draft.evidence
    assert draft.confidence == 0.92
    assert draft.citation == DEFAULT_DIAGNOSTIC_CNC_CITATION


def test_build_diagnostic_finding_im_scenario():
    """Verifies diagnostic field evidence draft when RCA confidence is low for IM-05."""
    board_state = IncidentState(
        incident_id="INC-0413",
        suspect_machine="IM-05",
        suspect_tool="MOLD-03",
    )
    draft = build_diagnostic_finding(board_state)

    assert isinstance(draft, FindingDraft)
    assert "IM-05" in draft.finding
    assert "desiccant" in draft.finding
    assert "Dryer-03" in draft.finding
    assert "-15°C" in draft.evidence
    assert draft.confidence == 0.92
    assert draft.citation == DEFAULT_DIAGNOSTIC_IM_CITATION


def test_record_field_evidence_workflow_node():
    """Verifies that record_field_evidence writes Phase B evidence and updates status to analyzing."""
    draft = FindingDraft(
        finding="Technician macro camera confirms flank wear on T07.",
        evidence="Close-up photo shows chipped cutting edge.",
        confidence=0.92,
        citation=DEFAULT_DIAGNOSTIC_CNC_CITATION,
    )

    state = asyncio.run(record_field_evidence(draft))

    assert state.status == "analyzing"
    assert len(state.findings) == 1
    finding = state.findings[0]
    assert finding.agent_id == "COPILOT"
    assert finding.agent_name == "Technician Copilot"
    assert finding.phase == "Phase B - Field Evidence"
    assert finding.confidence == 0.92
    assert finding.citation == DEFAULT_DIAGNOSTIC_CNC_CITATION


def test_record_resolution_workflow_node_emits_repair_done():
    """Verifies that record_resolution sets repair_done=True, records COPILOT and DOC findings, and transitions to verifying."""
    copilot_draft = FindingDraft(
        finding="Guided technician through CNC-02 tool insert swap.",
        evidence="Completed 5/5 checkpoints; runout 0.003 mm.",
        confidence=0.94,
        citation=DEFAULT_CNC_CITATION,
    )
    scribe_draft = ScribeDraft(
        finding="Generated 8D report, work order, and SOP proposal.",
        evidence="Standardized on piece-counter tool life triggers.",
        confidence=0.95,
        citation="Continuous Learning KB",
        work_order="WO-CNC02-0412",
        report_8d="8D-2026-CNC02-0412",
        sop_proposal="SOP-MNT-CNC-04 Revision 3",
    )

    node_input = {
        agent_technician_copilot.agent.name: copilot_draft.model_dump(),
        "incident_scribe": scribe_draft.model_dump(),
    }

    state = asyncio.run(record_resolution(node_input))

    assert state.repair_done is True
    assert state.status == "verifying"
    assert len(state.findings) == 2
    assert state.findings[0].agent_id == "COPILOT"
    assert state.findings[0].phase == "Phase C - Resolution"
    assert state.findings[0].confidence == 0.94
    assert state.findings[1].agent_id == "DOC"
    assert set(state.documents.keys()) == {"work_order", "report_8d", "sop_proposal"}
