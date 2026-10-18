"""Agent-step resilience in the incident workflow: retry once, then scripted fallback or `error`.

A fake LLM returns malformed JSON (or an API error) for chosen agents. With
`settings.demo_scripted` the incident still closes on the scenario's scripted drafts, each
recorded with source="fallback"; without it the board ends in `error` naming the agent.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator
from unittest.mock import patch

import pytest
from google.adk.agents import LlmAgent
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from google.genai.errors import ClientError

from backend.agents.agent_quality_inspector import VERIFICATION_PHASE
from backend.agents.orchestrator import (
    GEMINI_RATE_LIMIT_MESSAGE,
    MAX_AGENT_ATTEMPTS,
    MAX_LLM_CALLS_PER_INCIDENT,
    Orchestrator,
)
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import AgentFinding, DefectInjectionRequest, IncidentState
from tests.test_orchestrator import MOCK_TOPOLOGY, FakeLlm, ToolLoopLlm

PROCESS_ANALYST = "You are the Process Analyst Agent"
ROOT_CAUSE = "You are the Root Cause Agent"
FIELD_DIAGNOSTIC = "acting as the field diagnostic probe"
ALL_AGENT_PREFIXES = (
    "You are the Quality Inspector",
    "You are the Traceability Agent",
    PROCESS_ANALYST,
    ROOT_CAUSE,
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team. ",
    "You are the Incident Scribe",
    "You are the Continuous Learning Agent",
)
EXPECTED_AGENT_IDS = ["QA", "TRA", "PA", "RCA", "COPILOT", "DOC", "QA", "LEARN"]


class BrokenLlm(FakeLlm):
    """FakeLlm that answers agents matching `broken` with non-JSON text.

    `broken` maps an instruction substring to the number of malformed replies still to give
    (-1 = always).
    """

    broken: dict[str, int] = {}

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        si = str(llm_request.config.system_instruction)
        for marker, remaining in self.broken.items():
            if marker in si and remaining != 0:
                self.broken[marker] = remaining - 1 if remaining > 0 else remaining
                yield LlmResponse(
                    content=types.Content(
                        role="model", parts=[types.Part(text='{"finding": "truncated by')]
                    )
                )
                return
        async for response in super().generate_content_async(llm_request, stream):
            yield response


@pytest.fixture(autouse=True)
def clean_state(monkeypatch: pytest.MonkeyPatch):
    blackboard.reset()
    saved = LlmAgent._default_model
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    with patch(
        "backend.agents.agent_traceability.trace_line_topology",
        return_value=MOCK_TOPOLOGY,
    ):
        yield
    LlmAgent._default_model = saved
    blackboard.reset()


def _run(llm: FakeLlm, req: DefectInjectionRequest | None = None) -> IncidentState:
    LlmAgent.set_default_model(llm)
    return asyncio.run(
        Orchestrator(step_delay=0).run_incident(req or DefectInjectionRequest(mode="fast"))
    )


def _finding(state: IncidentState, agent_id: str, phase: str | None = None) -> AgentFinding:
    return next(
        f
        for f in state.findings
        if f.agent_id == agent_id and (phase is None or f.phase == phase)
    )


def test_malformed_root_cause_falls_back_to_scripted_draft_and_closes(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "demo_scripted", True)
    state = _run(BrokenLlm(broken={ROOT_CAUSE: -1}))

    assert state.status == "closed"
    assert [f.agent_id for f in state.findings] == EXPECTED_AGENT_IDS
    rca = _finding(state, "RCA")
    assert rca.source == "fallback"
    assert rca.confidence == 0.87
    assert "T07" in rca.finding and "flank wear" in rca.finding
    assert len(rca.five_whys) == 5
    assert set(rca.ishikawa) == {"Machine", "Method", "Material", "Man", "Measurement", "Milieu"}
    assert state.root_cause == rca.finding
    assert all(f.source == "gemini" for f in state.findings if f.agent_id not in ("RCA", "QA"))


def test_every_agent_falls_back_and_the_scripted_cnc_flow_closes(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", True)
    state = _run(BrokenLlm(broken={marker: -1 for marker in ALL_AGENT_PREFIXES}))

    assert state.status == "closed"
    assert [f.agent_id for f in state.findings] == EXPECTED_AGENT_IDS
    scripted = [f for f in state.findings if f.phase != VERIFICATION_PHASE]
    assert scripted and all(f.source == "fallback" for f in scripted)
    assert state.documents["work_order"].startswith("WO-2026-1004")


def test_every_agent_falls_back_in_the_im_scenario(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", True)
    request = DefectInjectionRequest(
        scenario="im_damp_material", machine_id="IM-05", tool_id="MOLD-03", mode="fast"
    )
    state = _run(BrokenLlm(broken={marker: -1 for marker in ALL_AGENT_PREFIXES}), request)

    assert state.status == "closed"
    assert "Dryer-03" in _finding(state, "RCA").finding
    assert state.documents["work_order"].startswith("WO-2026-1005")


def test_field_diagnostic_fallback_passes_the_secondary_convergence_gate(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "demo_scripted", True)
    state = _run(
        BrokenLlm(broken={FIELD_DIAGNOSTIC: -1, ROOT_CAUSE: -1}),
        DefectInjectionRequest(mode="fast", require_evidence=True),
    )

    assert state.status == "closed"
    probe = _finding(state, "COPILOT", "Phase B - Field Evidence")
    assert probe.source == "fallback"
    assert "VB > 0.3 mm" in probe.evidence
    assert [f.source for f in state.findings if f.agent_id == "RCA"] == ["fallback", "fallback"]


@pytest.mark.parametrize("failures", range(1, MAX_AGENT_ATTEMPTS))
def test_transient_malformed_reply_is_retried_without_fallback(
    monkeypatch: pytest.MonkeyPatch, failures: int
):
    monkeypatch.setattr(settings, "demo_scripted", True)
    llm = BrokenLlm(broken={PROCESS_ANALYST: failures})
    state = _run(llm)

    assert state.status == "closed"
    assert _finding(state, "PA").source == "gemini"
    assert _finding(state, "PA").finding == "fake finding"


@pytest.mark.parametrize("scripted", [True, False])
def test_retry_happens_once_before_giving_up(monkeypatch: pytest.MonkeyPatch, scripted: bool):
    monkeypatch.setattr(settings, "demo_scripted", scripted)
    llm = BrokenLlm(broken={PROCESS_ANALYST: -1})
    attempts = 0
    original = BrokenLlm.generate_content_async

    async def counting(self, llm_request, stream=False):
        nonlocal attempts
        if PROCESS_ANALYST in str(llm_request.config.system_instruction):
            attempts += 1
        async for response in original(self, llm_request, stream):
            yield response

    with patch.object(BrokenLlm, "generate_content_async", counting):
        _run(llm)
    assert attempts == MAX_AGENT_ATTEMPTS


def test_without_demo_scripted_a_malformed_reply_fails_loudly_naming_the_agent(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "demo_scripted", False)
    state = _run(BrokenLlm(broken={PROCESS_ANALYST: -1}))

    assert state.status == "error"
    assert state.status_reason.startswith("Process Analyst Agent failed")
    assert "PA" not in [f.agent_id for f in state.findings]
    assert not any(f.source == "fallback" for f in state.findings)


def test_rate_limit_falls_back_when_scripted(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", True)
    err = ClientError(
        code=429,
        response_json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota"}},
    )
    state = _run(FakeLlm(fail_on=PROCESS_ANALYST, fail_with=err))

    assert state.status == "closed"
    assert _finding(state, "PA").source == "fallback"
    assert "vibration" in _finding(state, "PA").finding


def test_rate_limit_without_scripting_names_the_agent(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", False)
    err = ClientError(
        code=429,
        response_json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota"}},
    )
    state = _run(FakeLlm(fail_on=ROOT_CAUSE, fail_with=err))

    assert state.status == "error"
    assert state.status_reason == f"Root Cause Agent failed: {GEMINI_RATE_LIMIT_MESSAGE}"


def test_incident_llm_call_ceiling_is_never_masked_by_the_fallback(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "demo_scripted", True)
    llm = ToolLoopLlm(stubborn=True)
    with patch(
        "backend.agents.agent_process_analyst.query_sensor_telemetry_window",
        side_effect=ValueError("bad window"),
    ):
        state = _run(llm)

    assert state.status == "error"
    assert llm.calls == MAX_LLM_CALLS_PER_INCIDENT


def test_provider_labels_successful_findings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", False)
    monkeypatch.setattr(settings, "ai_provider", "mock")
    state = _run(FakeLlm())

    assert state.status == "closed"
    sources = {f.agent_id: f.source for f in state.findings if f.phase != VERIFICATION_PHASE}
    assert set(sources.values()) == {"mock"}
