"""Unit and integration tests for Process Analyst Agent: continuous sensor telemetry and deviation analysis."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from backend.agents.agent_process_analyst import (
    AGENT_ID,
    AGENT_NAME,
    CITATION,
    PHASE,
    _supports_tools,
    agent,
    analyze_machine_telemetry,
)
from backend.agents.workflow_nodes import record_process_analysis
from backend.core.blackboard import blackboard
from backend.core.models import (
    FindingDraft,
    SensorBaseline,
    SensorMetrics,
    SensorTelemetryWindowResponse,
)


def load_mock_sensor_telemetry(
    machine_id: str, time_window: str | None = None
) -> SensorTelemetryWindowResponse:
    """Returns mock sensor telemetry showing a 35% vibration and 12% current rise (test fixture)."""
    metrics = SensorMetrics(
        min_vibration=1.80,
        max_vibration=2.50,
        avg_vibration=2.03,
        std_vibration=0.15,
        avg_temperature=42.0,
        avg_current=13.4,
        sample_count=120,
    )
    baseline = SensorBaseline(vibration=1.5, temperature=40.0, current=12.0)

    return SensorTelemetryWindowResponse(
        source="mock_telemetry",
        machine_id=machine_id,
        time_window=time_window or "09:00-10:00",
        metrics=metrics,
        baseline=baseline,
        anomaly_detected=True,
    )


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_agent_process_analyst_adk_definition():
    """Verifies Process Analyst ADK Agent configuration and metadata."""
    assert agent.name == "process_analyst"
    assert AGENT_ID == "PA"
    assert AGENT_NAME == "Process Analyst Agent"
    assert PHASE == "Phase B - Sensor Analysis"
    assert agent.output_schema is FindingDraft
    if _supports_tools():
        assert len(agent.tools) == 1
        assert agent.tools[0] is analyze_machine_telemetry
    else:
        assert len(agent.tools) == 0


def test_load_mock_sensor_telemetry():
    """Verifies mock telemetry loading and baseline deviations."""
    response = load_mock_sensor_telemetry(machine_id="CNC-02")
    assert response.source == "mock_telemetry"
    assert response.machine_id == "CNC-02"
    assert response.anomaly_detected is True

    # Validate deviations
    vibration_increase = response.metrics.avg_vibration / response.baseline.vibration
    current_increase = response.metrics.avg_current / response.baseline.current

    assert round(vibration_increase, 2) == 1.35  # +35%
    assert round(current_increase, 2) == 1.12  # +12%
    assert response.metrics.avg_temperature == 42.0


def test_analyze_machine_telemetry_error_propagation_on_bigquery_error():
    """Verifies error propagation when BigQuery / emulator query fails."""
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        side_effect=RuntimeError("BigQuery connection refused"),
    ):
        with pytest.raises(RuntimeError, match="BigQuery connection refused"):
            asyncio.run(analyze_machine_telemetry(machine_id="CNC-02"))


def test_analyze_machine_telemetry_uses_live_bigquery():
    """Verifies that live BigQuery results are returned directly when available."""
    mock_response = SensorTelemetryWindowResponse(
        source="bigquery_emulator",
        machine_id="CNC-02",
        time_window="09:00-10:00",
        metrics=SensorMetrics(
            min_vibration=0.0,
            max_vibration=0.0,
            avg_vibration=0.0,
            std_vibration=0.0,
            avg_temperature=0.0,
            avg_current=0.0,
            sample_count=0,
        ),
    )
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        return_value=mock_response,
    ):
        response = asyncio.run(analyze_machine_telemetry(machine_id="CNC-02"))
        assert response.source == "bigquery_emulator"
        assert response.machine_id == "CNC-02"


def test_record_process_analysis_workflow_node():
    """Verifies record_process_analysis writes finding and sets status on blackboard."""
    draft = FindingDraft(
        finding="Vibration and current anomalies detected on CNC-02.",
        evidence="Spindle vibration rose 35% and motor current rose 12% from 09:30.",
        confidence=0.89,
        citation=CITATION,
    )

    state = asyncio.run(record_process_analysis(draft))
    assert state.status == "analyzing"
    assert len(state.findings) == 1
    assert state.findings[0].agent_id == "PA"
    assert "35%" in state.findings[0].evidence
    assert state.findings[0].citation == CITATION
