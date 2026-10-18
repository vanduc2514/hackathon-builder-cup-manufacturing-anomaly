"""Quality Inspector Agent: conveyor SPC breach detection, defect classification narrative, and post-repair verification gatekeeper."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable

from google.adk import Agent

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.config import settings
from backend.core.models import (
    FindingDraft,
    QaFrameInspection,
    QualityInspectionReport,
    SpcEvaluationResult,
    StreakVerificationResult,
    VerificationResult,
    VisualEvidencePreset,
)
from backend.tools.gemini_vision_tool import analyze_visual_evidence_frame, guarded_part_inspection
from backend.tools.preset_catalog import list_presets, load_preset_image
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
MAX_VISION_FRAMES = 2
VERIFICATION_BATCH_PARTS = 10
MAX_VERIFICATION_PARTS_FACTOR = 3

INSTRUCTION = (
    "You are the Quality Inspector of the Kaizen Agent manufacturing incident team. "
    "The user message is JSON with two keys: 'board' (the current incident board) and "
    "'inspection' (the conveyor window you just measured). In 'inspection', 'spc' is the p-chart "
    "evaluation; 'defect_type_counts' is the SPC defect count taken from the incident trigger "
    "(not a part-by-part census, see 'defect_type_counts_basis'); 'defect_frames' are the few "
    "end-of-line camera images that were sampled and classified by the vision model, each with "
    "'preset_id', 'defect_class' (or 'is_defect' for visual frames), 'severity', 'region', 'confidence', "
    "'source' and a 'summary'; 'frame_class_counts' counts classes over those sampled frames only. "
    "If tools are available, you can call check_spc_control_limits or check_verification_streak. "
    "Write one finding that states the SPC breach and the defect type from 'defect_type_counts', "
    "and reports what the sampled frames show. "
    "The evidence must quote spc.defect_count of spc.sample_size products, spc.defect_rate versus "
    "spc.limits.ucl, and the number of sampled frames with their classes. Use ONLY numbers and "
    "facts present in 'inspection'; never invent measurements, bounding boxes or frame hashes. "
    "If 'defect_frames' is empty, say that no frame was classified. "
    "Set confidence to the mean 'confidence' of the frames that have one; if none has one, use 0.5. "
    "Build the citation as 'End-of-line camera frames ' followed by the preset_id values of "
    "'defect_frames' separated by ', ', then ' + SPC p-chart Nelson Rule 1'. "
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
    machine_id: str | None = None,
    tool_id: str | None = None,
    scenario: str | None = None,
) -> QualityInspectionReport:
    """Evaluates the SPC window against `spc_ucl` and classifies sample end-of-line camera frames.

    The defect rate is the SPC input from the trigger. Up to `MAX_VISION_FRAMES` catalog camera
    images are classified with Gemini Vision (guarded by the DEMO_SCRIPTED expected-result guard).
    """
    from backend.core.blackboard import blackboard

    state = blackboard.get_state()
    rate = (
        defect_rate
        if defect_rate is not None
        else (state.defect_rate if state.defect_rate > 0 else 0.12)
    )
    dtype = defect_type or state.defect_type or "scratch_vertical"
    machine = machine_id or state.suspect_machine or "CNC-02"
    tool = tool_id or state.suspect_tool or "T07"
    is_im = scenario == "im_damp_material" or machine.upper().startswith("IM")

    defect_count = round(rate * sample_size)
    spc = evaluate_defect_rate(defect_count, sample_size, ucl_override=spc_ucl)

    defect_frames: list[QaFrameInspection] = []
    if defect_count > 0:
        presets = _select_frame_presets(dtype, is_im)
        defect_frames = list(
            await asyncio.gather(
                *(asyncio.to_thread(_classify_frame, p, machine, tool, is_im) for p in presets)
            )
        )

    frame_class_counts: dict[str, int] = {}
    for frame in defect_frames:
        label = frame.defect_class or ("defect" if frame.is_defect else "none")
        frame_class_counts[label] = frame_class_counts.get(label, 0) + 1

    return QualityInspectionReport(
        spc=spc,
        defect_type_counts={dtype: defect_count} if defect_count > 0 else {},
        frame_class_counts=frame_class_counts,
        defect_frames=defect_frames,
    )


def _select_frame_presets(defect_type: str, is_im: bool) -> list[VisualEvidencePreset]:
    """Picks at most MAX_VISION_FRAMES catalog end-of-line camera images for the trigger."""
    if is_im:
        candidates = [p for p in list_presets("im05") if p.expected_defect_detected]
    else:
        every = list_presets("qa_defect")
        candidates = [p for p in every if p.expected_class == defect_type] or every
    return candidates[:MAX_VISION_FRAMES]


def _classify_frame(
    preset: VisualEvidencePreset, machine_id: str, tool_id: str, is_im: bool
) -> QaFrameInspection:
    """Classifies one catalog camera image (blocking Gemini call; run in a worker thread)."""
    common = {
        "preset_id": preset.id,
        "title": preset.title,
        "image_url": preset.image_url,
        "machine_id": machine_id,
        "tool_id": tool_id,
    }
    if not is_im:
        guarded = guarded_part_inspection(
            load_preset_image(preset),
            expected=preset.expected_class,
            machine_id=machine_id,
            tool_id=tool_id,
        )
        assert guarded.part is not None
        return QaFrameInspection(
            **common,
            kind="part",
            expected_class=preset.expected_class,
            defect_class=guarded.part.defect_class,
            severity=guarded.part.severity,
            region=guarded.part.region,
            confidence=guarded.part.confidence if guarded.source == "gemini" else None,
            is_defect=guarded.part.defect_class != "none",
            source=guarded.source,
            model=guarded.model,
            summary=guarded.summary,
        )

    expected = preset.expected_defect_detected
    if not preset.image_file:
        logger.warning("QA frame preset %s has no image_file", preset.id)
        detected, source = expected, "mock"
    else:
        payload = analyze_visual_evidence_frame(
            load_preset_image(preset),
            machine_id=machine_id,
            tool_id=tool_id,
            filename=preset.image_file.rsplit("/", 1)[-1],
        )
        source = payload.source or (
            "gemini" if payload.citation.startswith("Gemini Vision") else "mock"
        )
        detected = payload.defect_detected
        if source == "gemini" and settings.demo_scripted and detected != expected:
            detected, source = expected, "fallback"
    verdict = "defect detected" if detected else "no defect detected"
    return QaFrameInspection(
        **common,
        kind="visual",
        is_defect=detected,
        source=source,  # type: ignore[arg-type]
        model=settings.gemini_vision_model,
        summary=f"{machine_id} {tool_id}: {preset.title}: {verdict}.",
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
