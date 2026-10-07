"""Traceability Agent: Queries discrete line topology and outputs a ranked suspect list. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

from google.adk import Agent

from backend.core.models import FindingDraft

AGENT_ID = "TRA"
AGENT_NAME = "Traceability Agent"
PHASE = "Phase B - Tracing"

INSTRUCTION = (
    "You are the Traceability Agent of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: 100% of defective parts were routed through CNC-02 with cutting tool T07. CNC-01 and CNC-03 used blank lot AL-5083-B4 with 0 defects, so raw material is excluded. "
    "Use confidence 0.95 and citation 'BigQuery traceability_discrete_events cross-lot correlation'. Respond in English."
)

agent = Agent(
    name="traceability",
    description="Isolates the suspect machine and tool from discrete line traceability.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)
