"""Process Analyst Agent: Extracts continuous sensor telemetry for suspect machines and analyzes time-window deviations."""

from __future__ import annotations

import asyncio
import logging

from google.adk import Agent

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.config import settings
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


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


async def analyze_machine_telemetry(
    machine_id: str,
    time_window: str | None = "09:00-10:00",
    start_time: str | None = None,
    end_time: str | None = None,
) -> SensorTelemetryWindowResponse:
    """ADK Tool: Queries continuous sensor telemetry directly from BigQuery."""
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
    "Call the analyze_machine_telemetry tool once for that machine with time_window '09:00-10:00', "
    "the pre-incident window. Its result already carries the nominal line baseline, so do not "
    "query other windows. "
    "Compare the suspected machine's sensor readings against that baseline: calculate the "
    "percentage increase for vibration and motor current and note whether temperature is steady. "
    "Return a FindingDraft containing the percentage shifts, a high confidence score (e.g. 0.89), "
    f"and cite the table/window queried as your citation (e.g. '{CITATION}')."
)

agent = Agent(
    name="process_analyst",
    description="Analyzes suspect machine telemetry for deviations preceding the defects.",
    instruction=INSTRUCTION,
    tools=[analyze_machine_telemetry] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(analyze_machine_telemetry),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
)
