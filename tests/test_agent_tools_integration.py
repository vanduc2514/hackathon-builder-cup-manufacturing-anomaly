"""Comprehensive integration tests for foundational tool bindings across all ADK agent nodes."""

from __future__ import annotations

import inspect
import typing
from unittest.mock import patch

import pytest
from google.adk.agents import LlmAgent
from pydantic import BaseModel

from backend.agents import (
    agent_continuous_learning,
    agent_incident_scribe,
    agent_process_analyst,
    agent_quality_inspector,
    agent_root_cause,
    agent_technician_copilot,
    agent_traceability,
)
from backend.agents.mock_llm import MockLlm
from backend.agents.orchestrator import Orchestrator
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    CitationReference,
    DefectInjectionRequest,
    FindingDraft,
    ImpactMetrics,
    RAGSearchResult,
    RootCauseFindingDraft,
    ScribeDraft,
    SensorTelemetryWindowResponse,
    SpcEvaluationResult,
    StreakVerificationResult,
    TraceabilityTopologyResponse,
)
from simulator.injection_engine import injection_engine


@pytest.fixture(autouse=True)
def clean_state():
    """Resets blackboard and simulation before each test."""
    blackboard.reset()
    injection_engine.reset()
    yield
    injection_engine.reset()
    blackboard.reset()


# =============================================================================
# 1. Tool Contracts and Signatures Verification
# =============================================================================


def test_tool_contracts_and_docstrings():
    """Verifies all exposed agent tools have proper docstrings, type annotations, and Pydantic models."""
    tools = [
        agent_quality_inspector.check_spc_control_limits,
        agent_quality_inspector.check_verification_streak,
        agent_traceability.trace_line_topology,
        agent_process_analyst.analyze_machine_telemetry,
        agent_root_cause.query_domain_knowledge,
        agent_technician_copilot.query_repair_procedure,
        agent_incident_scribe.query_8d_archive_and_sops,
        agent_continuous_learning.compute_sustainability_impact,
    ]

    for tool_fn in tools:
        assert tool_fn.__doc__, f"{tool_fn.__name__} must have a docstring"
        assert "ADK Tool:" in tool_fn.__doc__ or "Calculates" in tool_fn.__doc__

        type_hints = typing.get_type_hints(tool_fn)
        ret_type = type_hints.get("return")
        assert ret_type is not None, f"{tool_fn.__name__} missing return annotation"
        assert inspect.isclass(ret_type) and issubclass(ret_type, BaseModel), (
            f"{tool_fn.__name__} return type must be a Pydantic BaseModel"
        )


def test_agent_tool_registration_matrix():
    """Verifies that all 7 agent nodes have tools bound when tool calling is supported."""
    with (
        patch.object(settings, "ai_provider", "gemini"),
        patch.object(settings, "gemini_model", "gemini-flash-latest"),
    ):
        assert agent_quality_inspector._supports_tools() is True
        assert agent_traceability._supports_tools() is True
        assert agent_process_analyst._supports_tools() is True
        assert agent_root_cause._supports_tools() is True
        assert agent_technician_copilot._supports_tools() is True
        assert agent_incident_scribe._supports_tools() is True
        assert agent_continuous_learning._supports_tools() is True


def test_agent_tool_fallback_on_small_models():
    """Verifies that agents fallback gracefully without tools when running small edge models."""
    with (
        patch.object(settings, "ai_provider", "ollama"),
        patch.object(settings, "ollama_model", "gemma2:2b"),
    ):
        assert agent_quality_inspector._supports_tools() is False
        assert agent_traceability._supports_tools() is False
        assert agent_process_analyst._supports_tools() is False
        assert agent_root_cause._supports_tools() is False
        assert agent_technician_copilot._supports_tools() is False
        assert agent_incident_scribe._supports_tools() is False
        assert agent_continuous_learning._supports_tools() is False


# =============================================================================
# 2. Individual Tool Execution (Offline / Mock Fallback Parity)
# =============================================================================


def test_quality_inspector_spc_tools():
    """Tests Quality Inspector SPC evaluation and streak verification tools."""
    # SPC control limits calculation
    breached_result = agent_quality_inspector.check_spc_control_limits(
        defect_count=23,
        sample_size=300,
        baseline_p=0.005,
    )
    assert isinstance(breached_result, SpcEvaluationResult)
    assert breached_result.is_breached is True
    assert breached_result.defect_rate > breached_result.limits.ucl

    nominal_result = agent_quality_inspector.check_spc_control_limits(
        defect_count=1,
        sample_size=300,
        baseline_p=0.005,
    )
    assert nominal_result.is_breached is False

    # Streak gatekeeper verification
    in_progress_streak = agent_quality_inspector.check_verification_streak(
        good_streak=30,
        target=50,
    )
    assert isinstance(in_progress_streak, StreakVerificationResult)
    assert in_progress_streak.verified is False
    assert in_progress_streak.good_streak == 30
    assert in_progress_streak.target == 50

    verified_streak = agent_quality_inspector.check_verification_streak(
        good_streak=50,
        target=50,
    )
    assert verified_streak.verified is True


@pytest.mark.asyncio
async def test_traceability_topology_tool():
    """Tests Traceability Agent line topology query tool with offline mock fallback."""
    response = await agent_traceability.trace_line_topology(time_window="09:30-10:00")
    assert isinstance(response, TraceabilityTopologyResponse)
    assert len(response.suspects) > 0
    top_suspect = response.suspects[0]
    assert top_suspect.machine_id == "CNC-02"
    assert top_suspect.tool_id == "T07"
    assert len(response.excluded_factors) > 0


@pytest.mark.asyncio
async def test_process_analyst_telemetry_tool():
    """Tests Process Analyst continuous sensor telemetry query tool."""
    response = await agent_process_analyst.analyze_machine_telemetry(
        machine_id="CNC-02",
        opened_at="2026-10-18T14:30:00Z",
    )
    assert isinstance(response, SensorTelemetryWindowResponse)
    assert response.machine_id == "CNC-02"
    assert response.anomaly_detected is True
    assert response.metrics.avg_vibration > response.baseline.vibration


@pytest.mark.asyncio
async def test_root_cause_domain_knowledge_tool():
    """Tests Root Cause Agent domain knowledge RAG search tool."""
    result = await agent_root_cause.query_domain_knowledge(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
    )
    assert isinstance(result, RAGSearchResult)
    assert len(result.citations) > 0
    assert all(isinstance(c, CitationReference) for c in result.citations)
    assert any(
        "CNC-02" in c.citation
        or "Manual" in c.citation
        or "8D" in c.citation
        or "SOP" in c.citation
        or "T07" in c.snippet
        for c in result.citations
    )


@pytest.mark.asyncio
async def test_technician_copilot_repair_manual_tool():
    """Tests Technician Copilot repair procedure lookup tool."""
    result = await agent_technician_copilot.query_repair_procedure(
        machine_id="CNC-02",
        defect_symptom="scratch_vertical",
    )
    assert isinstance(result, RAGSearchResult)
    assert len(result.citations) > 0
    assert all(isinstance(c, CitationReference) for c in result.citations)


@pytest.mark.asyncio
async def test_incident_scribe_8d_archive_tool():
    """Tests Incident Scribe historical 8D and SOP query tool."""
    result = await agent_incident_scribe.query_8d_archive_and_sops(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
    )
    assert isinstance(result, RAGSearchResult)
    assert len(result.citations) > 0
    assert all(isinstance(c, CitationReference) for c in result.citations)


def test_continuous_learning_sustainability_impact_tool():
    """Tests Continuous Learning sustainability impact calculation tool."""
    # Aluminum CNC scenario
    cnc_metrics = agent_continuous_learning.compute_sustainability_impact(
        factory_type="aluminum_cnc",
        earlier_detection_minutes=120.0,
        line_speed_parts_per_min=2.0,
    )
    assert isinstance(cnc_metrics, ImpactMetrics)
    assert cnc_metrics.scrap_avoided == 240
    assert cnc_metrics.downtime_minutes == 45
    assert cnc_metrics.energy_kwh > 0
    assert cnc_metrics.co2_kg > 0

    # ABS Injection Molding scenario
    im_metrics = agent_continuous_learning.compute_sustainability_impact(
        factory_type="abs_injection_molding",
        earlier_detection_minutes=60.0,
        line_speed_parts_per_min=1.0,
    )
    assert isinstance(im_metrics, ImpactMetrics)
    assert im_metrics.scrap_avoided == 60


# =============================================================================
# 3. Agent Metadata and ADK Output Schema Compatibility
# =============================================================================


def test_agent_schemas_and_metadata():
    """Verifies ADK agent output schemas across all 7 agent nodes."""
    assert agent_quality_inspector.agent.output_schema is FindingDraft
    assert agent_traceability.agent.output_schema is FindingDraft
    assert agent_process_analyst.agent.output_schema is FindingDraft
    assert agent_root_cause.agent.output_schema is RootCauseFindingDraft
    assert agent_technician_copilot.agent.output_schema is FindingDraft
    assert agent_technician_copilot.diagnostic_agent.output_schema is FindingDraft
    assert agent_incident_scribe.agent.output_schema is ScribeDraft
    assert agent_continuous_learning.agent.output_schema is FindingDraft


# =============================================================================
# 4. End-to-End Orchestrator Workflow Cohesion
# =============================================================================


@pytest.mark.asyncio
async def test_orchestrator_workflow_with_bound_tools():
    """Verifies that incident_workflow executes end-to-end with all agents having bound tools."""
    # Inject active CNC tool wear scenario to trigger SPC upper breach
    injection_engine.inject_scenario_1_cnc_tool_wear()

    mock_llm = MockLlm()
    saved = LlmAgent._default_model
    try:
        LlmAgent.set_default_model(mock_llm)
        orchestrator = Orchestrator(step_delay=0)
        request = DefectInjectionRequest(
            defect_type="scratch_vertical",
            suspect_machine="CNC-02",
            mode="fast",
        )
        final_state = await orchestrator.run_incident(request)

        # Confirm successful closed-loop completion
        assert final_state.status == "closed"
        assert len(final_state.findings) >= 5

        # Verify findings from all agents are recorded on the Blackboard
        agent_ids = {f.agent_id for f in final_state.findings}
        assert "QA" in agent_ids
        assert "TRA" in agent_ids
        assert "PA" in agent_ids
        assert "RCA" in agent_ids
        assert "COPILOT" in agent_ids
        assert "DOC" in agent_ids
        assert "LEARN" in agent_ids
    finally:
        LlmAgent._default_model = saved
