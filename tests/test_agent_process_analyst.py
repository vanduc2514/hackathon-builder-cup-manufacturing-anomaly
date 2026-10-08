"""Unit and integration tests for Process Analyst Agent: continuous sensor telemetry, deviation analysis, and mock fallback."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.agent_process_analyst import (
    CITATION,
    analyze_machine_telemetry,
    load_mock_sensor_telemetry,
)
from backend.agents.workflow_nodes import record_process_analysis
from backend.core.blackboard import blackboard
from backend.core.models import (
    FindingDraft,
    SensorMetrics,
    SensorTelemetryWindowResponse,
)


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


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


def test_analyze_machine_telemetry_fallback_on_bigquery_error():
    """Verifies seamless fallback to mock telemetry when BigQuery query fails."""
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        side_effect=RuntimeError("BigQuery connection refused"),
    ):
        response = asyncio.run(analyze_machine_telemetry(machine_id="CNC-02"))
        assert response.source == "mock_telemetry"
        assert response.machine_id == "CNC-02"


def test_analyze_machine_telemetry_uses_live_bigquery():
    """Verifies that live BigQuery results are returned directly when available."""
    mock_response = SensorTelemetryWindowResponse(
        source="bigquery_emulator",
        machine_id="CNC-02",
        time_window="09:00-10:00",
        metrics=SensorMetrics(
            min_vibration=0.0, max_vibration=0.0, avg_vibration=0.0, std_vibration=0.0,
            avg_temperature=0.0, avg_current=0.0, sample_count=0
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
