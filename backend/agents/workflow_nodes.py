"""Incident workflow function nodes: record agent drafts on the Blackboard and route the graph."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from types import ModuleType
from typing import Any
from uuid import uuid4

from google.adk import Context, Event

from backend.agents import (
    agent_continuous_learning,
    agent_incident_scribe,
    agent_process_analyst,
    agent_quality_inspector,
    agent_root_cause,
    agent_technician_copilot,
    agent_traceability,
)
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    DefectInjectionRequest,
    FindingDraft,
    HandoverNote,
    IncidentState,
    QualityInspectionReport,
    RootCauseFindingDraft,
    ScribeDraft,
    VerificationResult,
    VisualEvidencePayload,
)

logger = logging.getLogger(__name__)

RCA_CONFIDENCE_THRESHOLD = 0.7
SECONDARY_CONFIDENCE_THRESHOLD = 0.85
MAX_EVIDENCE_ROUNDS = 2
MAX_REOPENS = 1
VERIFICATION_CITATION = "End-of-line Camera Station #1 inspection buffer"


def _record(agent: ModuleType, draft: FindingDraft, phase: str | None = None) -> None:
    """Writes an LLM draft from `agent` to the Blackboard (confidence clamped to [0, 1])."""
    blackboard.add_finding(
        AgentFinding(
            agent_id=agent.AGENT_ID,
            agent_name=agent.AGENT_NAME,
            phase=phase or agent.PHASE,
            finding=draft.finding,
            evidence=draft.evidence,
            confidence=min(1.0, max(0.0, draft.confidence)),
            citation=draft.citation,
            five_whys=getattr(draft, "five_whys", None),
            ishikawa=getattr(draft, "ishikawa", None),
        )
    )


def _record_verification(finding: str, evidence: str, confidence: float) -> None:
    """Writes a post-repair verification finding from the Quality Inspector gatekeeper."""
    blackboard.add_finding(
        AgentFinding(
            agent_id=agent_quality_inspector.AGENT_ID,
            agent_name=agent_quality_inspector.VERIFICATION_AGENT_NAME,
            phase=agent_quality_inspector.VERIFICATION_PHASE,
            finding=finding,
            evidence=evidence,
            confidence=confidence,
            citation=VERIFICATION_CITATION,
        )
    )


async def open_incident(ctx: Context, node_input: DefectInjectionRequest) -> IncidentState:
    """Initialises workflow state and opens a fresh incident on the Blackboard."""
    trigger_dict = node_input.model_dump()
    ctx.state["trigger"] = trigger_dict
    ctx.state["evidence_rounds"] = 0
    if trigger_dict.get("require_evidence"):
        ctx.state["require_evidence"] = True
    ctx.state["reopen_count"] = 0
    ctx.state["step_delay"] = ctx.state.get("step_delay", settings.simulation_step_delay)
    blackboard.reset()
    opened_at = datetime.now(timezone.utc).isoformat()
    blackboard.update_status(
        "detecting",
        incident_id=f"INC-{uuid4().hex[:6].upper()}",
        opened_at=opened_at,
        severity=node_input.severity,
        defect_type=node_input.defect_type,
        defect_rate=node_input.defect_rate,
        verification_count=0,
    )
    return blackboard.get_state()


async def inspect_production(ctx: Context, node_input: dict) -> Event:
    """Quality Inspector measures the conveyor window; only an upper SPC breach opens Phase A."""
    state = blackboard.get_state()
    trigger = ctx.state.get("trigger", {})
    rate = trigger.get("defect_rate")
    if rate is None:
        rate = state.defect_rate if state.defect_rate > 0 else 0.12
    dtype = trigger.get("defect_type") or state.defect_type or "scratch_vertical"

    report = await agent_quality_inspector.inspect_production_window(
        state.spc_ucl,
        defect_rate=rate,
        defect_type=dtype,
    )
    ctx.state["qi_report"] = report.model_dump()
    spc = report.spc
    if spc.breach_direction == "upper":
        return Event(
            route="BREACH",
            output={
                "board": blackboard.get_state().model_dump(),
                "inspection": report.model_dump(),
            },
        )
    return Event(
        route="NO_BREACH",
        output=(
            f"No SPC breach: defect rate {spc.defect_rate:.1%} within UCL {spc.limits.ucl:.1%} "
            f"over {spc.sample_size} parts"
        ),
    )


async def dismiss_incident(node_input: str) -> None:
    blackboard.update_status("dismissed", status_reason=node_input)
    logger.info("Incident %s dismissed: %s", blackboard.get_state().incident_id, node_input)


async def record_detection(ctx: Context, node_input: FindingDraft) -> IncidentState:
    _record(agent_quality_inspector, node_input)
    report = QualityInspectionReport.model_validate(ctx.state["qi_report"])
    counts = report.defect_type_counts
    blackboard.update_status(
        "tracing",
        defect_rate=report.spc.defect_rate,
        defect_type=max(counts, key=counts.get) if counts else blackboard.get_state().defect_type,
    )
    return blackboard.get_state()


async def trace_topology(ctx: Context, node_input: IncidentState | dict) -> dict:
    """Traceability Agent queries discrete topology and passes the evidence report to the reasoner."""
    qi_report_data = ctx.state.get("qi_report")
    product_ids = None
    if qi_report_data:
        frames = qi_report_data.get("defect_frames", [])
        product_ids = [f["product_id"] for f in frames if f.get("product_id")]

    trigger = ctx.state.get("trigger", {})
    time_window = trigger.get("time_window", "09:30-10:00")

    report = await agent_traceability.trace_line_topology(
        time_window=time_window,
        product_ids=product_ids,
    )
    ctx.state["traceability_report"] = report.model_dump()
    return {
        "board": blackboard.get_state().model_dump(),
        "traceability": report.model_dump(),
    }


async def record_traceability(ctx: Context, node_input: FindingDraft) -> IncidentState:
    _record(agent_traceability, node_input)
    report_data = ctx.state.get("traceability_report")
    if report_data and report_data.get("suspects"):
        top = report_data["suspects"][0]
        suspect_machine = top.get("machine_id")
        suspect_tool = top.get("tool_id")
    else:
        trigger = ctx.state.get("trigger", {})
        suspect_machine = trigger.get("machine_id", "CNC-02")
        suspect_tool = trigger.get("tool_id", "T07")
    blackboard.update_status(
        "investigating", suspect_machine=suspect_machine, suspect_tool=suspect_tool
    )
    return blackboard.get_state()


async def record_process_analysis(node_input: FindingDraft) -> IncidentState:
    _record(agent_process_analyst, node_input)
    blackboard.update_status("analyzing")
    return blackboard.get_state()


async def rca_gate(ctx: Context, node_input: RootCauseFindingDraft) -> Event:
    """Routes on root-cause confidence: repair, gather field evidence, or escalate."""
    _record(agent_root_cause, node_input)
    confidence = node_input.confidence
    rounds = ctx.state.get("evidence_rounds", 0)

    # Criterion 5: Secondary Convergence: Verifies that the re-evaluated hypothesis
    # converges with confidence >= 0.85 before proceeding to Phase C repair.
    threshold = SECONDARY_CONFIDENCE_THRESHOLD if rounds >= 1 else RCA_CONFIDENCE_THRESHOLD

    force_evidence = bool(ctx.state.get("require_evidence")) and rounds == 0

    if confidence >= threshold and not force_evidence:
        blackboard.update_status(
            "repairing", root_cause=node_input.finding, diagnostic_request=None
        )
        return Event(route="CONFIDENT", output=blackboard.get_state().model_dump())

    if rounds < MAX_EVIDENCE_ROUNDS:
        ctx.state["evidence_rounds"] = rounds + 1
        # Criterion 1: Low-Confidence Triggering: Halts linear progression and extracts
        # the missing evidence requirement (need).
        diag_req = node_input.diagnostic_request
        if not diag_req:
            state = blackboard.get_state()
            from backend.agents.agent_technician_copilot import (
                build_contextual_diagnostic_probe_vi,
            )

            diag_req = build_contextual_diagnostic_probe_vi(
                confidence=confidence,
                machine_id=state.suspect_machine or "CNC-02",
                tool_id=state.suspect_tool,
                defect_type=state.defect_type,
            )
        from backend.agents.orchestrator import orchestrator

        orchestrator.arm_evidence_wait()
        blackboard.update_status("awaiting_evidence", diagnostic_request=diag_req)
        return Event(route="NEED_EVIDENCE", output=blackboard.get_state().model_dump())

    blackboard.update_status(
        "escalated",
        status_reason=(
            f"Root cause confidence {confidence:.2f} still below {threshold:.2f} "
            f"after {MAX_EVIDENCE_ROUNDS} evidence rounds"
        ),
    )
    return Event(
        route="ESCALATE",
        output=(
            f"Root cause confidence {confidence:.2f} still below {threshold:.2f} "
            f"after {MAX_EVIDENCE_ROUNDS} evidence rounds"
        ),
    )


async def wait_for_evidence_node(ctx: Context, node_input: Any) -> dict:
    """Waits for frontline technician visual evidence up to timeout."""
    from backend.agents.orchestrator import orchestrator

    trigger = (
        ctx.state.get("trigger", {})
        if hasattr(ctx, "state") and hasattr(ctx.state, "get")
        else {}
    )
    mode = trigger.get("mode") if isinstance(trigger, dict) else None

    if mode == "fast" or settings.evidence_wait_seconds <= 0:
        timeout = 0.0
    else:
        timeout = float(settings.evidence_wait_seconds)

    await orchestrator.wait_for_evidence(timeout=timeout)
    return blackboard.get_state().model_dump()


async def record_field_evidence(node_input: FindingDraft) -> IncidentState:
    _record(agent_technician_copilot, node_input, phase=agent_technician_copilot.DIAGNOSTIC_PHASE)
    blackboard.update_status("analyzing", diagnostic_request=None)
    return blackboard.get_state()


async def record_resolution(node_input: dict) -> IncidentState:
    """Records the parallel copilot and scribe outputs in a fixed order."""
    copilot = FindingDraft.model_validate(node_input[agent_technician_copilot.agent.name])
    scribe = ScribeDraft.model_validate(node_input[agent_incident_scribe.agent.name])
    _record(agent_technician_copilot, copilot)
    _record(agent_incident_scribe, scribe)
    blackboard.set_repair_done(True)
    blackboard.update_status(
        "verifying",
        repair_done=True,
        documents={
            "work_order": scribe.work_order,
            "report_8d": scribe.report_8d,
            "sop_proposal": scribe.sop_proposal,
        },
    )
    return blackboard.get_state()


async def verify_repair(ctx: Context, node_input: dict) -> VerificationResult:
    """Records the Quality Inspector's post-repair tally on the Blackboard as it streams in."""
    result = VerificationResult(good_streak=0, defect_rate=blackboard.get_state().defect_rate)
    async for result in agent_quality_inspector.inspect_post_repair_products(
        blackboard.get_state().verification_target, ctx.state["step_delay"]
    ):
        blackboard.update_status("verifying", verification_count=result.good_streak)
    return result


async def verification_gate(ctx: Context, node_input: VerificationResult) -> Event:
    """Closes only on Blackboard product evidence (Key Invariant 3); else reopens or escalates."""
    state = blackboard.get_state()
    count, target = state.verification_count, state.verification_target
    if count >= target:
        _record_verification(
            f"Physical recovery verified: {count} consecutive defect-free products passed.",
            f"Defect rate dropped to {node_input.defect_rate:.1%}, "
            f"below SPC UCL {state.spc_ucl:.1%}.",
            confidence=0.99,
        )
        return Event(route="VERIFIED", output=node_input.model_dump())
    if ctx.state["reopen_count"] < MAX_REOPENS:
        ctx.state["reopen_count"] += 1
        _record_verification(
            "Defects persist after repair; reopening Phase B",
            f"Only {count}/{target} consecutive good parts; "
            f"defect rate {node_input.defect_rate:.1%}.",
            confidence=0.9,
        )
        return Event(route="NOT_VERIFIED", output=blackboard.get_state().model_dump())
    return Event(
        route="ESCALATE",
        output=f"Verification failed: {count}/{target} good parts after {MAX_REOPENS} reopen(s)",
    )


async def reopen_investigation(node_input: dict) -> IncidentState:
    blackboard.update_status("tracing", verification_count=0, root_cause=None)
    return blackboard.get_state()


async def close_incident(node_input: VerificationResult) -> IncidentState:
    blackboard.update_status("closed", defect_rate=node_input.defect_rate)
    return blackboard.get_state()


async def record_learning(node_input: FindingDraft) -> None:
    _record(agent_continuous_learning, node_input)
    state = blackboard.get_state()
    impact = agent_continuous_learning.calculate_impact_metrics(state)
    blackboard.update_status("closed", impact=impact)


async def escalate_incident(node_input: str) -> None:
    blackboard.update_status("escalated", status_reason=node_input)
    logger.warning("Incident %s escalated: %s", blackboard.get_state().incident_id, node_input)


def record_handover_note(author: str, note: str) -> HandoverNote:
    """Records a technician handover note on the Blackboard IncidentState."""
    handover = HandoverNote(
        author=author,
        note=note,
        created_at=datetime.now(timezone.utc),
    )
    blackboard.add_handover_note(handover)
    return handover


def record_field_evidence_payload(
    finding: AgentFinding,
    visual_evidence: VisualEvidencePayload | None = None,
) -> IncidentState:
    """Records technician diagnostic field evidence and optional visual payload on the Blackboard."""
    return blackboard.attach_field_evidence(finding, visual_evidence)
