"""Workflow tests for the ADK incident orchestrator, driven by a deterministic fake LLM."""

from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncGenerator

import pytest
from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from backend.agents import agent_quality_inspector
from backend.agents.orchestrator import Orchestrator
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest, IncidentState, VerificationResult


class FakeLlm(BaseLlm):
    """Answers every agent with a valid ScribeDraft JSON; RCA confidence is scripted."""

    model: str = "fake"
    rca_confidences: list[float] = [0.87]
    fail_on: str | None = None

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        si = str(llm_request.config.system_instruction)
        if self.fail_on and self.fail_on in si:
            raise RuntimeError("fake failure")
        confidence = 0.9
        if "You are the Root Cause Agent" in si:
            confidence = (
                self.rca_confidences.pop(0)
                if len(self.rca_confidences) > 1
                else self.rca_confidences[0]
            )
        payload = {
            "finding": "fake finding",
            "evidence": "fake evidence",
            "confidence": confidence,
            "citation": "fake citation",
            "work_order": "WO-1",
            "report_8d": "8D",
            "sop_proposal": "SOP",
        }
        yield LlmResponse(
            content=types.Content(role="model", parts=[types.Part(text=json.dumps(payload))])
        )


@pytest.fixture(autouse=True)
def clean_state():
    blackboard.reset()
    saved = LlmAgent._default_model
    yield
    LlmAgent._default_model = saved
    blackboard.reset()


def _run(llm: FakeLlm) -> IncidentState:
    LlmAgent.set_default_model(llm)
    return asyncio.run(Orchestrator(step_delay=0).run_incident(DefectInjectionRequest()))


def _ids(state: IncidentState) -> list[str]:
    return [f.agent_id for f in state.findings]


def test_confident_root_cause_closes_on_verified_product_evidence():
    state = _run(FakeLlm(rca_confidences=[0.87]))
    assert state.status == "closed"
    assert state.verification_count >= state.verification_target
    assert state.impact is not None
    assert state.suspect_machine == "CNC-02"
    assert set(state.documents) == {"work_order", "report_8d", "sop_proposal"}
    assert _ids(state) == ["QA", "TRA", "PA", "RCA", "COPILOT", "DOC", "QA", "LEARN"]


def test_low_confidence_gathers_field_evidence_then_reruns_root_cause():
    state = _run(FakeLlm(rca_confidences=[0.5, 0.9]))
    assert state.status == "closed"
    assert _ids(state)[:6] == ["QA", "TRA", "PA", "RCA", "COPILOT", "RCA"]
    assert state.findings[4].phase == "Phase B - Field Evidence"


def test_persistently_low_confidence_escalates_without_repair():
    state = _run(FakeLlm(rca_confidences=[0.3]))
    assert state.status == "escalated"
    assert _ids(state).count("RCA") == 3
    assert state.verification_count == 0
    assert "below" in state.status_reason


def test_failed_verification_reopens_once_then_escalates_never_closes(
    monkeypatch: pytest.MonkeyPatch,
):
    statuses: list[str] = []
    original_update = blackboard.update_status

    def tracking_update(status: str, **kwargs):
        statuses.append(status)
        return original_update(status, **kwargs)

    async def failing_verification(step_delay: float) -> VerificationResult:
        blackboard.update_status("verifying", verification_count=10)
        return VerificationResult(good_streak=10, defect_rate=0.05)

    monkeypatch.setattr(blackboard, "update_status", tracking_update)
    monkeypatch.setattr(
        agent_quality_inspector, "run_post_repair_verification", failing_verification
    )

    state = _run(FakeLlm())
    assert state.status == "escalated"
    assert _ids(state).count("TRA") == 2
    assert "closed" not in statuses


def test_agent_failure_surfaces_as_error_status():
    state = _run(FakeLlm(fail_on="You are the Process Analyst Agent"))
    assert state.status == "error"
    assert "RuntimeError" in state.status_reason


def test_single_flight_and_abort_cancel():
    LlmAgent.set_default_model(FakeLlm())

    async def scenario() -> None:
        orch = Orchestrator(step_delay=1)
        assert orch.start_incident(DefectInjectionRequest()) is True
        assert orch.start_incident(DefectInjectionRequest()) is False
        await asyncio.sleep(0.2)
        started = time.monotonic()
        await orch.cancel()
        assert time.monotonic() - started < 1
        assert orch.is_running is False

    asyncio.run(scenario())
