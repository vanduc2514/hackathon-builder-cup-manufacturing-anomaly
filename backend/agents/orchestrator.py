"""Orchestrator Agent (ADK Workflow): wires the incident lifecycle graph and runs it per incident."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google.adk import Workflow
from google.adk.agents import LlmAgent, RunConfig
from google.adk.models import Gemini
from google.adk.runners import InMemoryRunner
from google.adk.workflow import JoinNode
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
from backend.agents.workflow_nodes import (
    close_incident,
    dismiss_incident,
    escalate_incident,
    inspect_production,
    open_incident,
    rca_gate,
    record_detection,
    record_field_evidence,
    record_field_evidence_payload,
    record_handover_note,
    record_learning,
    record_process_analysis,
    record_resolution,
    record_traceability,
    reopen_investigation,
    trace_topology,
    verification_gate,
    verify_repair,
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


resolution_join = JoinNode(name="resolution_join")

incident_workflow = Workflow(
    name=WORKFLOW_NAME,
    edges=[
        ("START", open_incident, inspect_production),
        (
            inspect_production,
            {"BREACH": agent_quality_inspector.agent, "NO_BREACH": dismiss_incident},
        ),
        (
            agent_quality_inspector.agent,
            record_detection,
            trace_topology,
            agent_traceability.agent,
            record_traceability,
            agent_process_analyst.agent,
            record_process_analysis,
            agent_root_cause.agent,
            rca_gate,
        ),
        (
            rca_gate,
            {
                "CONFIDENT": (agent_technician_copilot.agent, agent_incident_scribe.agent),
                "NEED_EVIDENCE": agent_technician_copilot.diagnostic_agent,
                "ESCALATE": escalate_incident,
            },
        ),
        (agent_technician_copilot.diagnostic_agent, record_field_evidence, agent_root_cause.agent),
        (
            (agent_technician_copilot.agent, agent_incident_scribe.agent),
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
        (reopen_investigation, trace_topology),
        (close_incident, agent_continuous_learning.agent, record_learning),
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


class Orchestrator:
    """Single input/output boundary: starts, approves and resets incidents; one at a time."""

    def __init__(self, step_delay: float | None = None) -> None:
        self._step_delay = step_delay
        self._task: Any = None
        self._abort: asyncio.Event | None = None
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
        except APIError as exc:
            logger.exception("incident workflow failed")
            if exc.code == 429:
                blackboard.update_status("error", status_reason=GEMINI_RATE_LIMIT_MESSAGE)
            else:
                blackboard.update_status("error", status_reason=GENERIC_FAILURE_MESSAGE)
            dump_crash(blackboard.get_state(), exc)
        except Exception as exc:
            logger.exception("incident workflow failed")
            blackboard.update_status("error", status_reason=GENERIC_FAILURE_MESSAGE)
            dump_crash(blackboard.get_state(), exc)
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
            self._trigger = None
            self._started_at = None

    def stop_simulation(self) -> None:
        """Synchronously cancels any running incident workflow (test/backward compatibility)."""
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
        """Records shift-leader approval; only a verified-closed, not-yet-approved incident qualifies."""
        state = blackboard.get_state()
        if state.status != "closed" or state.approved:
            return None
        return blackboard.update_status("closed", approved=True)

    def add_handover_note(self, author: str, note: str) -> HandoverNote:
        """Dispatches a technician handover note addition through the workflow node."""
        return record_handover_note(author=author, note=note)

    def attach_evidence(
        self,
        finding: AgentFinding,
        visual_evidence: VisualEvidencePayload | None = None,
    ) -> IncidentState:
        """Dispatches technician field evidence through the workflow node (Key Invariant 2)."""
        return record_field_evidence_payload(finding=finding, visual_evidence=visual_evidence)

    async def reset(self) -> IncidentState:
        """Cancels any running workflow and restores the baseline Blackboard."""
        await self.cancel()
        return blackboard.reset()


orchestrator = Orchestrator()
