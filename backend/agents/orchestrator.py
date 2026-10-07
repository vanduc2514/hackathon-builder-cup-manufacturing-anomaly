"""Orchestrator Agent (ADK Workflow): wires the incident lifecycle graph and runs it per incident."""

from __future__ import annotations

import asyncio
import logging

from google.adk import Workflow
from google.adk.runners import InMemoryRunner
from google.adk.workflow import JoinNode
from google.genai import types

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
    escalate_incident,
    open_incident,
    rca_gate,
    record_detection,
    record_field_evidence,
    record_learning,
    record_process_analysis,
    record_resolution,
    record_traceability,
    reopen_investigation,
    verification_gate,
    verify_repair,
)
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest, IncidentState

logger = logging.getLogger(__name__)

APP_NAME = "kaizen_orchestrator"
WORKFLOW_NAME = "kaizen_incident"


resolution_join = JoinNode(name="resolution_join")

incident_workflow = Workflow(
    name=WORKFLOW_NAME,
    edges=[
        (
            "START",
            open_incident,
            agent_quality_inspector.agent,
            record_detection,
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
        (reopen_investigation, agent_traceability.agent),
        (close_incident, agent_continuous_learning.agent, record_learning),
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
