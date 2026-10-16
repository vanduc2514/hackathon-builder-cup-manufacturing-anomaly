"""Unit and integration tests for Orchestrator evidence wait gate."""

from __future__ import annotations

import asyncio
import io
import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions.state import State

from backend.agents.mock_llm import MockLlm
from backend.agents.orchestrator import Orchestrator
from backend.agents.workflow_nodes import wait_for_evidence_node
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import (
    AgentFinding,
    DefectInjectionRequest,
    VisualEvidencePayload,
)


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


@pytest.mark.asyncio
async def test_wait_gate_explicit_zero_timeout_does_not_wait():
    """When timeout=0.0, wait_for_evidence returns immediately without blocking."""
    orch = Orchestrator()
    t0 = time.monotonic()
    result = await orch.wait_for_evidence(timeout=0.0)
    elapsed = time.monotonic() - t0

    assert elapsed < 0.1
    assert result is False


@pytest.mark.asyncio
async def test_wait_gate_wakes_immediately_on_evidence_arrival():
    """When evidence is attached, the waiting event unblocks immediately."""
    orch = Orchestrator()
    orch.arm_evidence_wait()
    blackboard.update_status("awaiting_evidence")

    async def _attach_delayed():
        await asyncio.sleep(0.05)
        finding = AgentFinding(
            agent_id="copilot",
            agent_name="Copilot",
            phase="diagnostic",
            finding="Defect confirmed",
            evidence="Surface crack on housing",
            confidence=0.92,
            citation="preset",
        )
        ev = VisualEvidencePayload(
            preset_id="preset-im05-crack",
            image_url="/presets/evidence/preset_im05_crack.jpg",
            defect_detected=True,
            wear_measurement_mm=None,
        )
        orch.attach_evidence(finding, ev)

    t0 = time.monotonic()
    task = asyncio.create_task(_attach_delayed())
    woke = await orch.wait_for_evidence(timeout=5.0)
    await task
    elapsed = time.monotonic() - t0

    assert woke is True
    assert 0.04 <= elapsed < 0.5


@pytest.mark.asyncio
async def test_wait_gate_times_out_cleanly_when_no_evidence_arrives():
    """When no evidence arrives within the timeout period, wait_for_evidence returns False."""
    orch = Orchestrator()
    orch.arm_evidence_wait()

    t0 = time.monotonic()
    woke = await orch.wait_for_evidence(timeout=0.08)
    elapsed = time.monotonic() - t0

    assert woke is False
    assert elapsed >= 0.07


@pytest.mark.asyncio
async def test_wait_gate_released_immediately_by_cancel():
    """Calling cancel() sets the evidence event so any waiting gate does not hang."""
    orch = Orchestrator()
    orch.arm_evidence_wait()

    async def _cancel_delayed():
        await asyncio.sleep(0.05)
        await orch.cancel()

    t0 = time.monotonic()
    task = asyncio.create_task(_cancel_delayed())
    woke = await orch.wait_for_evidence(timeout=5.0)
    await task
    elapsed = time.monotonic() - t0

    assert woke is True
    assert elapsed < 0.5


@pytest.mark.asyncio
async def test_wait_gate_released_immediately_by_reset():
    """Calling reset() unblocks any pending evidence gate."""
    orch = Orchestrator()
    orch.arm_evidence_wait()

    async def _reset_delayed():
        await asyncio.sleep(0.05)
        await orch.reset()

    t0 = time.monotonic()
    task = asyncio.create_task(_reset_delayed())
    woke = await orch.wait_for_evidence(timeout=5.0)
    await task
    elapsed = time.monotonic() - t0

    assert woke is True
    assert elapsed < 0.5


@pytest.mark.asyncio
async def test_wait_for_evidence_workflow_node_with_adk_state_fast_mode():
    """wait_for_evidence_node with google.adk.sessions.state.State (not dict) skips wait in fast mode."""
    adk_state = State({"trigger": {"mode": "fast"}}, {})
    assert not isinstance(adk_state, dict)
    assert hasattr(adk_state, "get")

    ctx = MagicMock()
    ctx.state = adk_state

    t0 = time.monotonic()
    state_dict = await wait_for_evidence_node(ctx, {})
    elapsed = time.monotonic() - t0

    assert elapsed < 0.1
    assert isinstance(state_dict, dict)
    assert "status" in state_dict


@pytest.mark.asyncio
async def test_wait_gate_rearmed_between_two_rounds():
    """Bug 2: Event must be cleared when entering awaiting_evidence in round 2 so round 2 does not prematurely return."""
    orch = Orchestrator()

    # --- Round 1 ---
    orch.arm_evidence_wait()
    blackboard.update_status("awaiting_evidence")

    finding = AgentFinding(
        agent_id="copilot",
        agent_name="Copilot",
        phase="diagnostic",
        finding="Round 1 evidence",
        evidence="Surface scratch detected",
        confidence=0.90,
        citation="preset",
    )
    orch.attach_evidence(finding, None)

    # In round 1, wait_for_evidence returns True immediately because evidence was attached
    woke_r1 = await orch.wait_for_evidence(timeout=1.0)
    assert woke_r1 is True

    # --- Transition to Round 2 ---
    # When incident re-enters awaiting_evidence for round 2, orchestrator.arm_evidence_wait() is called
    orch.arm_evidence_wait()
    blackboard.update_status("awaiting_evidence")

    # Verify that in round 2, without new evidence, wait_for_evidence blocks and times out cleanly!
    t0 = time.monotonic()
    woke_r2 = await orch.wait_for_evidence(timeout=0.08)
    elapsed_r2 = time.monotonic() - t0

    assert woke_r2 is False
    assert elapsed_r2 >= 0.07

    # --- Now attach evidence in round 2 and verify it wakes immediately ---
    orch.arm_evidence_wait()

    async def _attach_r2():
        await asyncio.sleep(0.04)
        finding_r2 = AgentFinding(
            agent_id="copilot",
            agent_name="Copilot",
            phase="diagnostic",
            finding="Round 2 evidence",
            evidence="Second check complete",
            confidence=0.95,
            citation="preset",
        )
        orch.attach_evidence(finding_r2, None)

    task = asyncio.create_task(_attach_r2())
    woke_r2_attached = await orch.wait_for_evidence(timeout=2.0)
    await task
    assert woke_r2_attached is True


@pytest.mark.asyncio
async def test_full_workflow_fast_mode_with_low_confidence_rca_does_not_hang():
    """Fast mode executes multiple evidence rounds with low-confidence RCA in < 2 seconds."""
    from google.adk.agents import LlmAgent

    prev_model = getattr(LlmAgent, "_default_model", None)
    LlmAgent.set_default_model(MockLlm(rca_confidence=0.50))
    try:
        orch = Orchestrator()
        trigger = DefectInjectionRequest(
            scenario="cnc_tool_wear",
            mode="fast",
            severity="high",
            defect_type="tool_wear",
            machine_id="CNC-02",
        )

        t0 = time.monotonic()
        final_state = await orch.run_incident(trigger)
        elapsed = time.monotonic() - t0

        assert elapsed < 3.0
        assert final_state.status in ("escalated", "repairing", "closed")
    finally:
        if prev_model is not None:
            LlmAgent.set_default_model(prev_model)
        else:
            LlmAgent.set_default_model(MockLlm())


def test_attach_evidence_outside_awaiting_evidence_raises_domain_error():
    """Bug 4: attach_evidence raises EvidenceNotAwaitedError instead of HTTPException."""
    import backend.agents.orchestrator as orch_mod
    orch = orch_mod.Orchestrator()
    blackboard.update_status("normal")

    finding = AgentFinding(
        agent_id="copilot",
        agent_name="Copilot",
        phase="diagnostic",
        finding="Test finding",
        evidence="Test evidence",
        confidence=0.9,
        citation="test",
    )

    with pytest.raises(orch_mod.EvidenceNotAwaitedError, match="not waiting for evidence"):
        orch.attach_evidence(finding)


def test_gemini_live_routes_notify_evidence(monkeypatch: pytest.MonkeyPatch):
    """Bug 3: POST /api/gemini-live/evidence calls orchestrator.notify_evidence."""
    import backend.api.routes_gemini_live as routes_gemini_live

    called = False

    def mock_notify():
        nonlocal called
        called = True

    monkeypatch.setattr(routes_gemini_live.orchestrator, "notify_evidence", mock_notify)
    blackboard.update_status("awaiting_evidence")

    client = TestClient(app)
    file_bytes = bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"0" * 100
    response = client.post(
        "/api/gemini-live/evidence",
        files={"file": ("live_capture.jpg", io.BytesIO(file_bytes), "image/jpeg")},
        data={"notes": "Live frame attached"},
    )
    assert response.status_code == 200
    assert called is True
