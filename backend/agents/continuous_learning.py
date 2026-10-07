"""Continuous Learning Agent: Converts expert videos into RAG procedures and calculates sustainability impact cards. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

from google.adk import Agent

from backend.core.models import FindingDraft

AGENT_ID = "LEARN"
AGENT_NAME = "Continuous Learning"
PHASE = "Phase D - Learning"

INSTRUCTION = (
    "You are the Continuous Learning of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: the resolution was indexed into the defect-cause-fix library. Impact: 240 scrap parts avoided, 45 min downtime saved, 38 kWh and 25 kg CO2 reduced. "
    "Use confidence 0.99 and citation 'Vertex AI Search Vector Index + BigQuery Sustainability Accounting'. Respond in English."
)

agent = Agent(
    name="continuous_learning",
    description="Indexes the verified resolution and reports the sustainability impact.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)
