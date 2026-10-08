"""Unit and integration tests for Continuous Learning Agent (sustainability impact, institutional RAG ingestion, and video walkthroughs)."""

from __future__ import annotations

import asyncio

import pytest

from backend.agents import agent_continuous_learning
from backend.agents.agent_continuous_learning import (
    AGENT_ID,
    AGENT_NAME,
    DEFAULT_CITATION,
    PHASE,
    analyze_repair_video_walkthrough,
    build_learning_draft,
    calculate_impact_metrics,
    clear_knowledge_base,
    get_knowledge_base,
    ingest_defect_resolution,
)
from backend.agents.workflow_nodes import record_learning
from backend.core.blackboard import blackboard
from backend.core.models import (
    FindingDraft,
    ImpactMetrics,
    IncidentState,
    KnowledgeBaseEntry,
    RepairVideoAnalysis,
)


@pytest.fixture(autouse=True)
def clean_blackboard_and_kb():
    blackboard.reset()
    clear_knowledge_base()
    yield
    clear_knowledge_base()
    blackboard.reset()


def test_agent_continuous_learning_adk_definition():
    """Ensures Continuous Learning ADK agent is properly configured with contract and token limits."""
    assert agent_continuous_learning.agent.name == "continuous_learning"
    assert agent_continuous_learning.agent.output_schema == FindingDraft
    assert agent_continuous_learning.agent.generate_content_config is not None
    assert agent_continuous_learning.agent.generate_content_config.max_output_tokens == 2048

    assert AGENT_ID == "LEARN"
    assert AGENT_NAME == "Continuous Learning"
    assert PHASE == "Phase D - Learning"


def test_calculate_impact_metrics_cnc():
    """Verifies sustainability calculation for CNC automotive aluminum archetype."""
    state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        defect_type="scratch_vertical",
    )

    impact = calculate_impact_metrics(state)
    assert isinstance(impact, ImpactMetrics)
    assert impact.factory_type == "aluminum_cnc"
    assert impact.scrap_avoided == 240
    assert impact.downtime_minutes == 45
    assert impact.energy_kwh == 38.0
    assert impact.co2_kg == 25.0
    assert impact.cost_savings_usd == 3600.0
    assert impact.energy_co2_kg == 15.2
    assert impact.material_co2_kg == 9.8


def test_calculate_impact_metrics_im():
    """Verifies sustainability calculation for Injection Molding electronics enclosure archetype."""
    state = IncidentState(
        incident_id="INC-0520",
        suspect_machine="IM-05",
        defect_type="short_fill",
    )

    impact = calculate_impact_metrics(state)
    assert isinstance(impact, ImpactMetrics)
    assert impact.factory_type == "abs_injection_molding"
    assert impact.scrap_avoided == 240
    assert impact.downtime_minutes == 30
    assert impact.energy_kwh == 12.0
    assert impact.cost_savings_usd > 0


def test_analyze_repair_video_walkthrough_cnc():
    """Verifies procedural step extraction and safety checkpoints from CNC repair walkthrough."""
    video_uri = "gs://kaizen-knowledge/expert_videos/cnc02_tool_insert_swap_walkthrough.mp4"
    analysis = analyze_repair_video_walkthrough(video_uri, domain="cnc")

    assert isinstance(analysis, RepairVideoAnalysis)
    assert analysis.video_uri == video_uri
    assert analysis.equipment_id == "CNC-02"
    assert len(analysis.key_steps) >= 5

    # Check key procedural actions
    assert any("LOTO" in s for s in analysis.key_steps)
    assert any("WNMG-080408" in s for s in analysis.key_steps)
    assert any("4.2 N·m" in s for s in analysis.key_steps)
    assert any("0.005 mm" in s for s in analysis.key_steps)

    # Check verification checkpoints
    assert any("4.2 N·m" in c for c in analysis.verified_checkpoints)
    assert any("0.005 mm" in c for c in analysis.verified_checkpoints)

    # Check safety notices
    assert any("Zero-energy" in s for s in analysis.safety_notices)


def test_analyze_repair_video_walkthrough_im():
    """Verifies procedural step extraction for Injection Molding dryer overhaul."""
    video_uri = "gs://kaizen-knowledge/expert_videos/im05_dryer_overhaul_walkthrough.mp4"
    analysis = analyze_repair_video_walkthrough(video_uri, domain="injection_molding")

    assert isinstance(analysis, RepairVideoAnalysis)
    assert analysis.equipment_id == "IM-05"
    assert any("FLT-DM-04" in s for s in analysis.key_steps)
    assert any("-40°C" in s for s in analysis.key_steps)
    assert any("-40°C" in c for c in analysis.verified_checkpoints)


def test_ingest_defect_resolution():
    """Verifies indexing resolved incidents into the Defect -> Cause -> Fix institutional knowledge base."""
    state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
        root_cause="Tool T07 insert flank wear exceeded 2,000 cuts.",
    )

    entry = ingest_defect_resolution(state)
    assert isinstance(entry, KnowledgeBaseEntry)
    assert entry.incident_id == "INC-0412"
    assert entry.defect_type == "scratch_vertical"
    assert entry.machine_id == "CNC-02"
    assert entry.tool_id == "T07"
    assert len(entry.resolution_steps) > 0
    assert "SOP-MNT-CNC-04" in entry.preventive_action
    assert entry.impact.scrap_avoided == 240
    assert entry.video_metadata is not None

    kb = get_knowledge_base()
    assert len(kb) == 1
    assert kb[0].entry_id == entry.entry_id


def test_build_learning_draft():
    """Verifies complete FindingDraft generation with auditable citation and impact figures."""
    state = IncidentState(
        incident_id="INC-0412",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
    )

    draft = build_learning_draft(state)
    assert isinstance(draft, FindingDraft)
    assert draft.confidence == 0.99
    assert draft.citation == DEFAULT_CITATION
    assert "240 scrap parts avoided" in draft.finding
    assert "45 min downtime saved" in draft.finding
    assert "38.0 kWh" in draft.finding
    assert "25.0 kg CO2e" in draft.finding
    assert "$3,600" in draft.finding


def test_record_learning_workflow_node_integration():
    """Tests that record_learning node records finding and populates blackboard impact metrics."""
    blackboard.update_status("verifying", suspect_machine="CNC-02", defect_type="scratch_vertical")
    learning_draft = build_learning_draft(blackboard.get_state())

    asyncio.run(record_learning(learning_draft))

    state = blackboard.get_state()
    assert state.status == "closed"
    assert state.impact is not None
    assert state.impact.scrap_avoided == 240
    assert state.impact.downtime_minutes == 45
    assert state.impact.energy_kwh == 38.0
    assert state.impact.co2_kg == 25.0
    assert state.impact.cost_savings_usd == 3600.0

    # Ensure finding recorded on blackboard
    learn_findings = [f for f in state.findings if f.agent_id == "LEARN"]
    assert len(learn_findings) == 1
    assert learn_findings[0].phase == "Phase D - Learning"
    assert learn_findings[0].confidence == 0.99
