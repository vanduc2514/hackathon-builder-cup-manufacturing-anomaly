"""Scripted per-scenario agent drafts: coverage, types and RCA gate compatibility."""

from __future__ import annotations

import pytest

from backend.agents import (
    agent_continuous_learning,
    agent_incident_scribe,
    agent_process_analyst,
    agent_quality_inspector,
    agent_root_cause,
    agent_technician_copilot,
    agent_traceability,
)
from backend.agents.scenario_fallbacks import DEFAULT_SCENARIO, fallback_draft
from backend.agents.workflow_nodes import RCA_CONFIDENCE_THRESHOLD, SECONDARY_CONFIDENCE_THRESHOLD
from backend.core.models import FindingDraft, RootCauseFindingDraft, ScribeDraft

SCENARIOS = ("cnc_tool_wear", "im_damp_material")
AGENTS = [
    agent_quality_inspector.agent,
    agent_traceability.agent,
    agent_process_analyst.agent,
    agent_root_cause.agent,
    agent_technician_copilot.agent,
    agent_technician_copilot.diagnostic_agent,
    agent_incident_scribe.agent,
    agent_continuous_learning.agent,
]


@pytest.mark.parametrize("scenario", SCENARIOS)
@pytest.mark.parametrize("agent", AGENTS, ids=lambda a: a.name)
def test_every_agent_has_a_draft_matching_its_output_schema(scenario: str, agent):
    draft = fallback_draft(agent.name, scenario)

    assert type(draft) is agent.output_schema
    assert draft.finding and draft.evidence and draft.citation
    assert 0.0 < draft.confidence <= 1.0
    agent.output_schema.model_validate(draft.model_dump())


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_root_cause_draft_clears_both_rca_gates_with_a_full_causal_chain(scenario: str):
    draft = fallback_draft("root_cause", scenario)

    assert isinstance(draft, RootCauseFindingDraft)
    assert draft.confidence >= SECONDARY_CONFIDENCE_THRESHOLD > RCA_CONFIDENCE_THRESHOLD
    assert draft.diagnostic_request is None
    assert [step.level for step in draft.five_whys] == [1, 2, 3, 4, 5]
    assert set(draft.ishikawa) == {"Machine", "Method", "Material", "Man", "Measurement", "Milieu"}
    assert all(draft.ishikawa.values())


def test_cnc_drafts_follow_the_demo_story():
    rca = fallback_draft("root_cause", "cnc_tool_wear")
    scribe = fallback_draft("incident_scribe", "cnc_tool_wear")

    assert rca.confidence == 0.87
    assert "T07" in rca.finding and "CNC-02" in rca.finding
    assert "AL-5083-B4" in fallback_draft("traceability", "cnc_tool_wear").finding
    assert isinstance(scribe, ScribeDraft)
    assert scribe.work_order and scribe.report_8d and scribe.sop_proposal


def test_unknown_or_missing_scenario_uses_the_cnc_story():
    expected = fallback_draft("traceability", DEFAULT_SCENARIO)

    assert fallback_draft("traceability", None) == expected
    assert fallback_draft("traceability", "something_else") == expected


def test_drafts_are_independent_copies():
    first = fallback_draft("root_cause", "cnc_tool_wear")
    first.five_whys.clear()
    first.finding = "mutated"

    second = fallback_draft("root_cause", "cnc_tool_wear")
    assert len(second.five_whys) == 5
    assert second.finding != "mutated"


def test_unknown_agent_is_an_error():
    with pytest.raises(KeyError):
        fallback_draft("not_an_agent", "cnc_tool_wear")


def test_plain_agents_return_finding_drafts():
    assert type(fallback_draft("quality_inspector", "cnc_tool_wear")) is FindingDraft
