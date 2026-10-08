"""Root Cause Agent: Synthesizes evidence with 5-Whys, Ishikawa fishbone, RAG lookup, and confidence scoring."""

from __future__ import annotations

import logging
from typing import Any, Optional

from google.adk import Agent
from google.genai import types

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

DEFAULT_CITATION = "Vertex AI Search: CNC Manual p.112 + Maintenance Log T07 + 8D-2026-03-12"
DEFAULT_IM_CITATION = "Vertex AI Search: IM-05 Manual p.78 + Maintenance Log Dryer-03 + 8D-2026-02-14"

DIAGNOSTIC_REQUEST_TEXT = (
    "Độ tin cậy hiện dưới 70%. Đề nghị kỹ thuật viên chụp ảnh cận cảnh mũi dao T07 "
    "để xác nhận mòn lưỡi (flank wear) hay mẻ hạt dao (chipping)."
)


async def query_domain_knowledge(
    defect_symptom: Optional[str] = "scratch_vertical",
    suspect_asset: Optional[str] = "CNC-02",
    query: Optional[str] = None,
) -> RAGSearchResult:
    """ADK Tool: Queries domain manuals, maintenance logs, and past 8D reports via Vertex AI Search."""
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
        agent_id = getattr(f, "agent_id", None) or (f.get("agent_id") if isinstance(f, dict) else None)
        if agent_id == "COPILOT" and phase != "Phase C - Resolution":
            return True
    return False


INSTRUCTION = (
    "You are the Root Cause Agent of the Kaizen Agent manufacturing incident team. "
    "Your objective is to deduce the root cause of manufacturing defects using 5-Whys deductive reasoning, "
    "6M Ishikawa (fishbone) classification, and domain knowledge retrieved via RAG. "
    "The user message is the current incident board as JSON. "
    "Follow these steps: "
    "1. Read the incident board to extract the suspect_machine, suspect_tool, and findings from Quality Inspector, Traceability, and Process Analyst. "
    "2. If tools are available, call query_domain_knowledge with the defect_symptom and suspect_asset to retrieve OEM manuals, maintenance logs, and historical 8D reports. "
    "3. Construct a 5-Whys causal deduction chain stepping from the observed surface defect, to tool flank wear, to cutting life exceedance (2,400 cuts vs 2,000 limit), to calendar-based SOP-MNT-CNC-04, to lack of automated piece-counter interlock. "
    "4. Classify factors across the 6M Ishikawa dimensions (Machine, Method, Material, Man, Measurement, Milieu), highlighting Machine and Method as causal while documenting ruled-out factors (Material lot, Operator, Milieu). "
    "5. Check whether the board contains technician diagnostic field evidence (in findings with phase 'Phase B - Field Evidence' or from agent COPILOT). If field evidence is present, refine hypotheses and raise confidence to 0.90+. "
    "6. If evidence is conclusive (e.g. tool life exceedance confirmed in manual and log), set confidence to 0.87. If evidence is inconclusive or confidence is below 0.70, output a diagnostic_request asking the technician to inspect the tool edge. "
    "7. Return a RootCauseFindingDraft. Keep all text concise: one sentence for finding, 2-3 sentences for evidence synthesizing the 5-Whys and Ishikawa without repeating raw frame hashes, concise one-sentence entries for each of the five_whys and ishikawa dimensions, and the citation. Respond in English."
)


def _supports_tools() -> bool:
    if settings.ai_provider == "ollama" and ("2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()):
        return False
    return True


agent = Agent(
    name="root_cause",
    description="Synthesizes board evidence with 5-Whys, Ishikawa fishbone, and domain RAG into a root cause.",
    instruction=INSTRUCTION,
    tools=[query_domain_knowledge] if _supports_tools() else [],
    output_schema=RootCauseFindingDraft,
    generate_content_config=types.GenerateContentConfig(max_output_tokens=2048),
)
