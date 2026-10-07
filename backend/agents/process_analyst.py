"""Process Analyst Agent: Extracts continuous sensor telemetry for suspect machines and analyzes time-window deviations. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

from google.adk import Agent

from backend.core.models import FindingDraft

AGENT_ID = "PA"
AGENT_NAME = "Process Analyst Agent"
PHASE = "Phase B - Sensor Analysis"

INSTRUCTION = (
    "You are the Process Analyst Agent of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: spindle vibration rose 35% and motor current rose 12% from 09:30, 10 minutes before the defect spike. Bearing temperature is normal at 42°C. "
    "Use confidence 0.89 and citation 'BigQuery machine_telemetry_5s 09:00-10:00'. Respond in English."
)

agent = Agent(
    name="process_analyst",
    description="Analyzes suspect machine telemetry for deviations preceding the defects.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)
