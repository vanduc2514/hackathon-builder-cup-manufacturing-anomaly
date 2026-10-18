"""Process Analyst Agent: Extracts continuous sensor telemetry for suspect machines and analyzes time-window deviations."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

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

CITATION = "BigQuery sensor_telemetry pre-incident window"

PRE_INCIDENT_WINDOW_MINUTES = 60


def pre_incident_window(opened_at: str) -> tuple[str, str]:
    """Returns ISO 8601 UTC (start, end) bounds of the window ending when the incident opened.

    Raises:
        ValueError: If opened_at is not an ISO 8601 timestamp.
    """
    end = datetime.fromisoformat(opened_at.strip().replace("Z", "+00:00"))
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    end = end.astimezone(timezone.utc)
    start = end - timedelta(minutes=PRE_INCIDENT_WINDOW_MINUTES)
    return start.isoformat(), end.isoformat()


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


async def analyze_machine_telemetry(
    machine_id: str,
    opened_at: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
) -> SensorTelemetryWindowResponse:
    """ADK Tool: Queries continuous sensor telemetry directly from BigQuery.

    Args:
        machine_id: Board suspect_machine.
        opened_at: Board opened_at (ISO 8601 UTC). Selects the 60 minutes before the incident
            opened. Ignored when start_time / end_time are given.
        start_time: Optional explicit ISO 8601 lower bound.
        end_time: Optional explicit ISO 8601 upper bound.
    """
    time_window: str | None = f"{PRE_INCIDENT_WINDOW_MINUTES} MINUTE"
    if not (start_time or end_time) and opened_at:
        start_time, end_time = pre_incident_window(opened_at)
        time_window = None
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
    "Call the analyze_machine_telemetry tool once for that machine, passing the board's opened_at value as opened_at "
    "so the tool queries the pre-incident window (the 60 minutes before the incident opened). "
    "Its result already carries the nominal line baseline, so do not "
    "query other windows. "
    "Compare the suspected machine's sensor readings against that baseline: calculate the "
    "percentage increase for vibration and motor current and note whether temperature is steady. "
    "Return a FindingDraft containing the percentage shifts, a confidence score that reflects how clear the deviation is "
    "(low when the window has no samples or the readings stay near baseline), "
    "and cite the table and window actually queried as your citation."
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
