"""Quality Inspector Agent: Vision defect classification, SPC chart monitoring, and post-repair verification gatekeeper. (placeholder: no tools, canned mock evidence)"""

from __future__ import annotations

import asyncio

from google.adk import Agent

from backend.core.blackboard import blackboard
from backend.core.models import FindingDraft, VerificationResult

AGENT_ID = "QA"
AGENT_NAME = "Quality Inspector"
PHASE = "Phase A - Detection"
VERIFICATION_PHASE = "Phase C - Verification"
VERIFICATION_AGENT_NAME = "Quality Inspector (Gatekeeper)"
INJECTED_DEFECT_RATE = 0.077

INSTRUCTION = (
    "You are the Quality Inspector of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: vertical scratch 2-3 mm on face A, 23 of 300 products defective (7.7% defect rate) exceeding the SPC UCL of 3.0% since 09:40. "
    "Use confidence 0.96 and citation 'Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology'. Respond in English."
)

agent = Agent(
    name="quality_inspector",
    description="Detects the SPC breach on the camera station and opens the incident.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)


async def run_post_repair_verification(step_delay: float) -> VerificationResult:
    """Simulates the end-of-line conveyor streaming defect-free parts after the repair."""
    target = blackboard.get_state().verification_target
    step = max(1, target // 5)
    for count in range(step, target + 1, step):
        blackboard.update_status("verifying", verification_count=count)
        await asyncio.sleep(step_delay)
    return VerificationResult(good_streak=target, defect_rate=0.004)
