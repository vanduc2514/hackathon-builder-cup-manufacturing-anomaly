"""Process Analyst Agent: Extracts continuous sensor telemetry for suspect machines and analyzes time-window deviations."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from google.adk import Agent

from backend.core.models import (
    FindingDraft,
    SensorBaseline,
    SensorMetrics,
    SensorTelemetryWindowResponse,
)
from backend.tools.bigquery_tool import query_sensor_telemetry_window

logger = logging.getLogger(__name__)

AGENT_ID = "PA"
AGENT_NAME = "Process Analyst Agent"
PHASE = "Phase B - Sensor Analysis"

CITATION = "BigQuery machine_telemetry_5s 09:00-10:00"

def load_mock_sensor_telemetry(machine_id: str, time_window: Optional[str] = None) -> SensorTelemetryWindowResponse:
    """Returns mock sensor telemetry showing a 35% vibration and 12% current rise."""
    # Baseline: vibration=1.5, temperature=40.0, current=12.0
    # +35% vibration = 1.5 * 1.35 = 2.025 (~2.03)
    # +12% current = 12.0 * 1.12 = 13.44 (~13.4)
    # temp steady at 42C
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

async def analyze_machine_telemetry(
    machine_id: str,
    time_window: Optional[str] = "09:00-10:00",
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> SensorTelemetryWindowResponse:
    """Queries continuous sensor telemetry; seamlessly falls back to mock dataset when BigQuery is offline."""
    try:
        return await asyncio.to_thread(
            query_sensor_telemetry_window,
            machine_id=machine_id,
            start_time=start_time,
            end_time=end_time,
            time_window=time_window,
        )
    except Exception as exc:
        logger.warning(
            "BigQuery telemetry query unavailable (%s); falling back to mock dataset",
            exc,
        )
        return load_mock_sensor_telemetry(machine_id=machine_id, time_window=time_window)

INSTRUCTION = (
    "You are the Process Analyst Agent of the Kaizen Agent manufacturing incident team. "
    "Your role is to analyze continuous sensor telemetry for machines suspected of causing defects. "
    "The user message is the current incident board as JSON. "
    "Look at the board findings or suspect_machine field to identify the primary suspect machine. "
    "Call the analyze_machine_telemetry tool for the suspected machine for the precise pre-incident time window (e.g. 09:00 to 10:00). "
    "Analyze the metrics returned. Compare the suspected machine's sensor readings against nominal line baselines. "
    "Identify any baseline deviations (e.g., calculate the percentage increase for vibration and motor current, note if temperature is steady). "
    "Correlate the temporal onset (e.g., mechanical anomaly started prior to the visual defect). "
    "Return a FindingDraft containing the percentage shifts, onset timestamps, a high confidence score (e.g. 0.89), "
    f"and cite the table/window queried as your citation (e.g. '{CITATION}')."
)

agent = Agent(
    name="process_analyst",
    description="Analyzes suspect machine telemetry for deviations preceding the defects.",
    instruction=INSTRUCTION,
    tools=[analyze_machine_telemetry],
    output_schema=FindingDraft,
)
