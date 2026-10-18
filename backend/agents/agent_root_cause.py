"""Root Cause Agent: Synthesizes evidence with 5-Whys, Ishikawa fishbone, RAG lookup, and confidence scoring."""

from __future__ import annotations

import logging
from typing import Any, Optional

from google.adk import Agent
from google.genai import types

from backend.agents.tool_guards import (
    AGENT_MAX_OUTPUT_TOKENS,
    limit_tool_calls,
    return_argument_errors,
)
from backend.core.config import settings
from backend.core.models import (
    RAGSearchResult,
    RootCauseFindingDraft,
)
from backend.tools.rag_search_tool import search_knowledge_base

logger = logging.getLogger(__name__)

AGENT_ID = "RCA"
AGENT_NAME = "Root Cause Agent"
PHASE = "Phase B - Root Cause"


async def query_domain_knowledge(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
) -> RAGSearchResult:
    """ADK Tool: Queries domain manuals, maintenance logs, and past 8D reports via Vertex AI Search.

    Args:
        defect_symptom: The board defect_type (required).
        suspect_asset: The board suspect_machine (required).
        query: Optional free-text refinement.
    """
    return await search_knowledge_base(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
    )


def has_field_evidence(findings: list[Any]) -> bool:
    """Detects whether technician diagnostic field evidence has been recorded on the Blackboard."""
    for f in findings:
        phase = getattr(f, "phase", None) or (f.get("phase") if isinstance(f, dict) else None)
        if phase == "Phase B - Field Evidence":
            return True
        agent_id = getattr(f, "agent_id", None) or (
            f.get("agent_id") if isinstance(f, dict) else None
        )
        if agent_id == "COPILOT" and phase != "Phase C - Resolution":
            return True
    return False


INSTRUCTION = (
    "You are the Root Cause Agent of the Kaizen Agent manufacturing incident team. "
    "Your objective is to deduce the root cause of manufacturing defects using 5-Whys deductive reasoning, "
    "6M Ishikawa (fishbone) classification, and domain knowledge retrieved via RAG. "
    "The user message is the current incident board as JSON. "
    "Follow these steps: "
    "1. Read the incident board to extract the defect_type, suspect_machine, suspect_tool, and the findings from Quality Inspector, Traceability, and Process Analyst. "
    "2. If tools are available, call query_domain_knowledge with the board's defect_type as defect_symptom and the board's suspect_machine as suspect_asset to retrieve OEM manuals, maintenance logs, and historical 8D reports. "
    "3. Construct a 5-Whys causal deduction chain from the observed defect down to the underlying process or systemic cause. Every link MUST be grounded in a board finding or a retrieved document; quote numbers (cycle counts, limits, procedure IDs, page numbers) only if they appear in those sources. "
    "4. Classify factors across the 6M Ishikawa dimensions (Machine, Method, Material, Man, Measurement, Milieu), marking as causal only the dimensions the evidence supports and documenting the ruled-out factors the Traceability and Process Analyst findings exclude. "
    "5. Check whether the board contains technician diagnostic field evidence (in findings with phase 'Phase B - Field Evidence' or from agent COPILOT). If field evidence is present, refine the hypotheses with it and raise confidence accordingly. "
    "6. Set confidence to reflect the strength of the evidence: higher when the retrieved documents and board findings corroborate each other, lower when they conflict or are missing. If evidence is inconclusive or confidence is below 0.70, output a diagnostic_request asking the technician for the specific physical inspection that would discriminate between the remaining hypotheses. "
    "7. Return a RootCauseFindingDraft. Keep all text concise: one sentence for finding, 2-3 sentences for evidence synthesizing the 5-Whys and Ishikawa without repeating raw frame hashes, concise one-sentence entries for each of the five_whys and ishikawa dimensions, and the citation naming the documents actually retrieved. Respond in English."
)


def _supports_tools() -> bool:
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


agent = Agent(
    name="root_cause",
    description="Synthesizes board evidence with 5-Whys, Ishikawa fishbone, and domain RAG into a root cause.",
    instruction=INSTRUCTION,
    tools=[query_domain_knowledge] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(query_domain_knowledge),
    on_tool_error_callback=return_argument_errors,
    output_schema=RootCauseFindingDraft,
    generate_content_config=types.GenerateContentConfig(max_output_tokens=AGENT_MAX_OUTPUT_TOKENS),
)
