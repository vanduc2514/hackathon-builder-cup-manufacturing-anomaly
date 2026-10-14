"""Traceability Agent: queries discrete line topology, performs cross-cohort elimination, and isolates suspects."""

from __future__ import annotations

import asyncio
import logging

from google.adk import Agent

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.config import settings
from backend.core.models import (
    FindingDraft,
    TraceabilityTopologyResponse,
)
from backend.tools.bigquery_tool import query_traceability_topology

logger = logging.getLogger(__name__)

AGENT_ID = "TRA"
AGENT_NAME = "Traceability Agent"
PHASE = "Phase B - Tracing"
CITATION = "BigQuery manufacturing.traceability cross-lot correlation"

INSTRUCTION = (
    "You are the Traceability Agent of the Kaizen Agent manufacturing incident team. "
    "The user message is JSON with two keys: 'board' (the current incident board) and "
    "'traceability' (the discrete line topology report from BigQuery: 'suspects', 'excluded_factors', "
    "'factor_distributions'). "
    "If tools are available, you can call trace_line_topology to query discrete line topology. "
    "Write one finding that isolates the primary suspect machine (machine_id) and tool (tool_id) "
    "from 'traceability.suspects' (the pair with the highest correlation_score and defect_count) "
    "and specifies the excluded non-causal factors from 'traceability.excluded_factors' "
    "(such as raw material lots or operators ruled out across normal concurrent machines). "
    "The evidence must quote the suspect machine, tool, defect count, total parts, and the ruled-out factors. "
    "Set confidence to the top suspect's correlation_score (or 0.95 if correlation_score >= 0.7). "
    "Build the citation as 'BigQuery manufacturing.traceability cross-lot correlation'. Respond in English."
)


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


async def trace_line_topology(
    time_window: str | None = "09:30-10:00",
    start_time: str | None = None,
    end_time: str | None = None,
    product_ids: list[str] | None = None,
) -> TraceabilityTopologyResponse:
    """ADK Tool: Queries discrete manufacturing topology and factor distributions directly from BigQuery."""
    return await asyncio.to_thread(
        query_traceability_topology,
        time_window=time_window,
        start_time=start_time,
        end_time=end_time,
        product_ids=product_ids,
    )


agent = Agent(
    name="traceability",
    description="Isolates the suspect machine and tool from discrete line topology while excluding innocent factors.",
    instruction=INSTRUCTION,
    tools=[trace_line_topology] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(trace_line_topology),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
)
