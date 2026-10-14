"""Quality Inspector Agent: conveyor SPC breach detection, defect classification narrative, and post-repair verification gatekeeper."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from google.adk import Agent

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.config import settings
from backend.core.models import (
    FilteredFramePacket,
    FindingDraft,
    QualityInspectionReport,
    SpcEvaluationResult,
    StreakVerificationResult,
    VerificationResult,
)
from backend.edge.gateway.edge_filter import EdgeInspectionStation
from backend.tools.spc_calculator import (
    DEFAULT_BASELINE_P,
    DEFAULT_VERIFICATION_TARGET,
    StreakGatekeeper,
    evaluate_defect_rate,
)
from simulator.injection_engine import injection_engine

AGENT_ID = "QA"
AGENT_NAME = "Quality Inspector"
PHASE = "Phase A - Detection"
VERIFICATION_PHASE = "Phase C - Verification"
VERIFICATION_AGENT_NAME = "Quality Inspector (Gatekeeper)"

SPC_WINDOW_SIZE = 300
MAX_DEFECT_FRAMES = 5
VERIFICATION_BATCH_PARTS = 10
MAX_VERIFICATION_PARTS_FACTOR = 3

INSTRUCTION = (
    "You are the Quality Inspector of the Kaizen Agent manufacturing incident team. "
    "The user message is JSON with two keys: 'board' (the current incident board) and "
    "'inspection' (the conveyor window you just measured: 'spc' is the p-chart evaluation, "
    "'defect_type_counts' counts edge-classified defects by type, 'defect_frames' are the "
    "Gemma Edge packets of the first defective parts). "
    "If tools are available, you can call check_spc_control_limits or check_verification_streak. "
    "Write one finding that classifies the dominant defect (the type with the highest count in "
    "'defect_type_counts', located by 'defect_frames[].bounding_box') and states the SPC breach. "
    "The evidence must quote spc.defect_count of spc.sample_size products, spc.defect_rate versus "
    "spc.limits.ucl, and the dominant defect type count. Use ONLY numbers present in "
    "'inspection'; never invent measurements. "
    "Set confidence to the mean 'confidence' of 'defect_frames'. "
    "Build the citation as the words 'Gemma Edge frames ', then the first 8 characters of "
    "defect_frames[0].frame_hash and of defect_frames[1].frame_hash separated by ', ', then "
    "' + SPC p-chart Nelson Rule 1'. Respond in English."
)


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


def check_spc_control_limits(
    defect_count: int,
    sample_size: int,
    baseline_p: float = DEFAULT_BASELINE_P,
    ucl_override: float | None = None,
) -> SpcEvaluationResult:
    """ADK Tool: Calculates Shewhart p-chart control limits and evaluates defect rate for SPC breach."""
    return evaluate_defect_rate(
        defect_count=defect_count,
        sample_size=sample_size,
        baseline_p=baseline_p,
        ucl_override=ucl_override,
    )


def check_verification_streak(
    good_streak: int,
    target: int = DEFAULT_VERIFICATION_TARGET,
) -> StreakVerificationResult:
    """ADK Tool: Evaluates whether consecutive defect-free parts have reached the verification target."""
    verified = good_streak >= target
    remaining = max(0, target - good_streak)
    return StreakVerificationResult(
        good_streak=good_streak,
        target=target,
        verified=verified,
        last_was_defect=False,
        recurrence_detected=False,
        message=(
            f"Physical recovery verified: {good_streak}/{target} consecutive defect-free parts."
            if verified
            else f"Verification in progress: {good_streak}/{target} consecutive defect-free parts ({remaining} remaining)."
        ),
    )


agent = Agent(
    name="quality_inspector",
    description="Classifies the defect and SPC breach from the measured conveyor window.",
    instruction=INSTRUCTION,
    tools=[check_spc_control_limits, check_verification_streak] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(check_spc_control_limits, check_verification_streak),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
)


async def inspect_production_window(spc_ucl: float) -> QualityInspectionReport:
    """Edge-classifies the next SPC window of conveyor parts and evaluates it against `spc_ucl`."""
    station = EdgeInspectionStation()
    inspected = 0
    defect_count = 0
    defect_type_counts: dict[str, int] = {}
    defect_frames: list[FilteredFramePacket] = []
    while inspected < SPC_WINDOW_SIZE:
        for part in injection_engine.conveyor_sim.tick():
            if inspected == SPC_WINDOW_SIZE:
                break
            classification, packet = station.inspect(part)
            inspected += 1
            if not classification.is_defect:
                continue
            defect_count += 1
            defect_type = classification.defect_type or "unknown"
            defect_type_counts[defect_type] = defect_type_counts.get(defect_type, 0) + 1
            if len(defect_frames) < MAX_DEFECT_FRAMES:
                defect_frames.append(packet)
    return QualityInspectionReport(
        spc=evaluate_defect_rate(defect_count, SPC_WINDOW_SIZE, ucl_override=spc_ucl),
        defect_type_counts=defect_type_counts,
        defect_frames=defect_frames,
    )


async def inspect_post_repair_products(
    target: int, step_delay: float
) -> AsyncIterator[VerificationResult]:
    """Counts consecutive PASS parts on the post-repair conveyor; yields the running tally.

    Stops once the streak reaches `target`, or after `target * MAX_VERIFICATION_PARTS_FACTOR`
    parts so persistent defects end verification unverified.
    """
    gatekeeper = StreakGatekeeper(target=target)
    station = EdgeInspectionStation()
    outcomes: list[bool] = []
    while True:
        batch = 0
        while batch < VERIFICATION_BATCH_PARTS:
            for part in injection_engine.conveyor_sim.tick():
                classification, _ = station.inspect(part)
                gatekeeper.record_sample(classification.is_defect)
                outcomes.append(classification.is_defect)
                batch += 1
        yield VerificationResult(
            good_streak=gatekeeper.current_streak,
            defect_rate=round(sum(outcomes) / len(outcomes), 6),
        )
        if gatekeeper.is_verified or len(outcomes) >= target * MAX_VERIFICATION_PARTS_FACTOR:
            return
        await asyncio.sleep(step_delay)
