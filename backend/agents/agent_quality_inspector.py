"""Quality Inspector Agent: conveyor SPC breach detection, defect classification narrative, and post-repair verification gatekeeper."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from collections.abc import AsyncIterator, Callable
from datetime import datetime, timezone

from google.adk import Agent

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.config import settings
from backend.core.models import (
    BoundingBox,
    FilteredFramePacket,
    FindingDraft,
    QualityInspectionReport,
    SpcEvaluationResult,
    StreakVerificationResult,
    VerificationResult,
)
from backend.tools.spc_calculator import (
    DEFAULT_BASELINE_P,
    DEFAULT_VERIFICATION_TARGET,
    StreakGatekeeper,
    evaluate_defect_rate,
)

logger = logging.getLogger(__name__)

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
    "' + SPC p-chart Nelson Rule 1'. "
    "You must return your final output strictly as a JSON object matching the FindingDraft schema with keys "
    "'finding', 'evidence', 'confidence', and 'citation'."
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
    # TKT-070 S11 — log which baseline source the inspector consumed so an
    # operator can spot when the warehouse was empty (hardcoded fallback)
    # vs when the per-machine distribution from competition_telemetry was
    # the active baseline. Wrapped in try/except so a BigQuery outage
    # never blocks the SPC evaluation itself.
    try:
        from backend.tools.bigquery_tool import query_competition_telemetry_distribution

        distribution = query_competition_telemetry_distribution()
        if distribution.get("sample_count", 0) > 0:
            logger.info("baseline source: competition_telemetry")
        else:
            logger.info("baseline source: hardcoded fallback")
    except Exception as exc:
        logger.info("baseline source: hardcoded fallback (%s)", exc)
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


async def inspect_production_window(
    spc_ucl: float,
    defect_rate: float | None = None,
    defect_type: str | None = None,
    sample_size: int = SPC_WINDOW_SIZE,
) -> QualityInspectionReport:
    """Evaluates the next SPC window of conveyor parts against `spc_ucl` and yields defect evidence."""
    from backend.core.blackboard import blackboard

    state = blackboard.get_state()
    rate = (
        defect_rate
        if defect_rate is not None
        else (state.defect_rate if state.defect_rate > 0 else 0.12)
    )
    dtype = defect_type or state.defect_type or "scratch_vertical"
    machine_id = state.suspect_machine or "CNC-02"
    tool_id = state.suspect_tool or "T07"

    defect_count = round(rate * sample_size)
    spc = evaluate_defect_rate(defect_count, sample_size, ucl_override=spc_ucl)

    defect_type_counts: dict[str, int] = {}
    if defect_count > 0:
        defect_type_counts[dtype] = defect_count

    defect_frames: list[FilteredFramePacket] = []
    num_frames = min(defect_count, MAX_DEFECT_FRAMES)
    for i in range(num_frames):
        product_id = f"PRD-20261015-{i + 1:05d}"
        frame_hash = hashlib.sha256(f"{product_id}-{dtype}-{i}".encode()).hexdigest()
        defect_frames.append(
            FilteredFramePacket(
                frame_hash=frame_hash,
                camera_id="CAM-EOL-01",
                product_id=product_id,
                machine_id=machine_id,
                tool_id=tool_id,
                lot_id="LOT-20261015-A",
                conveyor_timestamp=datetime.now(timezone.utc).isoformat(),
                classification="DEFECT",
                is_defect=True,
                defect_type=dtype,
                confidence=0.94,
                uncertainty=0.06,
                bounding_box=BoundingBox(ymin=0.25, xmin=0.35, ymax=0.65, xmax=0.75),
                filter_decision="FORWARD",
                diverter_actuated=True,
            )
        )

    return QualityInspectionReport(
        spc=spc,
        defect_type_counts=defect_type_counts,
        defect_frames=defect_frames,
    )


def _sample_is_defect() -> bool:
    """Default post-repair product evaluator (defect-free after completed repair)."""
    return False


async def inspect_post_repair_products(
    target: int,
    step_delay: float,
    sample_evaluator: Callable[[], bool] | None = None,
) -> AsyncIterator[VerificationResult]:
    """Counts consecutive PASS parts on the post-repair conveyor; yields the running tally.

    Stops once the streak reaches `target`, or after `target * MAX_VERIFICATION_PARTS_FACTOR`
    parts so persistent defects end verification unverified.
    """
    gatekeeper = StreakGatekeeper(target=target)
    outcomes: list[bool] = []
    evaluator = sample_evaluator or _sample_is_defect

    while True:
        batch = 0
        while batch < VERIFICATION_BATCH_PARTS:
            is_defect = evaluator()
            gatekeeper.record_sample(is_defect)
            outcomes.append(is_defect)
            batch += 1

        yield VerificationResult(
            good_streak=gatekeeper.current_streak,
            defect_rate=round(sum(outcomes) / len(outcomes), 6),
        )
        if gatekeeper.is_verified or len(outcomes) >= target * MAX_VERIFICATION_PARTS_FACTOR:
            return
        await asyncio.sleep(step_delay)
