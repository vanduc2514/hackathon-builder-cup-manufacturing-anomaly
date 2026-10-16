"""Unit and integration tests for Orchestrator evidence wait gate."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import MagicMock

import pytest

from backend.agents.orchestrator import Orchestrator
from backend.agents.workflow_nodes import wait_for_evidence_node
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import AgentFinding, DefectInjectionRequest, VisualEvidencePayload


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


@pytest.mark.asyncio
async def test_wait_gate_fast_mode_does_not_wait():
    """In fast mode, wait_for_evidence returns immediately without blocking."""
    orch = Orchestrator()
    orch._trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        mode="fast",
        severity="medium",
        defect_type="tool_wear",
        machine_id="CNC-02",
    )

    t0 = time.monotonic()
    result = await orch.wait_for_evidence()
    elapsed = time.monotonic() - t0

    assert elapsed < 0.1
    assert result is False


@pytest.mark.asyncio
async def test_wait_gate_zero_timeout_does_not_wait(monkeypatch: pytest.MonkeyPatch):
    """When settings.evidence_wait_seconds <= 0, wait_for_evidence returns immediately."""
    monkeypatch.setattr(settings, "evidence_wait_seconds", 0.0)
    orch = Orchestrator()
    orch._trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        mode="demo",
        severity="medium",
        defect_type="tool_wear",
        machine_id="CNC-02",
    )

    t0 = time.monotonic()
    result = await orch.wait_for_evidence()
    elapsed = time.monotonic() - t0

    assert elapsed < 0.1
    assert result is False


@pytest.mark.asyncio
async def test_wait_gate_wakes_immediately_on_evidence_arrival():
    """When evidence is attached, the waiting event unblocks immediately."""
    orch = Orchestrator()
    orch._trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        mode="demo",
        severity="medium",
        defect_type="tool_wear",
        machine_id="CNC-02",
    )
    blackboard.update_status("awaiting_evidence")

    async def _attach_delayed():
        await asyncio.sleep(0.05)
        finding = AgentFinding(
            agent_id="copilot",
            agent_name="Copilot",
            phase="diagnostic",
            finding="Defect confirmed",
            evidence="Flank wear 0.38",
            confidence=0.92,
            citation="preset",
        )
        ev = VisualEvidencePayload(
            preset_id="preset-flank-wear-vb38",
            image_url="/presets/evidence/preset_flank_wear_vb38.jpg",
            defect_detected=True,
            wear_measurement_mm=0.38,
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
    orch._trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        mode="demo",
        severity="medium",
        defect_type="tool_wear",
        machine_id="CNC-02",
    )

    t0 = time.monotonic()
    woke = await orch.wait_for_evidence(timeout=0.08)
    elapsed = time.monotonic() - t0

    assert woke is False
    assert elapsed >= 0.07


@pytest.mark.asyncio
async def test_wait_gate_released_immediately_by_cancel():
    """Calling cancel() sets the evidence event so any waiting gate does not hang."""
    orch = Orchestrator()
    orch._trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        mode="demo",
        severity="medium",
        defect_type="tool_wear",
        machine_id="CNC-02",
    )

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
    orch._trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        mode="demo",
        severity="medium",
        defect_type="tool_wear",
        machine_id="CNC-02",
    )

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
async def test_wait_for_evidence_workflow_node_with_fast_mode():
    """wait_for_evidence_node returns blackboard state without blocking in fast mode."""
    ctx = MagicMock()
    ctx.state = {"trigger": {"mode": "fast"}}

    t0 = time.monotonic()
    state_dict = await wait_for_evidence_node(ctx, {})
    elapsed = time.monotonic() - t0

    assert elapsed < 0.1
    assert isinstance(state_dict, dict)
    assert "status" in state_dict
