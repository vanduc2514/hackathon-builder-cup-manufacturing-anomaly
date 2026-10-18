"""Workflow tests for the ADK incident orchestrator, driven by a deterministic fake LLM."""

from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncGenerator
from unittest.mock import patch

import pytest
from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from google.genai.errors import ClientError

from backend.agents import agent_quality_inspector
from backend.agents.orchestrator import (
    GEMINI_RATE_LIMIT_MESSAGE,
    GENERIC_FAILURE_MESSAGE,
    MAX_LLM_CALLS_PER_INCIDENT,
    Orchestrator,
    _build_gemini_model,
)
from backend.agents.tool_guards import MAX_TOOL_CALLS
from backend.core.blackboard import UNFINISHED_STATUSES, WORKFLOW_LOST_MESSAGE, blackboard
from backend.core.models import (
    DefectInjectionRequest,
    IncidentState,
    SensorMetrics,
    SensorTelemetryWindowResponse,
    SuspectCorrelation,
    TraceabilityTopologyResponse,
    VerificationResult,
)


class FakeLlm(BaseLlm):
    """Answers every agent with a valid ScribeDraft JSON; RCA confidence is scripted."""

    model: str = "fake"
    rca_confidences: list[float] = [0.87]
    fail_on: str | None = None
    fail_with: Exception | None = None

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        si = str(llm_request.config.system_instruction)
        if self.fail_on and self.fail_on in si:
            raise self.fail_with or RuntimeError("fake failure")
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


MOCK_TOPOLOGY = TraceabilityTopologyResponse(
    source="test_fixture",
    suspects=[
        SuspectCorrelation(
            machine_id="CNC-02",
            tool_id="T07",
            correlation_score=0.95,
            defect_count=3,
            total_parts=4,
            sample_ratio=0.75,
        )
    ],
    excluded_factors=["lot_id: AL-5083-B4 (normal distribution)"],
)


@pytest.fixture(autouse=True)
def clean_state():
    blackboard.reset()
    saved = LlmAgent._default_model
    with patch(
        "backend.agents.agent_traceability.trace_line_topology",
        return_value=MOCK_TOPOLOGY,
    ):
        yield
    LlmAgent._default_model = saved
    blackboard.reset()


def _run(llm: FakeLlm, req: DefectInjectionRequest | None = None) -> IncidentState:
    LlmAgent.set_default_model(llm)
    return asyncio.run(Orchestrator(step_delay=0).run_incident(req or DefectInjectionRequest(mode="fast")))


def _ids(state: IncidentState) -> list[str]:
    return [f.agent_id for f in state.findings]


def test_confident_root_cause_closes_on_verified_product_evidence():
    state = _run(FakeLlm(rca_confidences=[0.87]))
    assert state.status == "pending_approval"
    assert state.verification_count >= state.verification_target
    assert state.impact is not None
    assert state.suspect_machine == "CNC-02"
    assert set(state.documents) == {"work_order", "report_8d", "sop_proposal"}
    assert _ids(state) == ["QA", "TRA", "PA", "RCA", "COPILOT", "DOC", "QA", "LEARN"]


def test_low_confidence_gathers_field_evidence_then_reruns_root_cause():
    state = _run(FakeLlm(rca_confidences=[0.5, 0.9]))
    assert state.status == "pending_approval"
    assert _ids(state)[:6] == ["QA", "TRA", "PA", "RCA", "COPILOT", "RCA"]
    assert state.findings[4].phase == "Phase B - Field Evidence"


def test_persistently_low_confidence_escalates_without_repair():
    state = _run(FakeLlm(rca_confidences=[0.3]))
    assert state.status == "escalated"
    assert _ids(state).count("RCA") == 3
    assert state.verification_count == 0
    assert "below" in state.status_reason


def test_no_spc_breach_dismisses_without_investigation():
    state = _run(FakeLlm(), req=DefectInjectionRequest(defect_rate=0.01))
    assert state.status == "dismissed"
    assert state.findings == []
    assert "No SPC breach" in state.status_reason


def test_failed_verification_reopens_once_then_escalates_never_closes(
    monkeypatch: pytest.MonkeyPatch,
):
    statuses: list[str] = []
    original_update = blackboard.update_status

    def tracking_update(status: str, **kwargs):
        statuses.append(status)
        return original_update(status, **kwargs)

    async def failing_verification(target: int, step_delay: float, **_: object):
        yield VerificationResult(good_streak=10, defect_rate=0.05)

    monkeypatch.setattr(blackboard, "update_status", tracking_update)
    monkeypatch.setattr(
        agent_quality_inspector, "inspect_post_repair_products", failing_verification
    )

    state = _run(FakeLlm())
    assert state.status == "escalated"
    assert _ids(state).count("TRA") == 2
    assert "closed" not in statuses


def test_approval_accepted_only_once_after_verified_close():
    orch = Orchestrator(step_delay=0)
    assert orch.approve() is None  # nothing to approve on a baseline board

    LlmAgent.set_default_model(FakeLlm(rca_confidences=[0.87]))
    asyncio.run(orch.run_incident(DefectInjectionRequest(mode="fast")))
    assert blackboard.get_state().approved is False
    assert blackboard.get_state().status == "pending_approval"

    approved_state = orch.approve(approver="shift-lead-01")
    assert approved_state.approved is True
    assert approved_state.status == "closed"
    assert approved_state.approved_by == "shift-lead-01"
    assert approved_state.approved_at is not None
    assert orch.approve() is None


def test_approval_rejected_on_escalated_incident():
    _run(FakeLlm(rca_confidences=[0.3]))
    assert Orchestrator().approve() is None
    assert blackboard.get_state().status == "escalated"


def test_agent_failure_surfaces_as_error_status():
    state = _run(FakeLlm(fail_on="You are the Process Analyst Agent"))
    assert state.status == "error"
    assert state.status_reason == f"Process Analyst Agent failed: {GENERIC_FAILURE_MESSAGE}"
    assert "RuntimeError" not in state.status_reason


def test_gemini_429_surfaces_as_friendly_status_reason(caplog: pytest.LogCaptureFixture):
    err = ClientError(
        code=429,
        response_json={
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "Resource exhausted. See https://ai.google.dev/quota for details.",
            }
        },
    )
    with caplog.at_level("ERROR", logger="backend.agents.orchestrator"):
        state = _run(FakeLlm(fail_on="You are the Process Analyst Agent", fail_with=err))
    assert state.status == "error"
    assert state.status_reason == f"Process Analyst Agent failed: {GEMINI_RATE_LIMIT_MESSAGE}"
    assert "429" not in state.status_reason
    assert "RESOURCE_EXHAUSTED" not in state.status_reason
    assert "http" not in state.status_reason.lower()
    assert any(record.exc_info for record in caplog.records)


def test_gemini_non_429_api_error_surfaces_as_friendly_status_reason():
    err = ClientError(
        code=400, response_json={"error": {"code": 400, "message": "Invalid argument"}}
    )
    state = _run(FakeLlm(fail_on="You are the Process Analyst Agent", fail_with=err))
    assert state.status == "error"
    assert state.status_reason == f"Process Analyst Agent failed: {GENERIC_FAILURE_MESSAGE}"
    assert "400" not in state.status_reason
    assert "Invalid argument" not in state.status_reason


def test_build_gemini_model_retries_only_on_429():
    model = _build_gemini_model("gemini-flash-latest")
    assert model.retry_options.attempts == 3
    assert model.retry_options.http_status_codes == [429]


class ToolLoopLlm(FakeLlm):
    """Process Analyst calls its telemetry tool whenever it is offered (or always, if stubborn)."""

    stubborn: bool = False
    calls: int = 0

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.calls += 1
        offered = any(
            decl.name == "analyze_machine_telemetry"
            for tool in llm_request.config.tools or []
            for decl in tool.function_declarations or []
        )
        si = str(llm_request.config.system_instruction)
        if "You are the Process Analyst Agent" in si and (offered or self.stubborn):
            call = types.FunctionCall(
                name="analyze_machine_telemetry",
                args={"machine_id": "CNC-02", "time_window": "09:00-10:00"},
            )
            yield LlmResponse(
                content=types.Content(role="model", parts=[types.Part(function_call=call)])
            )
            return
        async for response in super().generate_content_async(llm_request, stream):
            yield response


TELEMETRY = SensorTelemetryWindowResponse(
    source="test_fixture",
    machine_id="CNC-02",
    time_window="09:00-10:00",
    metrics=SensorMetrics(
        min_vibration=1.5,
        max_vibration=2.7,
        avg_vibration=2.1,
        std_vibration=0.5,
        avg_temperature=41.0,
        avg_current=12.9,
        sample_count=5,
    ),
    anomaly_detected=True,
)


def test_tool_happy_agent_is_cut_off_after_budget_and_incident_closes():
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        return_value=TELEMETRY,
    ) as query:
        state = _run(ToolLoopLlm())
    assert query.call_count == MAX_TOOL_CALLS
    assert state.status == "pending_approval"
    assert "PA" in _ids(state)


def test_runaway_llm_calls_stop_at_incident_ceiling():
    llm = ToolLoopLlm(stubborn=True)
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        return_value=TELEMETRY,
    ):
        state = _run(llm)
    assert state.status == "error"
    assert state.status_reason == GENERIC_FAILURE_MESSAGE
    assert "LlmCallsLimitExceededError" not in state.status_reason
    assert llm.calls == MAX_LLM_CALLS_PER_INCIDENT


def test_rejected_tool_arguments_go_back_to_the_model_and_incident_closes():
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        side_effect=ValueError("start_time must be an ISO-8601 timestamp or HH:MM"),
    ) as query:
        state = _run(ToolLoopLlm())
    assert query.call_count == MAX_TOOL_CALLS
    assert state.status == "pending_approval"


def test_tool_outage_still_fails_the_incident():
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        side_effect=RuntimeError("BigQuery query failed: 503"),
    ):
        state = _run(ToolLoopLlm())
    assert state.status == "error"
    assert state.status_reason == f"Process Analyst Agent failed: {GENERIC_FAILURE_MESSAGE}"
    assert "BigQuery query failed" not in state.status_reason


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


def test_cancelled_workflow_marks_incident_error():
    """An aborted workflow (shutdown/cancel) must not leave the incident in-flight forever."""
    LlmAgent.set_default_model(FakeLlm())

    async def scenario() -> None:
        orch = Orchestrator(step_delay=1)
        assert orch.start_incident(DefectInjectionRequest()) is True
        await asyncio.sleep(0.2)
        assert blackboard.get_state().status in UNFINISHED_STATUSES
        await orch.cancel()

    asyncio.run(scenario())
    state = blackboard.get_state()
    assert state.status == "error"
    assert state.status_reason == WORKFLOW_LOST_MESSAGE
