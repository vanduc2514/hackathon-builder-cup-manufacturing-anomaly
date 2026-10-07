"""Quality Inspector Agent: Vision defect classification, SPC chart monitoring, and post-repair verification gatekeeper. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from google.adk import Agent

from backend.core.models import FindingDraft, VerificationResult

AGENT_ID = "QA"
AGENT_NAME = "Quality Inspector"
PHASE = "Phase A - Detection"
VERIFICATION_PHASE = "Phase C - Verification"
VERIFICATION_AGENT_NAME = "Quality Inspector (Gatekeeper)"

INSTRUCTION = (
    "You are the Quality Inspector of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: vertical scratch 2-3 mm on face A, 23 of 300 products defective (7.7% defect rate) exceeding the SPC UCL of 3.0% since 09:40. "
    "Use confidence 0.96 and citation 'Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology'. Respond in English."
)

agent = Agent(
    name="quality_inspector",
    description="Classifies the defect and SPC breach behind the incident the Orchestrator opened.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)


async def inspect_post_repair_products(
    target: int, step_delay: float
) -> AsyncIterator[VerificationResult]:
    """Simulates the post-repair conveyor; yields the running tally to the Orchestrator."""
    step = max(1, target // 5)
    for count in [*range(step, target, step), target]:
        yield VerificationResult(good_streak=count, defect_rate=0.004)
        await asyncio.sleep(step_delay)
