"""Incident Scribe: Compiles verified blackboard findings into 8D reports, work orders, and SOP update proposals."""

from __future__ import annotations

import logging

from google.adk import Agent
from google.genai import types

from backend.core.config import settings
from backend.core.models import RAGSearchResult, ScribeDraft
from backend.tools.rag_search_tool import search_knowledge_base

logger = logging.getLogger(__name__)

AGENT_ID = "DOC"
AGENT_NAME = "Incident Scribe"
PHASE = "Phase C - Documentation"
DEFAULT_CITATION = "Firestore incident board state compiler + OEM Manuals & 8D Archive"
DEFAULT_IM_CITATION = "Firestore incident board state compiler + IM-05 Manual & 8D Archive"


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


async def query_8d_archive_and_sops(
    defect_symptom: str | None = None,
    suspect_asset: str | None = None,
    query: str | None = None,
) -> RAGSearchResult:
    """ADK Tool: Queries historical 8D reports, SOP procedures, and root-cause archives."""
    return await search_knowledge_base(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
    )


INSTRUCTION = (
    "You are the Incident Scribe of the Kaizen Agent manufacturing incident team. "
    "Your objective is to auto-draft the standard industrial documentation required for closed-loop incident governance: "
    "1. An 8D Incident Report covering all standard automotive/electronics sections (D1 Team, D2 Problem Description, "
    "D3 Containment, D4 Root Cause, D5 Corrective Actions, D6 Verification, D7 Preventive Actions, and D8 Congratulate Team). "
    "2. A formal Work Order for physical spare parts replacement and tolerance calibration (specifying equipment ID, required parts, torque specs, and runout limits). "
    "3. An SOP Revision Proposal updating preventive maintenance procedures (e.g. replacing calendar-based maintenance with automated piece-counter alarms at 1,900 parts or dewpoint interlocks). "
    "The user message is the current incident board as JSON. "
    "Read the board findings from Quality Inspector, Traceability, Process Analyst, Root Cause, and Technician Copilot. "
    "If tools are available, you can call query_8d_archive_and_sops to look up historical 8D corrective actions and preventive SOP standards. "
    "Mark all generated documents with pending_approval: 'shift_leader'. "
    "Return a ScribeDraft with: finding (one concise sentence), evidence (2-3 sentences summarizing D1-D8, work order, and SOP), "
    "confidence 0.95, citation 'Firestore incident board state compiler + OEM Manuals & 8D Archive', "
    "and work_order, report_8d, sop_proposal as detailed structured documents. Respond in English."
)

agent = Agent(
    name="incident_scribe",
    description="Drafts the 8D report, work order, and SOP revision proposal from the board.",
    instruction=INSTRUCTION,
    tools=[query_8d_archive_and_sops] if _supports_tools() else [],
    output_schema=ScribeDraft,
    generate_content_config=types.GenerateContentConfig(max_output_tokens=2048),
)
