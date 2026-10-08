"""Root Cause Agent: Synthesizes evidence with 5-Whys, Ishikawa fishbone, RAG lookup, and confidence scoring. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

from google.adk import Agent

from backend.core.models import FindingDraft

AGENT_ID = "RCA"
AGENT_NAME = "Root Cause Agent"
PHASE = "Phase B - Root Cause"

INSTRUCTION = (
    "You are the Root Cause Agent of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: insert T07 cut 2,400 parts against a 2,000 part rated life, and the tool-change SOP is calendar-based rather than usage-based. The finding must be the one-sentence root cause. "
    "If the board contains field evidence from the Technician Copilot, take it into account. "
    "Use confidence 0.87 and citation 'Vertex AI Search: CNC Manual p.112 + Maintenance Log T07 + 8D-2026-03-12'. Respond in English."
)

agent = Agent(
    name="root_cause",
    description="Synthesizes board evidence into a single root cause with a confidence score.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)
