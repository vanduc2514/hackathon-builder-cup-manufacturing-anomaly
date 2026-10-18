"""Continuous Learning Agent: Converts expert videos into RAG procedures, indexes resolutions, and calculates sustainability impact cards."""

from __future__ import annotations

import logging

from google.adk import Agent
from google.genai import types

from backend.agents.tool_guards import (
    AGENT_MAX_OUTPUT_TOKENS,
    limit_tool_calls,
    return_argument_errors,
)
from backend.core.config import settings
from backend.core.models import FindingDraft, ImpactMetrics, IncidentState
from backend.tools.impact_calculator import calculate_sustainability_impact

logger = logging.getLogger(__name__)

AGENT_ID = "LEARN"
AGENT_NAME = "Continuous Learning"
PHASE = "Phase D - Learning"
DEFAULT_CITATION = "Vertex AI Search Vector Index + BigQuery Sustainability Accounting"


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


def compute_sustainability_impact(
    factory_type: str = "aluminum_cnc",
    earlier_detection_minutes: float | None = None,
    line_speed_parts_per_min: float | None = None,
    manual_diagnosis_minutes: float | None = None,
    ai_diagnosis_minutes: float | None = None,
) -> ImpactMetrics:
    """ADK Tool: Computes avoided scrap parts, downtime savings, energy conservation (kWh), and CO2 reductions."""
    return calculate_sustainability_impact(
        factory_type=factory_type,
        earlier_detection_minutes=earlier_detection_minutes,
        line_speed_parts_per_min=line_speed_parts_per_min,
        manual_diagnosis_minutes=manual_diagnosis_minutes,
        ai_diagnosis_minutes=ai_diagnosis_minutes,
    )


def calculate_impact_metrics(board_data: dict | IncidentState | None = None) -> ImpactMetrics:
    """Calculates auditable sustainability impact metrics using domain formulas."""
    suspect_machine = "CNC-02"
    defect_type = "scratch_vertical"

    if isinstance(board_data, IncidentState):
        suspect_machine = board_data.suspect_machine or suspect_machine
        defect_type = board_data.defect_type or defect_type
    elif isinstance(board_data, dict):
        suspect_machine = board_data.get("suspect_machine") or suspect_machine
        defect_type = board_data.get("defect_type") or defect_type

    is_im = (
        "IM" in suspect_machine.upper()
        or "SHORT" in defect_type.upper()
        or "DAMP" in defect_type.upper()
    )

    factory_type = "abs_injection_molding" if is_im else "aluminum_cnc"
    return calculate_sustainability_impact(factory_type=factory_type)


INSTRUCTION = (
    "You are the Continuous Learning Agent of the Kaizen Agent manufacturing incident team. "
    "Your objective is to turn resolved incidents into permanent institutional memory and quantify sustainability impact: "
    "1. Calculate the Sustainability Impact Card using the standard manufacturing formulas: "
    "avoided scrap pieces, preserved machine downtime minutes, conserved energy in kWh, and Scope 1 & 2 CO2e reductions in kg. "
    "If tools are available, you can call compute_sustainability_impact to compute precise impact metrics. "
    "2. Ingest the verified resolution into the Defect -> Cause -> Fix knowledge base library, capturing equipment ID, tool ID, "
    "5-Whys root cause, procedural repair steps, and preventive SOP updates. "
    "3. Support expert repair video walkthrough analysis by parsing sequential repair actions and tolerance checkpoints. "
    "The user message is the current incident board as JSON. "
    "Return a FindingDraft with: finding (one concise sentence summarizing avoided scrap, downtime, kWh, CO2, and knowledge entry), "
    "evidence (2-3 sentences providing exact metric breakdowns and environmental accounting), confidence 0.99, "
    "and citation 'Vertex AI Search Vector Index + BigQuery Sustainability Accounting'. Respond in English."
)

agent = Agent(
    name="continuous_learning",
    description="Indexes the verified resolution into institutional memory and reports sustainability impact.",
    instruction=INSTRUCTION,
    tools=[compute_sustainability_impact] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(compute_sustainability_impact),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
    generate_content_config=types.GenerateContentConfig(max_output_tokens=AGENT_MAX_OUTPUT_TOKENS),
)
