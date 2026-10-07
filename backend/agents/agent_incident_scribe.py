"""Incident Scribe: Compiles verified blackboard findings into 8D reports, work orders, and SOP update proposals. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

from google.adk import Agent

from backend.core.models import ScribeDraft

AGENT_ID = "DOC"
AGENT_NAME = "Incident Scribe"
PHASE = "Phase C - Documentation"

INSTRUCTION = (
    "You are the Incident Scribe of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: an 8D report for the incident, work order WO-8821 to replace the T07 insert and recalibrate the spindle offset, and an SOP-CNC-04 revision adding a piece-counter alarm at 1,900 parts. Fill work_order, report_8d and sop_proposal accordingly. "
    "Use confidence 0.95 and citation 'Firestore incident board state compiler'. Respond in English."
)

agent = Agent(
    name="incident_scribe",
    description="Drafts the 8D report, work order and SOP revision from the board.",
    instruction=INSTRUCTION,
    output_schema=ScribeDraft,
)
