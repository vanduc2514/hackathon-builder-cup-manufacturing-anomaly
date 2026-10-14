"""Unit and integration tests for Root Cause Agent: RAG domain grounding, 5-Whys, Ishikawa, confidence gatekeeping, and feedback loop."""

from __future__ import annotations

import asyncio
from typing import Any, Optional
from unittest.mock import MagicMock, patch

import pytest

from backend.agents import agent_root_cause
from backend.agents.agent_root_cause import (
    DEFAULT_CITATION,
    DEFAULT_IM_CITATION,
    DIAGNOSTIC_REQUEST_TEXT,
    has_field_evidence,
    query_domain_knowledge,
)
from backend.agents.workflow_nodes import MAX_EVIDENCE_ROUNDS, rca_gate
from backend.core.blackboard import blackboard
from backend.core.models import (
    AgentFinding,
    CitationReference,
    FiveWhysStep,
    IncidentState,
    RAGSearchResult,
    RootCauseFindingDraft,
)


def load_mock_root_cause_knowledge(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
) -> RAGSearchResult:
    """Provides grounded domain citations from curated equipment manuals, maintenance logs, and 8D reports (test fixture)."""
    symptom = (defect_symptom or "scratch_vertical").lower()
    asset = (suspect_asset or "CNC-02").upper()

    if "IM" in asset or "INJECTION" in asset or "SHORT" in symptom or "DAMP" in symptom:
        citations = [
            CitationReference(
                document_id="manuals/injection_molding_manual.md",
                title="Injection Molding Machine IM-05 Operating Manual",
                page_number=78,
                section="Section 3.2 Material Preparation",
                snippet=(
                    "ABS resin requires pre-drying to dewpoint <= -40°C. Saturated desiccant dryer "
                    "causes short fill and sink marks in mold cavity 3."
                ),
                relevance_score=0.94,
                last_revised="2026-02-10",
                citation="Injection Molding Machine IM-05 Operating Manual, p.78, Section 3.2 Material Preparation, revised 2026-02-10",
            ),
            CitationReference(
                document_id="maint_logs/im_05_dryer_log.md",
                title="IM-05 Auxiliary Equipment Maintenance Log",
                page_number=8,
                section="Dryer-03 Inspection Record",
                snippet=(
                    "Dryer-03 desiccant canister FLT-DM-04 overdue for regeneration; dewpoint degraded to -15°C."
                ),
                relevance_score=0.91,
                last_revised="2026-03-28",
                citation="IM-05 Auxiliary Equipment Maintenance Log, p.8, Dryer-03 Inspection Record, revised 2026-03-28",
            ),
            CitationReference(
                document_id="reports_8d/8D_2026_02_14.md",
                title="8D Incident Report 8D-2026-02-14",
                page_number=3,
                section="D4 Root Cause Analysis",
                snippet=(
                    "Short fill on mold cavity 3 caused by moisture in hygroscopic resin following "
                    "desiccant filter saturation."
                ),
                relevance_score=0.89,
                last_revised="2026-02-14",
                citation="8D Incident Report 8D-2026-02-14, p.3, D4 Root Cause Analysis, revised 2026-02-14",
            ),
        ]
        return RAGSearchResult(
            defect_symptom=symptom,
            suspect_asset=asset,
            query=f"{symptom} {asset}",
            citations=citations,
            confidence=0.92,
            summary="Retrieved 3 grounded documents confirming desiccant saturation root cause for IM-05 short fill.",
            engine="vertex_ai_search",
            total_found=3,
        )

    # Default to CNC machining domain
    citations = [
        CitationReference(
            document_id="manuals/cnc_operating_manual.md",
            title="CNC-VMC850 Operating & Maintenance Manual",
            page_number=112,
            section="Section 4.5 Tool Wear & Surface Quality",
            snippet=(
                "Face mill insert BAP400R rated tool life is 2,000 cuts. Excessive flank wear (VB > 0.3mm) "
                "causes vertical micro-scratches on machined aluminum faces."
            ),
            relevance_score=0.95,
            last_revised="2026-03-12",
            citation="CNC-VMC850 Operating & Maintenance Manual, p.112, Section 4.5 Tool Wear & Surface Quality, revised 2026-03-12",
        ),
        CitationReference(
            document_id="maint_logs/cnc_02_tool_log.md",
            title="CNC-02 Maintenance Log T07",
            page_number=14,
            section="Tool Usage & Maintenance Record",
            snippet=(
                "Tool T07 insert cut 2,400 parts without replacement against rated 2,000 part life. "
                "SOP-MNT-CNC-04 specifies weekly tool change rather than piece-counter trigger."
            ),
            relevance_score=0.92,
            last_revised="2026-04-01",
            citation="CNC-02 Maintenance Log T07, p.14, Tool Usage & Maintenance Record, revised 2026-04-01",
        ),
        CitationReference(
            document_id="reports_8d/8D_2026_03_12.md",
            title="8D Incident Report 8D-2026-03-12",
            page_number=2,
            section="D4 Root Cause Analysis",
            snippet=(
                "Root cause of aluminum surface scratches traced to worn carbide inserts beyond 2,000 cuts "
                "due to calendar-based tool replacement SOP."
            ),
            relevance_score=0.88,
            last_revised="2026-03-12",
            citation="8D Incident Report 8D-2026-03-12, p.2, D4 Root Cause Analysis, revised 2026-03-12",
        ),
    ]
    return RAGSearchResult(
        defect_symptom=symptom,
        suspect_asset=asset,
        query=f"{symptom} {asset}",
        citations=citations,
        confidence=0.93,
        summary="Retrieved 3 grounded documents confirming tool T07 wear root cause for CNC-02 scratch defect.",
        engine="vertex_ai_search",
        total_found=3,
    )


def build_root_cause_finding(
    board_data: dict | IncidentState | None = None,
    field_evidence_present: bool = False,
    force_low_confidence: bool = False,
) -> RootCauseFindingDraft:
    """Builds a deterministic 5-Whys and Ishikawa root cause finding (test fixture)."""
    suspect_machine = "CNC-02"
    suspect_tool = "T07"
    defect_type = "scratch_vertical"
    findings_list: list[Any] = []

    if isinstance(board_data, IncidentState):
        suspect_machine = board_data.suspect_machine or suspect_machine
        suspect_tool = board_data.suspect_tool or suspect_tool
        defect_type = board_data.defect_type or defect_type
        findings_list = board_data.findings
    elif isinstance(board_data, dict):
        suspect_machine = board_data.get("suspect_machine") or suspect_machine
        suspect_tool = board_data.get("suspect_tool") or suspect_tool
        defect_type = board_data.get("defect_type") or defect_type
        findings_list = board_data.get("findings") or []

    field_confirmed = field_evidence_present or has_field_evidence(findings_list)

    is_im = (
        "IM" in suspect_machine.upper()
        or "SHORT" in defect_type.upper()
        or "DAMP" in defect_type.upper()
    )

    if is_im:
        citation = DEFAULT_IM_CITATION
        five_whys = [
            FiveWhysStep(
                level=1,
                why="Why did molded parts exhibit short fill and sink marks in cavity 3?",
                answer="Melt pressure and plastic filling volume were insufficient in mold cavity 3 during injection cycle.",
                evidence="Conveyor vision camera flagged short fill defect rate breaching SPC UCL.",
                citation="Inspection camera Station #1",
            ),
            FiveWhysStep(
                level=2,
                why="Why was melt pressure and filling volume insufficient in cavity 3?",
                answer="ABS resin in feed hopper had excessive moisture content (>0.02%), causing hydrolysis and viscosity reduction.",
                evidence="RAG lookup: Injection Molding Manual Section 3.2.",
                citation="IM-05 Operating Manual p.78",
            ),
            FiveWhysStep(
                level=3,
                why="Why was ABS resin moisture content above specification?",
                answer="Dehumidifying dryer Dryer-03 desiccant canister FLT-DM-04 was saturated, failing to achieve target -40°C dewpoint.",
                evidence="Maintenance log recorded Dryer-03 operating at -15°C dewpoint.",
                citation="Dryer-03 Maintenance Log p.8",
            ),
            FiveWhysStep(
                level=4,
                why="Why was saturated desiccant canister not regenerated or replaced?",
                answer="Dryer maintenance interval was overdue by 14 days without an automated dewpoint alarm interlock to the line MES.",
                evidence="Historical 8D report 8D-2026-02-14 identified recurring dryer filter maintenance gaps.",
                citation="8D Report 8D-2026-02-14 D4",
            ),
            FiveWhysStep(
                level=5,
                why="Why was there no automated dewpoint interlock to the machine controller?",
                answer="Root Cause: Preventive maintenance SOP lacked mandatory dewpoint sensor interlock before enabling hopper feeder.",
                evidence="SOP-MNT-IM-05 did not mandate inline moisture/dewpoint interlock.",
                citation="8D Report 8D-2026-02-14 D5",
            ),
        ]
        ishikawa = {
            "Machine": [
                "Dryer-03 desiccant canister FLT-DM-04 saturated; dewpoint degraded to -15°C."
            ],
            "Method": [
                "Material preparation procedure lacked automated dewpoint interlock to pause injection molding."
            ],
            "Material": [
                "ABS resin lot moisture elevated due to desiccant saturation; polymer chain degradation under heat."
            ],
            "Man": [
                "Technician shift log did not register manual dewpoint check before shift run."
            ],
            "Measurement": [
                "Inline optical inspection camera correctly detected short fill defect breaching SPC UCL."
            ],
            "Milieu": ["High ambient relative humidity accelerated desiccant canister saturation."],
        }
        finding = (
            "Moisture in ABS resin caused short fill on cavity 3 due to saturated desiccant canister "
            "on Dryer-03 lacking automated dewpoint interlock."
        )
    else:
        citation = DEFAULT_CITATION
        five_whys = [
            FiveWhysStep(
                level=1,
                why="Why did finished workpieces exhibit vertical scratch marks?",
                answer=f"Face mill cutting insert on {suspect_machine} tool {suspect_tool} suffered severe flank wear and chipping.",
                evidence=f"Traceability isolated {suspect_machine} tool {suspect_tool} with 0.95 correlation score.",
                citation="Traceability topology query",
            ),
            FiveWhysStep(
                level=2,
                why=f"Why did tool {suspect_tool} cutting insert suffer severe flank wear and chipping?",
                answer=f"Tool {suspect_tool} performed 2,400 cutting cycles, exceeding rated insert life of 2,000 cycles (VB > 0.3mm).",
                evidence="Spindle vibration increased by +35% and motor current by +12%.",
                citation="BigQuery machine_telemetry_5s & CNC Manual p.112",
            ),
            FiveWhysStep(
                level=3,
                why="Why was the tool allowed to cut 400 parts beyond its rated service life?",
                answer="Standard Maintenance SOP-MNT-CNC-04 replaces cutting tools on a weekly calendar basis rather than part counts.",
                evidence="Maintenance log recorded last tool change 7 days ago on Friday.",
                citation="CNC-02 Maintenance Log T07",
            ),
            FiveWhysStep(
                level=4,
                why="Why was calendar-based scheduling used instead of part counts?",
                answer="Machine cell controller lacked an automated part-counter interlock to trigger preventative tool changes.",
                evidence="Controller cycle register did not inhibit spindle start when count exceeded 2,000.",
                citation="8D Report 8D-2026-03-12",
            ),
            FiveWhysStep(
                level=5,
                why="Why was there no automated part-counter interlock on the machine controller?",
                answer="Root Cause: Tool replacement SOP relies on weekly calendar intervals instead of automated part-counter interlock in line MES.",
                evidence="Institutional SOP-MNT-CNC-04 relies on calendar scheduling.",
                citation="8D Report 8D-2026-03-12 D4",
            ),
        ]
        ishikawa = {
            "Machine": [
                f"{suspect_machine} spindle vibration spike (+35%) and tool {suspect_tool} insert flank wear (VB > 0.3mm) past 2,400 parts."
            ],
            "Method": [
                "SOP-MNT-CNC-04 tool change schedule is calendar-based (weekly on Friday) rather than usage-based piece counts."
            ],
            "Material": [
                "Aluminum blank lot AL-5083-B4 inspected and ruled out (0 defects across concurrent machines CNC-01 and CNC-03)."
            ],
            "Man": [
                "Operator OP-42 verified operating within standard feeds and speeds; human error ruled out."
            ],
            "Measurement": [
                "Conveyor optical vision inspection correctly detected scratch defects exceeding SPC UCL."
            ],
            "Milieu": [
                "Spindle temperature and coolant flow normal (42°C); environmental factors nominal."
            ],
        }
        finding = (
            f"Tool insert {suspect_tool} exceeded rated cutting life (2,400/2,000 parts) due to "
            "calendar-based tool change SOP-MNT-CNC-04 lacking piece-counter interlock."
        )

    # Confidence calculation
    if force_low_confidence:
        confidence = 0.65
        diagnostic_request = DIAGNOSTIC_REQUEST_TEXT
    elif field_confirmed:
        confidence = 0.92
        diagnostic_request = None
    else:
        confidence = 0.87
        diagnostic_request = None

    # Construct synthesized evidence block
    whys_summary = " -> ".join([f"Why {w.level}: {w.answer}" for w in five_whys])
    evidence = (
        f"5-Whys causal chain: {whys_summary}. "
        f"Ishikawa 6M analysis identified Machine (tool flank wear) and Method (calendar-based SOP) as causal. "
        f"Grounded in {citation}."
    )
    if field_confirmed:
        evidence += " Field inspection evidence confirmed physical insert edge wear pattern."

    return RootCauseFindingDraft(
        finding=finding,
        evidence=evidence,
        confidence=confidence,
        citation=citation,
        five_whys=five_whys,
        ishikawa=ishikawa,
        diagnostic_request=diagnostic_request,
    )


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_load_mock_root_cause_knowledge_cnc():
    """Verifies domain citations for CNC tool wear."""
    result = load_mock_root_cause_knowledge("scratch_vertical", "CNC-02")
    assert isinstance(result, RAGSearchResult)
    assert result.suspect_asset == "CNC-02"
    assert result.confidence >= 0.85
    assert len(result.citations) == 3

    # Verify strict citation properties
    titles = [c.title for c in result.citations]
    assert any("CNC-VMC850 Operating & Maintenance Manual" in t for t in titles)
    assert any("CNC-02 Maintenance Log T07" in t for t in titles)
    assert any("8D Incident Report 8D-2026-03-12" in t for t in titles)

    manual = next(c for c in result.citations if "CNC-VMC850" in c.title)
    assert manual.page_number == 112
    assert "Section 4.5" in manual.section
    assert manual.last_revised == "2026-03-12"
    assert "2,000 cuts" in manual.snippet


def test_load_mock_root_cause_knowledge_im():
    """Verifies domain citations for Injection Molding damp material and short fill."""
    result = load_mock_root_cause_knowledge("short_fill", "IM-05")
    assert isinstance(result, RAGSearchResult)
    assert result.suspect_asset == "IM-05"
    assert len(result.citations) == 3

    titles = [c.title for c in result.citations]
    assert any("Injection Molding Machine IM-05 Operating Manual" in t for t in titles)
    assert any("IM-05 Auxiliary Equipment Maintenance Log" in t for t in titles)
    assert any("8D Incident Report 8D-2026-02-14" in t for t in titles)


def test_query_domain_knowledge_error_propagation_on_rag_error():
    """Verifies error propagation when Vertex AI Search fails."""
    with patch(
        "backend.agents.agent_root_cause.search_knowledge_base",
        side_effect=RuntimeError("Google Cloud Discovery Engine offline"),
    ):
        with pytest.raises(RuntimeError, match="Google Cloud Discovery Engine offline"):
            asyncio.run(query_domain_knowledge("scratch_vertical", "CNC-02"))


def test_query_domain_knowledge_uses_live_result():
    """Verifies that live RAG search results are returned directly when available."""
    live_result = RAGSearchResult(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
        query="scratch_vertical CNC-02",
        citations=[
            CitationReference(
                document_id="manuals/live_cnc.md",
                title="Live CNC Manual",
                page_number=10,
                snippet="Live snippet",
                relevance_score=0.99,
            )
        ],
        confidence=0.95,
        engine="vertex_ai_search",
        total_found=1,
    )
    with patch(
        "backend.agents.agent_root_cause.search_knowledge_base",
        return_value=live_result,
    ):
        result = asyncio.run(query_domain_knowledge("scratch_vertical", "CNC-02"))
        assert result.citations[0].title == "Live CNC Manual"


def test_has_field_evidence_detection():
    """Verifies detection of field evidence from technician in findings."""
    assert not has_field_evidence([])

    normal_finding = AgentFinding(
        agent_id="QA",
        agent_name="Quality Inspector",
        phase="Phase A - Detection",
        finding="Defect spike",
        evidence="Conveyor breach",
        confidence=0.95,
        citation="Camera 1",
    )
    assert not has_field_evidence([normal_finding])

    field_evidence_finding = AgentFinding(
        agent_id="COPILOT",
        agent_name="Technician Copilot",
        phase="Phase B - Field Evidence",
        finding="Tool edge shows micro-chipping and flank wear VB ~0.35mm",
        evidence="High-resolution mobile macro photograph of insert T07",
        confidence=0.96,
        citation="Field Macro Camera Station #2",
    )
    assert has_field_evidence([normal_finding, field_evidence_finding])


def test_build_root_cause_finding_cnc_standard():
    """Verifies 5-Whys deduction chain, Ishikawa 6M classification, and citation for CNC scenario."""
    draft = build_root_cause_finding(
        board_data={
            "suspect_machine": "CNC-02",
            "suspect_tool": "T07",
            "defect_type": "scratch_vertical",
        }
    )
    assert isinstance(draft, RootCauseFindingDraft)
    assert draft.confidence == 0.87
    assert draft.diagnostic_request is None
    assert "Tool insert T07 exceeded rated cutting life" in draft.finding
    assert draft.citation == DEFAULT_CITATION

    # Verify 5-Whys deduction chain
    assert len(draft.five_whys) == 5
    for i, step in enumerate(draft.five_whys, 1):
        assert step.level == i
        assert len(step.why) > 0
        assert len(step.answer) > 0
        assert step.evidence is not None

    assert (
        "vertical scratch" in draft.five_whys[0].why.lower()
        or "vertical scratch" in draft.five_whys[0].answer.lower()
    )
    assert "2,000" in draft.five_whys[1].answer or "2,400" in draft.five_whys[1].answer
    assert "calendar" in draft.five_whys[2].answer.lower()
    assert (
        "part-counter" in draft.five_whys[3].answer.lower()
        or "piece-counter" in draft.five_whys[3].answer.lower()
    )

    # Verify 6M Ishikawa classification
    categories = {"Machine", "Method", "Material", "Man", "Measurement", "Milieu"}
    assert set(draft.ishikawa.keys()) == categories
    assert any("vibration" in m.lower() for m in draft.ishikawa["Machine"])
    assert any("calendar" in m.lower() for m in draft.ishikawa["Method"])
    assert any("ruled out" in m.lower() for m in draft.ishikawa["Material"])
    assert any("ruled out" in m.lower() for m in draft.ishikawa["Man"])


def test_build_root_cause_finding_im_scenario():
    """Verifies 5-Whys and Ishikawa for Injection Molding scenario."""
    draft = build_root_cause_finding(
        board_data={
            "suspect_machine": "IM-05",
            "suspect_tool": "CAV-03",
            "defect_type": "short_fill",
        }
    )
    assert isinstance(draft, RootCauseFindingDraft)
    assert draft.confidence >= 0.85
    assert "short fill" in draft.finding.lower()
    assert draft.citation == DEFAULT_IM_CITATION
    assert len(draft.five_whys) == 5
    assert set(draft.ishikawa.keys()) == {
        "Machine",
        "Method",
        "Material",
        "Man",
        "Measurement",
        "Milieu",
    }


def test_build_root_cause_finding_with_field_evidence():
    """Verifies confidence raises to >= 0.90 when technician field evidence is attached."""
    draft = build_root_cause_finding(
        board_data={
            "suspect_machine": "CNC-02",
            "suspect_tool": "T07",
            "defect_type": "scratch_vertical",
        },
        field_evidence_present=True,
    )
    assert draft.confidence >= 0.90
    assert "field inspection evidence confirmed" in draft.evidence.lower()


def test_build_root_cause_finding_low_confidence_diagnostic_probe():
    """Verifies diagnostic evidence request is generated when confidence < 0.70."""
    draft = build_root_cause_finding(
        board_data={
            "suspect_machine": "CNC-02",
            "suspect_tool": "T07",
            "defect_type": "scratch_vertical",
        },
        force_low_confidence=True,
    )
    assert draft.confidence < 0.70
    assert draft.diagnostic_request is not None
    assert "mũi dao T07" in draft.diagnostic_request or "T07" in draft.diagnostic_request


def test_rca_gate_confident_route():
    """Verifies rca_gate routes to CONFIDENT and updates blackboard when confidence >= 0.70."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": 0}
    draft = RootCauseFindingDraft(
        finding="Tool insert T07 exceeded rated cutting life.",
        evidence="5-Whys analysis and manual p.112.",
        confidence=0.87,
        citation=DEFAULT_CITATION,
    )

    event = asyncio.run(rca_gate(ctx, draft))
    assert event.actions.route == "CONFIDENT"
    state = blackboard.get_state()
    assert state.status == "repairing"
    assert state.root_cause == "Tool insert T07 exceeded rated cutting life."
    assert len(state.findings) == 1
    assert state.findings[0].agent_id == "RCA"


def test_rca_gate_need_evidence_route():
    """Verifies rca_gate routes to NEED_EVIDENCE and updates blackboard when confidence < 0.70."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": 0}
    draft = RootCauseFindingDraft(
        finding="Preliminary suspect is insert T07 wear.",
        evidence="Insufficient optical resolution to confirm micro-chipping.",
        confidence=0.65,
        citation=DEFAULT_CITATION,
        diagnostic_request=DIAGNOSTIC_REQUEST_TEXT,
    )

    event = asyncio.run(rca_gate(ctx, draft))
    assert event.actions.route == "NEED_EVIDENCE"
    assert ctx.state["evidence_rounds"] == 1
    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert len(state.findings) == 1
    assert state.findings[0].confidence == 0.65


def test_rca_gate_escalate_route_after_max_rounds():
    """Verifies rca_gate routes to ESCALATE when confidence remains below threshold after max rounds."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": MAX_EVIDENCE_ROUNDS}
    draft = RootCauseFindingDraft(
        finding="Unresolved root cause.",
        evidence="Field evidence still ambiguous.",
        confidence=0.55,
        citation=DEFAULT_CITATION,
    )

    event = asyncio.run(rca_gate(ctx, draft))
    assert event.actions.route == "ESCALATE"
    assert "still below" in event.output


def test_root_cause_draft_accepts_one_string_per_ishikawa_category():
    """Gemini's actual answer shape (string per 6M category) validates as one-cause lists."""
    draft = RootCauseFindingDraft.model_validate_json(
        '{"finding": "f", "evidence": "e", "confidence": 0.87, "citation": "c",'
        ' "ishikawa": {"Machine": "T07 flank wear", "Method": ["no tool-life SOP", "manual check"]}}'
    )
    assert draft.ishikawa == {
        "Machine": ["T07 flank wear"],
        "Method": ["no tool-life SOP", "manual check"],
    }


def test_agent_root_cause_adk_definition():
    """Verifies ADK agent configuration and metadata."""
    agent = agent_root_cause.agent
    assert agent.name == "root_cause"
    assert agent_root_cause.AGENT_ID == "RCA"
    assert agent_root_cause.AGENT_NAME == "Root Cause Agent"
    assert agent_root_cause.PHASE == "Phase B - Root Cause"
    assert agent.output_schema is RootCauseFindingDraft
    if agent_root_cause._supports_tools():
        assert len(agent.tools) == 1
        assert agent.tools[0] is query_domain_knowledge
    else:
        assert len(agent.tools) == 0
