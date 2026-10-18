"""Orchestrator Agent (ADK Workflow): wires the incident lifecycle graph and runs it per incident."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any, Literal

from google.adk import Context, Workflow
from google.adk.agents import LlmAgent, RunConfig
from google.adk.agents.invocation_context import LlmCallsLimitExceededError
from google.adk.models import Gemini
from google.adk.runners import InMemoryRunner
from google.adk.workflow import BaseNode, JoinNode, node
from google.adk.workflow._errors import DynamicNodeFailError
from google.genai import types
from google.genai.errors import APIError

from backend.agents import (
    agent_continuous_learning,
    agent_incident_scribe,
    agent_process_analyst,
    agent_quality_inspector,
    agent_root_cause,
    agent_technician_copilot,
    agent_traceability,
)
from backend.agents.scenario_fallbacks import fallback_draft
from backend.agents.workflow_nodes import (
    close_incident,
    dismiss_incident,
    escalate_incident,
    inspect_production,
    open_incident,
    rca_gate,
    record_archive,
    record_detection,
    record_field_evidence,
    record_field_evidence_payload,
    record_handover_note,
    record_learning,
    record_process_analysis,
    record_resolution,
    record_traceability,
    reopen_investigation,
    source_key,
    trace_topology,
    verification_gate,
    verify_repair,
    wait_for_evidence_node,
    wait_for_repair_node,
)
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    DefectInjectionRequest,
    HandoverNote,
    IncidentState,
    SimulationStatusResponse,
    VisualEvidencePayload,
)
from backend.tools.document_export import schedule_documents_export
from backend.tools.learning_writeback import schedule_learning_writeback

logger = logging.getLogger(__name__)


def _build_gemini_model(model_name: str) -> Gemini:
    """Builds a Gemini model that retries a 429 at the single-call level before it surfaces."""
    return Gemini(
        model=model_name,
        retry_options=types.HttpRetryOptions(
            attempts=3,
            initial_delay=1.0,
            max_delay=15.0,
            exp_base=2.0,
            jitter=1.0,
            http_status_codes=[429],
        ),
    )


# Every agent_* node is model-less and resolves to this default at call time.
if settings.ai_provider == "mock":
    from backend.agents.mock_llm import MockLlm

    LlmAgent.set_default_model(MockLlm())
    logger.info("LLM provider=mock using in-memory MockLlm")
elif settings.ai_provider == "gemini":
    LlmAgent.set_default_model(_build_gemini_model(settings.gemini_model))
    logger.info("LLM provider=gemini model=%s retrying 429s", settings.gemini_model)
else:
    LlmAgent.set_default_model(settings.llm_model)
    logger.info("LLM provider=%s model=%s", settings.ai_provider, settings.llm_model)

APP_NAME = "kaizen_orchestrator"
# Attempts per LLM agent step: the first try plus one retry.
MAX_AGENT_ATTEMPTS = 2
WORKFLOW_NAME = "kaizen_incident"
# Whole-incident ceiling (ADK default 500). A full run with evidence rounds and one reopen is
# ~20 agent turns of at most 1 + MAX_TOOL_CALLS model calls each.
MAX_LLM_CALLS_PER_INCIDENT = 100
# Shown to the technician instead of the raw Vertex 429/RESOURCE_EXHAUSTED error + doc URL.
GEMINI_RATE_LIMIT_MESSAGE = "The AI service is busy right now. Please try again in a minute."
# Shown for any other failure instead of leaking exception class names/messages (ADK
# internals, tool error text, stack traces) to the technician. The full exception is still
# logged server-side (logger.exception) and captured in the crash dump for debugging.
GENERIC_FAILURE_MESSAGE = (
    "Something went wrong while analyzing this incident. Please retry or notify a shift leader."
)


class AgentStepError(Exception):
    """An LLM agent step failed after its retry and no scripted fallback applies."""

    def __init__(self, agent_module: ModuleType, cause: BaseException) -> None:
        super().__init__(f"{agent_module.AGENT_NAME} failed: {cause!r}")
        self.agent_name: str = agent_module.AGENT_NAME
        self.cause = cause


def _draft_source() -> str | None:
    """Provenance of a successful agent draft; None for providers the schema has no label for."""
    if settings.ai_provider in ("gemini", "mock"):
        return settings.ai_provider
    return None


def guarded_agent(agent_module: ModuleType, agent: LlmAgent | None = None) -> BaseNode:
    """Wraps an LLM agent node so one bad model turn does not fail the whole incident.

    The agent runs up to `MAX_AGENT_ATTEMPTS` times (malformed output, 429, timeout or any other
    error). If every attempt fails: with `settings.demo_scripted` the scenario's scripted draft
    is returned (source "fallback"); otherwise `AgentStepError` is raised so the incident ends in
    `error` naming the agent. The draft's source is published in workflow state for `_record`.
    The node keeps the agent's name, so join nodes still key its output by that name.
    """
    agent = agent or agent_module.agent
    schema = agent.output_schema
    state_key = source_key(agent_module)

    async def run_agent(ctx: Context, node_input: Any) -> dict[str, Any]:
        failure: BaseException | None = None
        for attempt in range(1, MAX_AGENT_ATTEMPTS + 1):
            try:
                output = await ctx.run_node(agent, node_input)
                if output is None:
                    raise ValueError("the model returned an empty reply")
                draft = schema.model_validate(output)
            except Exception as exc:
                failure = exc.error if isinstance(exc, DynamicNodeFailError) else exc
                if isinstance(failure, LlmCallsLimitExceededError):
                    raise failure from None
                logger.warning(
                    "agent %s attempt %d/%d failed: %r",
                    agent.name,
                    attempt,
                    MAX_AGENT_ATTEMPTS,
                    failure,
                )
                continue
            ctx.state[state_key] = _draft_source()
            return draft.model_dump()

        if not settings.demo_scripted:
            raise AgentStepError(agent_module, failure) from failure
        scenario = (ctx.state.get("trigger") or {}).get("scenario")
        logger.error(
            "agent %s failed %d attempts (%r); using scripted fallback for scenario %s",
            agent.name,
            MAX_AGENT_ATTEMPTS,
            failure,
            scenario,
        )
        ctx.state[state_key] = "fallback"
        return fallback_draft(agent.name, scenario).model_dump()

    return node(run_agent, name=agent.name, rerun_on_resume=True)


quality_inspector_node = guarded_agent(agent_quality_inspector)
traceability_node = guarded_agent(agent_traceability)
process_analyst_node = guarded_agent(agent_process_analyst)
root_cause_node = guarded_agent(agent_root_cause)
technician_copilot_node = guarded_agent(agent_technician_copilot)
field_diagnostic_node = guarded_agent(
    agent_technician_copilot, agent_technician_copilot.diagnostic_agent
)
incident_scribe_node = guarded_agent(agent_incident_scribe)
continuous_learning_node = guarded_agent(agent_continuous_learning)

resolution_join = JoinNode(name="resolution_join")

incident_workflow = Workflow(
    name=WORKFLOW_NAME,
    edges=[
        ("START", open_incident, inspect_production),
        (
            inspect_production,
            {"BREACH": quality_inspector_node, "NO_BREACH": dismiss_incident},
        ),
        (
            quality_inspector_node,
            record_detection,
            trace_topology,
            traceability_node,
            record_traceability,
            process_analyst_node,
            record_process_analysis,
            root_cause_node,
            rca_gate,
        ),
        (
            rca_gate,
            {
                "CONFIDENT": (technician_copilot_node, incident_scribe_node),
                "NEED_EVIDENCE": wait_for_evidence_node,
                "ESCALATE": escalate_incident,
            },
        ),
        (
            wait_for_evidence_node,
            field_diagnostic_node,
            record_field_evidence,
            root_cause_node,
        ),
        (
            (technician_copilot_node, incident_scribe_node),
            resolution_join,
            record_resolution,
            wait_for_repair_node,
        ),
        (
            wait_for_repair_node,
            {"CONFIRMED": verify_repair, "ESCALATE": escalate_incident},
        ),
        (verify_repair, verification_gate),
        (
            verification_gate,
            {
                "VERIFIED": close_incident,
                "NOT_VERIFIED": reopen_investigation,
                "ESCALATE": escalate_incident,
            },
        ),
        (reopen_investigation, trace_topology),
        (close_incident, continuous_learning_node, record_learning),
    ],
)


def dump_crash(
    state: IncidentState,
    exc: Exception,
    output_dir: Path | None = None,
) -> Path | None:
    """Serializes the exact IncidentState context to crash_<incident_id>_<timestamp>.json upon failure."""
    try:
        ts = int(time.time())
        filename = f"crash_{state.incident_id}_{ts}.json"
        target_dir = output_dir or Path.cwd()
        target_dir.mkdir(parents=True, exist_ok=True)
        crash_path = target_dir / filename
        data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "incident_id": state.incident_id,
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "traceback": traceback.format_exc(),
            "state": state.model_dump(mode="json"),
        }
        crash_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        logger.info("Serialized crash dump to %s", crash_path)
        return crash_path
    except Exception as dump_err:
        logger.error("Failed to write crash dump: %s", dump_err)
        return None


class EvidenceNotAwaitedError(Exception):
    """Raised when field or preset evidence is attached outside the awaiting_evidence state."""
    pass


class RepairNotAwaitedError(Exception):
    """Raised when a repair confirmation arrives while no incident awaits one."""


# Live-incident statuses that are still being worked; such an incident cannot be archived.
IN_PROGRESS_STATUSES = frozenset(
    {
        "detecting",
        "tracing",
        "investigating",
        "analyzing",
        "awaiting_evidence",
        "repairing",
        "verifying",
        "pending_approval",
    }
)


class IncidentInProgressError(Exception):
    """Raised when the live incident is still being worked and cannot be archived yet."""


class Orchestrator:
    """Single input/output boundary: starts, approves and resets incidents; one at a time."""

    def __init__(self, step_delay: float | None = None) -> None:
        self._step_delay = step_delay
        self._task: Any = None
        self._abort: asyncio.Event | None = None
        self._evidence_event: asyncio.Event = asyncio.Event()
        self._repair_event: asyncio.Event = asyncio.Event()
        self._repair_confirmed: bool = False
        self._trigger: DefectInjectionRequest | None = None
        self._started_at: float | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start_incident(self, trigger: DefectInjectionRequest) -> bool:
        """Starts the workflow in the background; returns False if one is already running."""
        if self.is_running:
            return False
        self._abort = asyncio.Event()
        self._evidence_event = asyncio.Event()
        self._repair_event = asyncio.Event()
        self._repair_confirmed = False
        self._trigger = trigger
        self._started_at = time.monotonic()

        loop: asyncio.AbstractEventLoop | None = None
        try:
            loop = asyncio.get_running_loop()
            self._loop = loop
        except RuntimeError:
            loop = self._loop

        if loop is not None and loop.is_running():
            try:
                self._task = asyncio.create_task(self.run_incident(trigger, self._abort))
            except RuntimeError:
                # Dispatched from background worker thread (e.g. Pub/Sub or MQTT callback)
                self._task = asyncio.run_coroutine_threadsafe(
                    self.run_incident(trigger, self._abort), loop
                )
            return True

        logger.warning("No running asyncio event loop; incident workflow not started")
        return False

    async def run_incident(
        self, trigger: DefectInjectionRequest, abort: asyncio.Event | None = None
    ) -> IncidentState:
        """Runs the incident workflow to completion; failures land on the Blackboard as `error`."""
        if self._trigger is None:
            self._trigger = trigger
        if self._evidence_event is None:
            self._evidence_event = asyncio.Event()
        runner = InMemoryRunner(node=incident_workflow, app_name=APP_NAME)
        try:
            session_kwargs = {}
            step_delay = self._step_delay
            if step_delay is None and trigger.mode == "fast":
                step_delay = 0.05
            if step_delay is not None:
                session_kwargs["state"] = {"step_delay": step_delay}
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
                run_config=RunConfig(max_llm_calls=MAX_LLM_CALLS_PER_INCIDENT),
            ):
                pass
            logger.info("incident workflow finished: status=%s", blackboard.get_state().status)
        except AgentStepError as exc:
            logger.exception("incident workflow failed in %s", exc.agent_name)
            rate_limited = isinstance(exc.cause, APIError) and exc.cause.code == 429
            reason = GEMINI_RATE_LIMIT_MESSAGE if rate_limited else GENERIC_FAILURE_MESSAGE
            blackboard.update_status("error", status_reason=f"{exc.agent_name} failed: {reason}")
            dump_crash(blackboard.get_state(), exc)
        except Exception as exc:
            logger.exception("incident workflow failed")
            blackboard.update_status("error", status_reason=GENERIC_FAILURE_MESSAGE)
            dump_crash(blackboard.get_state(), exc)
        return blackboard.get_state()

    async def cancel(self) -> None:
        """Aborts the running workflow (ADK abort_signal) and waits for it to stop."""
        try:
            if self._evidence_event is not None:
                self._evidence_event.set()
            self._repair_event.set()
            if self.is_running:
                self._abort.set()
                await self._task
        finally:
            self._task = None
            self._abort = None
            self._trigger = None
            self._started_at = None

    def stop_simulation(self) -> None:
        """Synchronously cancels any running incident workflow (test/backward compatibility)."""
        if self._evidence_event is not None:
            self._evidence_event.set()
        self._repair_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None
        self._abort = None
        self._trigger = None
        self._started_at = None

    async def run_incident_simulation(self, req: DefectInjectionRequest) -> IncidentState:
        """Runs the incident workflow for the simulation request."""
        return await self.run_incident(req)

    def status(self) -> SimulationStatusResponse:
        """Reports the last started trigger; elapsed time only while the workflow runs."""
        trigger = self._trigger
        running = self.is_running
        return SimulationStatusResponse(
            status="running" if running else "idle",
            active_scenario=trigger.scenario if trigger else None,
            mode=trigger.mode if trigger else None,
            target_machine=trigger.machine_id if trigger else None,
            target_tool=trigger.tool_id if trigger else None,
            elapsed_seconds=(
                round(time.monotonic() - self._started_at, 2)
                if running and self._started_at is not None
                else None
            ),
        )

    def approve(self, approver: str | None = None) -> IncidentState | None:
        """Records shift-leader approval; only a learning-complete, not-yet-approved incident qualifies."""
        state = blackboard.get_state()
        if state.status != "pending_approval" or state.approved:
            return None
        approved_state = blackboard.update_status(
            "closed",
            approved=True,
            approved_by=approver,
            approved_at=datetime.now(timezone.utc).isoformat(),
        )
        # #333: export the approved documents (Markdown to GCS) off the approval path.
        schedule_documents_export(approved_state)
        # #334: write the learned knowledge entry back into RAG (GCS import or
        # local BM25 reindex) off the approval path.
        schedule_learning_writeback(approved_state)
        return approved_state

    def archive_incident(
        self, incident_id: str, archived_by: str | None = None
    ) -> IncidentState | None:
        """Archives an incident; the live one only once it is no longer being worked."""
        state = blackboard.get_state()
        if incident_id == state.incident_id and state.status in IN_PROGRESS_STATUSES:
            raise IncidentInProgressError(
                f"Incident {incident_id} is still in progress ({state.status}); "
                "finish or escalate it first"
            )
        return record_archive(incident_id=incident_id, archived=True, archived_by=archived_by)

    def unarchive_incident(self, incident_id: str) -> IncidentState | None:
        """Restores an archived incident to the technician app (undo of archive_incident)."""
        return record_archive(incident_id=incident_id, archived=False, archived_by=None)

    def add_handover_note(self, author: str, note: str) -> HandoverNote:
        """Dispatches a technician handover note addition through the workflow node."""
        return record_handover_note(author=author, note=note)

    def notify_evidence(self) -> None:
        """Signals that technician visual evidence has been attached."""
        if self._evidence_event is not None:
            self._evidence_event.set()

    def arm_evidence_wait(self) -> None:
        """Arms or resets the evidence event for an awaiting_evidence round."""
        if self._evidence_event is None:
            self._evidence_event = asyncio.Event()
        else:
            self._evidence_event.clear()

    async def wait_for_evidence(self, timeout: float = 0.0) -> bool:
        """Awaits technician visual evidence up to timeout seconds.

        Returns True if evidence arrived, False if timed out.
        """
        if self._evidence_event is None:
            self._evidence_event = asyncio.Event()

        if timeout <= 0:
            return self._evidence_event.is_set()

        try:
            await asyncio.wait_for(self._evidence_event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def attach_evidence(
        self,
        finding: AgentFinding,
        visual_evidence: VisualEvidencePayload | None = None,
    ) -> IncidentState:
        """Dispatches technician field evidence through the workflow node (Key Invariant 2)."""
        cur_st = blackboard.get_state()
        if cur_st.status != "awaiting_evidence":
            raise EvidenceNotAwaitedError("The AI is not waiting for evidence right now")
        state = record_field_evidence_payload(finding=finding, visual_evidence=visual_evidence)
        self.notify_evidence()
        return state

    def arm_repair_wait(self) -> None:
        """Arms the repair-confirmation event for a repairing round."""
        self._repair_event.clear()
        self._repair_confirmed = False

    async def wait_for_repair(self, timeout: float) -> Literal["confirmed", "timeout", "cancelled"]:
        """Awaits the technician's 'Repair done' confirmation for up to ``timeout`` seconds."""
        try:
            await asyncio.wait_for(self._repair_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return "timeout"
        return "confirmed" if self._repair_confirmed else "cancelled"

    def confirm_repair(self) -> IncidentState:
        """Records the technician's 'Repair done' input; only valid while the workflow awaits it."""
        state = blackboard.get_state()
        if state.status != "repairing" or state.repair_done:
            raise RepairNotAwaitedError("The AI is not waiting for a repair confirmation right now")
        self._repair_confirmed = True
        self._repair_event.set()
        return state

    async def reset(self) -> IncidentState:
        """Cancels any running workflow and restores the baseline Blackboard."""
        await self.cancel()
        self._evidence_event = asyncio.Event()
        self._repair_event = asyncio.Event()
        self._repair_confirmed = False
        return blackboard.reset()


orchestrator = Orchestrator()
