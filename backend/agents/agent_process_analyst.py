"""Process Analyst Agent: Extracts continuous sensor telemetry for suspect machines and analyzes time-window deviations."""

from __future__ import annotations

import asyncio
import logging

from google.adk import Agent

from backend.core.models import (
    FindingDraft,
    SensorTelemetryWindowResponse,
)
from backend.tools.bigquery_tool import query_sensor_telemetry_window

logger = logging.getLogger(__name__)

AGENT_ID = "PA"
AGENT_NAME = "Process Analyst Agent"
PHASE = "Phase B - Sensor Analysis"

CITATION = "BigQuery machine_telemetry_5s 09:00-10:00"


async def analyze_machine_telemetry(
    machine_id: str,
    time_window: str | None = "09:00-10:00",
    start_time: str | None = None,
    end_time: str | None = None,
) -> SensorTelemetryWindowResponse:
    """Queries continuous sensor telemetry directly from BigQuery."""
    return await asyncio.to_thread(
        query_sensor_telemetry_window,
        machine_id=machine_id,
        start_time=start_time,
        end_time=end_time,
        time_window=time_window,
    )


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
