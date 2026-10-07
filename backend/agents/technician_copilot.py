"""Technician Copilot: Multimodal Gemini Live interface (Vietnamese voice + camera) for diagnostics and repair guidance. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

from google.adk import Agent

from backend.core.models import FindingDraft

AGENT_ID = "COPILOT"
AGENT_NAME = "Technician Copilot"
PHASE = "Phase C - Resolution"
DIAGNOSTIC_PHASE = "Phase B - Field Evidence"

INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: the technician was guided in Vietnamese through cover removal, insert swap and runout calibration below 0.005 mm, citing CNC manual p.112. "
    "Use confidence 0.94 and citation 'Gemini Live API multimodal voice session (mock)'. Respond in English."
)

agent = Agent(
    name="technician_copilot",
    description="Guides the technician through the repair of the confirmed root cause.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)

DIAGNOSTIC_INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "The Root Cause Agent's confidence is below threshold, so you must collect field evidence "
    "from the technician at the machine. "
    "Write one finding based ONLY on this mock evidence: a close-up photo of insert T07 shows "
    "flank wear and a chipped cutting edge. "
    "Use confidence 0.9 and citation 'Technician close-up photo via Gemini Live (mock)'. "
    "Respond in English."
)

diagnostic_agent = Agent(
    name="technician_copilot_diagnostic",
    description="Collects field evidence from the technician when root cause confidence is low.",
    instruction=DIAGNOSTIC_INSTRUCTION,
    output_schema=FindingDraft,
)
