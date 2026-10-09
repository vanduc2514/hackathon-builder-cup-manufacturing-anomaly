"""End-to-end verification of zero-credential local development parity (Issue #81).

Verifies that:
1. ADK Orchestrator and all agents execute with AI_PROVIDER=mock without cloud credentials or Ollama.
2. BigQuery tool gracefully falls back to grounded mock fixtures when client fails to connect.
3. Vertex AI RAG search gracefully falls back to local BM25 indexing in data/knowledge_base/.
4. Gemini Live Copilot runs in simulation mode without requiring live GCP credentials.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

from google.adk.agents import LlmAgent

from backend.agents.mock_llm import MockLlm
from backend.agents.orchestrator import Orchestrator
from backend.core.config import Settings
from backend.core.models import DefectInjectionRequest
from backend.tools.bigquery_tool import (
    query_sensor_telemetry_window,
    query_traceability_topology,
)
from backend.tools.rag_search_tool import (
    format_citations_for_prompt,
    search_knowledge_base_sync,
)
from simulator.injection_engine import injection_engine


def test_zero_credential_orchestrator_mock_workflow():
    """Verify entire ADK multi-agent workflow runs end-to-end with AI_PROVIDER=mock."""
    saved = LlmAgent._default_model
    try:
        LlmAgent.set_default_model(MockLlm())
        injection_engine.reset()
        injection_engine.inject_scenario_1_cnc_tool_wear()
        orch = Orchestrator(step_delay=0)
        req = DefectInjectionRequest(
            defect_type="scratch_vertical",
            defect_rate=0.0767,
            machine_id="CNC-02",
            tool_id="T07",
            spindle_vibration=3.82,
        )

        state = asyncio.run(orch.run_incident(req))

        # Confirm workflow advanced through all stages without credential errors
        assert state.status == "closed"
        assert state.suspect_machine == "CNC-02"
        assert state.repair_done is True
        assert len(state.findings) >= 5

        # Check agent findings are populated
        ids = [f.agent_id for f in state.findings]
        assert "QA" in ids
        assert "TRA" in ids
        assert "PA" in ids
        assert "RCA" in ids
        assert "COPILOT" in ids
        assert "DOC" in ids
        assert "LEARN" in ids
    finally:
        LlmAgent._default_model = saved
        injection_engine.reset()


def test_zero_credential_bigquery_mock_fallback():
    """Verify BigQuery queries gracefully fall back to mock data fixtures."""
    # Force BigQuery client init failure to simulate zero-credential environment
    with patch(
        "backend.tools.bigquery_tool.get_bigquery_client",
        side_effect=RuntimeError("GCP credentials not found / emulator down"),
    ):
        # Traceability topology query
        topo = query_traceability_topology(time_window="09:30-10:00")
        assert topo.source == "mock_fallback"
        assert len(topo.suspects) >= 1
        assert topo.suspects[0].machine_id == "CNC-02"
        assert topo.suspects[0].tool_id == "T07"
        assert topo.suspects[0].correlation_score == 0.95

        # Sensor telemetry window query
        telemetry_anomaly = query_sensor_telemetry_window(machine_id="CNC-02")
        assert telemetry_anomaly.source == "mock_fallback"
        assert telemetry_anomaly.anomaly_detected is True
        assert telemetry_anomaly.metrics.max_vibration == 3.82

        telemetry_normal = query_sensor_telemetry_window(machine_id="CNC-01")
        assert telemetry_normal.anomaly_detected is False


def test_zero_credential_rag_local_bm25_fallback():
    """Verify RAG queries gracefully fall back to local markdown knowledge base."""
    # Simulate Discovery Engine unavailable or unconfigured
    with patch(
        "backend.tools.rag_search_tool._vertex_client.search",
        side_effect=RuntimeError("Discovery Engine 403 / unconfigured"),
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
        )

        assert result.engine == "local_bm25"
        assert len(result.citations) > 0
        assert result.confidence > 0.0

        # Verify strict citation contract
        top_citation = result.citations[0]
        assert top_citation.title != ""
        assert top_citation.snippet != ""
        assert top_citation.relevance_score >= 0.35

        # Verify formatting for prompts
        prompt_block = format_citations_for_prompt(result.citations)
        assert "### Grounded Domain Knowledge Citations:" in prompt_block
        assert top_citation.title in prompt_block


def test_zero_credential_config_defaults():
    """Verify settings defaults enable local mock and fallback behavior out-of-the-box."""
    s = Settings()
    assert s.bigquery_fallback_to_mock is True
    assert s.rag_fallback_to_local is True
    assert s.gemini_live_simulation_mode is True
