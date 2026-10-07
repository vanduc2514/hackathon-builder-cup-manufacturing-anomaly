"""Orchestrator Agent (ADK Workflow): drives the incident lifecycle graph and writes every transition to the Blackboard."""

from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from google.adk import Context, Event, Workflow
from google.adk.runners import InMemoryRunner
from google.adk.workflow import JoinNode
from google.genai import types

from backend.agents import (
    continuous_learning,
    incident_scribe,
    process_analyst,
    quality_inspector,
    root_cause,
    technician_copilot,
    traceability,
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
APP_NAME = "kaizen_orchestrator"
WORKFLOW_NAME = "kaizen_incident"


def _record(agent_id: str, agent_name: str, phase: str, draft: FindingDraft) -> None:
    """Writes an LLM draft to the Blackboard as an AgentFinding (confidence clamped to [0, 1])."""
    blackboard.add_finding(
        AgentFinding(
            agent_id=agent_id,
            agent_name=agent_name,
            phase=phase,
            finding=draft.finding,
            evidence=draft.evidence,
            confidence=min(1.0, max(0.0, draft.confidence)),
            citation=draft.citation,
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
        defect_rate=quality_inspector.INJECTED_DEFECT_RATE,
        verification_count=0,
    )
    return blackboard.get_state()


async def record_detection(node_input: FindingDraft) -> IncidentState:
    _record(
        quality_inspector.AGENT_ID,
        quality_inspector.AGENT_NAME,
        quality_inspector.PHASE,
        node_input,
    )
    blackboard.update_status("tracing")
    return blackboard.get_state()


async def record_traceability(ctx: Context, node_input: FindingDraft) -> IncidentState:
    _record(traceability.AGENT_ID, traceability.AGENT_NAME, traceability.PHASE, node_input)
    trigger = ctx.state["trigger"]
    blackboard.update_status(
        "investigating", suspect_machine=trigger["machine_id"], suspect_tool=trigger["tool_id"]
    )
    return blackboard.get_state()


async def record_process_analysis(node_input: FindingDraft) -> IncidentState:
    _record(process_analyst.AGENT_ID, process_analyst.AGENT_NAME, process_analyst.PHASE, node_input)
    blackboard.update_status("analyzing")
    return blackboard.get_state()


async def rca_gate(ctx: Context, node_input: FindingDraft) -> Event:
    """Routes on root-cause confidence: repair, gather field evidence, or escalate."""
    _record(root_cause.AGENT_ID, root_cause.AGENT_NAME, root_cause.PHASE, node_input)
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
    _record(
        technician_copilot.AGENT_ID,
        technician_copilot.AGENT_NAME,
        technician_copilot.DIAGNOSTIC_PHASE,
        node_input,
    )
    blackboard.update_status("analyzing")
    return blackboard.get_state()


async def record_resolution(node_input: dict) -> IncidentState:
    """Records the parallel copilot and scribe outputs in a fixed order."""
    copilot = FindingDraft.model_validate(node_input[technician_copilot.agent.name])
    scribe = ScribeDraft.model_validate(node_input[incident_scribe.agent.name])
    _record(
        technician_copilot.AGENT_ID,
        technician_copilot.AGENT_NAME,
        technician_copilot.PHASE,
        copilot,
    )
    _record(incident_scribe.AGENT_ID, incident_scribe.AGENT_NAME, incident_scribe.PHASE, scribe)
    blackboard.update_status(
        "verifying",
        documents={
            "work_order": scribe.work_order,
            "report_8d": scribe.report_8d,
            "sop_proposal": scribe.sop_proposal,
        },
    )
    return blackboard.get_state()


async def verify_repair(ctx: Context, node_input: dict) -> VerificationResult:
    return await quality_inspector.run_post_repair_verification(ctx.state["step_delay"])


async def verification_gate(ctx: Context, node_input: VerificationResult) -> Event:
    """Closes only on Blackboard product evidence (Key Invariant 3); else reopens or escalates."""
    state = blackboard.get_state()
    count, target = state.verification_count, state.verification_target
    if count >= target:
        blackboard.add_finding(
            AgentFinding(
                agent_id=quality_inspector.AGENT_ID,
                agent_name=quality_inspector.VERIFICATION_AGENT_NAME,
                phase=quality_inspector.VERIFICATION_PHASE,
                finding=(
                    f"Physical recovery verified: {count} consecutive defect-free products passed."
                ),
                evidence=(
                    f"Defect rate dropped to {node_input.defect_rate:.1%}, "
                    f"below SPC UCL {state.spc_ucl:.1%}."
                ),
                confidence=0.99,
                citation="End-of-line Camera Station #1 inspection buffer",
            )
        )
        return Event(route="VERIFIED", output=node_input.model_dump())
    if ctx.state["reopen_count"] < MAX_REOPENS:
        ctx.state["reopen_count"] += 1
        blackboard.add_finding(
            AgentFinding(
                agent_id=quality_inspector.AGENT_ID,
                agent_name=quality_inspector.VERIFICATION_AGENT_NAME,
                phase=quality_inspector.VERIFICATION_PHASE,
                finding="Defects persist after repair; reopening Phase B",
                evidence=(
                    f"Only {count}/{target} consecutive good parts; "
                    f"defect rate {node_input.defect_rate:.1%}."
                ),
                confidence=0.9,
                citation="End-of-line Camera Station #1 inspection buffer",
            )
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
    _record(
        continuous_learning.AGENT_ID,
        continuous_learning.AGENT_NAME,
        continuous_learning.PHASE,
        node_input,
    )
    # Placeholder: default impact numbers until the impact calculator is wired in.
    blackboard.update_status("closed", impact=ImpactMetrics())


async def escalate_incident(node_input: str) -> None:
    blackboard.update_status("escalated", status_reason=node_input)
    logger.warning("Incident %s escalated: %s", blackboard.get_state().incident_id, node_input)


resolution_join = JoinNode(name="resolution_join")

incident_workflow = Workflow(
    name=WORKFLOW_NAME,
    edges=[
        (
            "START",
            open_incident,
            quality_inspector.agent,
            record_detection,
            traceability.agent,
            record_traceability,
            process_analyst.agent,
            record_process_analysis,
            root_cause.agent,
            rca_gate,
        ),
        (
            rca_gate,
            {
                "CONFIDENT": (technician_copilot.agent, incident_scribe.agent),
                "NEED_EVIDENCE": technician_copilot.diagnostic_agent,
                "ESCALATE": escalate_incident,
            },
        ),
        (technician_copilot.diagnostic_agent, record_field_evidence, root_cause.agent),
        (
            (technician_copilot.agent, incident_scribe.agent),
            resolution_join,
            record_resolution,
            verify_repair,
            verification_gate,
        ),
        (
            verification_gate,
            {
                "VERIFIED": close_incident,
                "NOT_VERIFIED": reopen_investigation,
                "ESCALATE": escalate_incident,
            },
        ),
        (reopen_investigation, traceability.agent),
        (close_incident, continuous_learning.agent, record_learning),
    ],
)


class Orchestrator:
    """Runs one incident workflow at a time in the background and supports cancellation."""

    def __init__(self, step_delay: float | None = None) -> None:
        self._step_delay = step_delay
        self._task: asyncio.Task | None = None
        self._abort: asyncio.Event | None = None

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start_incident(self, trigger: DefectInjectionRequest) -> bool:
        """Starts the workflow in the background; returns False if one is already running."""
        if self.is_running:
            return False
        self._abort = asyncio.Event()
        self._task = asyncio.create_task(self.run_incident(trigger, self._abort))
        return True

    async def run_incident(
        self, trigger: DefectInjectionRequest, abort: asyncio.Event | None = None
    ) -> IncidentState:
        """Runs the incident workflow to completion; failures land on the Blackboard as `error`."""
        runner = InMemoryRunner(node=incident_workflow, app_name=APP_NAME)
        try:
            session_kwargs = {}
            if self._step_delay is not None:
                session_kwargs["state"] = {"step_delay": self._step_delay}
            session = await runner.session_service.create_session(
                app_name=APP_NAME, user_id="orchestrator", **session_kwargs
            )
            logger.info("incident workflow started: %s", trigger.model_dump_json())
            async for _ in runner.run_async(
                user_id="orchestrator",
                session_id=session.id,
                new_message=types.Content(
                    role="user", parts=[types.Part(text=trigger.model_dump_json())]
                ),
                abort_signal=abort,
            ):
                pass
            logger.info("incident workflow finished: status=%s", blackboard.get_state().status)
        except Exception as exc:
            logger.exception("incident workflow failed")
            blackboard.update_status("error", status_reason=f"{type(exc).__name__}: {exc}")
        return blackboard.get_state()

    async def cancel(self) -> None:
        """Aborts the running workflow (ADK abort_signal) and waits for it to stop."""
        try:
            if self.is_running:
                self._abort.set()
                await self._task
        finally:
            self._task = None
            self._abort = None


orchestrator = Orchestrator()
