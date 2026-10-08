"""Unit and integration tests for Root Cause Agent: RAG domain grounding, 5-Whys, Ishikawa, confidence gatekeeping, and feedback loop."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from backend.agents import agent_root_cause
from backend.agents.agent_root_cause import (
    DEFAULT_CITATION,
    DEFAULT_IM_CITATION,
    DIAGNOSTIC_REQUEST_TEXT,
    build_root_cause_finding,
    has_field_evidence,
    load_mock_root_cause_knowledge,
    query_domain_knowledge,
)
from backend.agents.workflow_nodes import MAX_EVIDENCE_ROUNDS, rca_gate
from backend.core.blackboard import blackboard
from backend.core.models import (
    AgentFinding,
    CitationReference,
    RAGSearchResult,
    RootCauseFindingDraft,
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


def test_query_domain_knowledge_fallback():
    """Verifies graceful fallback to verified domain knowledge when Vertex AI Search fails."""
    with patch(
        "backend.agents.agent_root_cause.search_knowledge_base",
        side_effect=RuntimeError("Google Cloud Discovery Engine offline"),
    ):
        result = asyncio.run(
            query_domain_knowledge("scratch_vertical", "CNC-02")
        )
        assert isinstance(result, RAGSearchResult)
        assert len(result.citations) == 3
        assert result.confidence >= 0.85


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
        result = asyncio.run(
            query_domain_knowledge("scratch_vertical", "CNC-02")
        )
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
        board_data={"suspect_machine": "CNC-02", "suspect_tool": "T07", "defect_type": "scratch_vertical"}
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

    assert "vertical scratch" in draft.five_whys[0].why.lower() or "vertical scratch" in draft.five_whys[0].answer.lower()
    assert "2,000" in draft.five_whys[1].answer or "2,400" in draft.five_whys[1].answer
    assert "calendar" in draft.five_whys[2].answer.lower()
    assert "part-counter" in draft.five_whys[3].answer.lower() or "piece-counter" in draft.five_whys[3].answer.lower()

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
        board_data={"suspect_machine": "IM-05", "suspect_tool": "CAV-03", "defect_type": "short_fill"}
    )
    assert isinstance(draft, RootCauseFindingDraft)
    assert draft.confidence >= 0.85
    assert "short fill" in draft.finding.lower()
    assert draft.citation == DEFAULT_IM_CITATION
    assert len(draft.five_whys) == 5
    assert set(draft.ishikawa.keys()) == {"Machine", "Method", "Material", "Man", "Measurement", "Milieu"}


def test_build_root_cause_finding_with_field_evidence():
    """Verifies confidence raises to >= 0.90 when technician field evidence is attached."""
    draft = build_root_cause_finding(
        board_data={"suspect_machine": "CNC-02", "suspect_tool": "T07", "defect_type": "scratch_vertical"},
        field_evidence_present=True,
    )
    assert draft.confidence >= 0.90
    assert "field inspection evidence confirmed" in draft.evidence.lower()


def test_build_root_cause_finding_low_confidence_diagnostic_probe():
    """Verifies diagnostic evidence request is generated when confidence < 0.70."""
    draft = build_root_cause_finding(
        board_data={"suspect_machine": "CNC-02", "suspect_tool": "T07", "defect_type": "scratch_vertical"},
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

