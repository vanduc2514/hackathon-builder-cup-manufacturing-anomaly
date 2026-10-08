"""Incident workflow function nodes: record agent drafts on the Blackboard and route the graph."""

from __future__ import annotations

import logging
from types import ModuleType
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
    ImpactMetrics,
    IncidentState,
    ScribeDraft,
    VerificationResult,
)

logger = logging.getLogger(__name__)

RCA_CONFIDENCE_THRESHOLD = 0.7
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
    ctx.state["trigger"] = node_input.model_dump()
    ctx.state["evidence_rounds"] = 0
    ctx.state["reopen_count"] = 0
    ctx.state["step_delay"] = ctx.state.get("step_delay", settings.simulation_step_delay)
    blackboard.reset()
    blackboard.update_status(
        "detecting",
        incident_id=f"INC-{uuid4().hex[:6].upper()}",
        defect_type=node_input.defect_type,
        defect_rate=node_input.defect_rate,
        verification_count=0,
    )
    return blackboard.get_state()


async def record_detection(node_input: FindingDraft) -> IncidentState:
    _record(agent_quality_inspector, node_input)
    blackboard.update_status("tracing")
    return blackboard.get_state()


async def record_traceability(ctx: Context, node_input: FindingDraft) -> IncidentState:
    _record(agent_traceability, node_input)
    trigger = ctx.state["trigger"]
    blackboard.update_status(
        "investigating", suspect_machine=trigger["machine_id"], suspect_tool=trigger["tool_id"]
    )
    return blackboard.get_state()


async def record_process_analysis(node_input: FindingDraft) -> IncidentState:
    _record(agent_process_analyst, node_input)
    blackboard.update_status("analyzing")
    return blackboard.get_state()


async def rca_gate(ctx: Context, node_input: FindingDraft) -> Event:
    """Routes on root-cause confidence: repair, gather field evidence, or escalate."""
    _record(agent_root_cause, node_input)
    confidence = node_input.confidence
    if confidence >= RCA_CONFIDENCE_THRESHOLD:
        blackboard.update_status("repairing", root_cause=node_input.finding)
        return Event(route="CONFIDENT", output=blackboard.get_state().model_dump())
    if ctx.state["evidence_rounds"] < MAX_EVIDENCE_ROUNDS:
        ctx.state["evidence_rounds"] += 1
        blackboard.update_status("awaiting_evidence")
        return Event(route="NEED_EVIDENCE", output=blackboard.get_state().model_dump())
    return Event(
        route="ESCALATE",
        output=(
            f"Root cause confidence {confidence:.2f} still below {RCA_CONFIDENCE_THRESHOLD} "
            f"after {MAX_EVIDENCE_ROUNDS} evidence rounds"
        ),
    )


async def record_field_evidence(node_input: FindingDraft) -> IncidentState:
    _record(agent_technician_copilot, node_input, phase=agent_technician_copilot.DIAGNOSTIC_PHASE)
    blackboard.update_status("analyzing")
    return blackboard.get_state()


async def record_resolution(node_input: dict) -> IncidentState:
    """Records the parallel copilot and scribe outputs in a fixed order."""
    copilot = FindingDraft.model_validate(node_input[agent_technician_copilot.agent.name])
    scribe = ScribeDraft.model_validate(node_input[agent_incident_scribe.agent.name])
    _record(agent_technician_copilot, copilot)
    _record(agent_incident_scribe, scribe)
    blackboard.update_status(
        "verifying",
        documents={
            "work_order": scribe.work_order,
            "report_8d": scribe.report_8d,
            "sop_proposal": scribe.sop_proposal,
        },
        repair_done=True,
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
    # Placeholder: default impact numbers until the impact calculator is wired in.
    blackboard.update_status("closed", impact=ImpactMetrics())


async def escalate_incident(node_input: str) -> None:
    blackboard.update_status("escalated", status_reason=node_input)
    logger.warning("Incident %s escalated: %s", blackboard.get_state().incident_id, node_input)
