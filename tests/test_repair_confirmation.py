"""Repair-done gate (#321): verification waits for the technician's confirmation."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.agents.orchestrator import RepairNotAwaitedError, orchestrator
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import DefectInjectionRequest
from simulator.injection_engine import injection_engine

TRIGGER = DefectInjectionRequest(
    scenario="cnc_tool_wear",
    machine_id="CNC-02",
    tool_id="T07",
    defect_type="surface_scratch_face_a",
    defect_rate=0.0767,
    mode="fast",
    duration_seconds=5,
)


@pytest.fixture(autouse=True)
def clean():
    asyncio.run(orchestrator.reset())
    injection_engine.reset()
    yield
    asyncio.run(orchestrator.reset())
    injection_engine.reset()


async def _until(predicate, timeout: float = 30.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        assert asyncio.get_running_loop().time() < deadline, blackboard.get_state().status
        await asyncio.sleep(0.02)


@pytest.mark.asyncio
async def test_wait_confirm_verify_closed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "repair_wait_seconds", 30.0)
    injection_engine.inject_scenario_1_cnc_tool_wear(machine_id="CNC-02", tool_id="T07")
    assert orchestrator.start_incident(TRIGGER)

    await _until(lambda: blackboard.get_state().status == "repairing")
    await asyncio.sleep(0.2)
    state = blackboard.get_state()
    assert state.status == "repairing"
    assert state.repair_done is False
    assert state.verification_count == 0

    orchestrator.confirm_repair()
    await _until(lambda: blackboard.get_state().status == "pending_approval")
    final = blackboard.get_state()
    assert final.repair_done is True
    assert final.verification_count >= final.verification_target


@pytest.mark.asyncio
async def test_timeout_escalates(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "repair_wait_seconds", 0.3)
    injection_engine.inject_scenario_1_cnc_tool_wear(machine_id="CNC-02", tool_id="T07")
    assert orchestrator.start_incident(TRIGGER)

    await _until(lambda: blackboard.get_state().status == "escalated")
    state = blackboard.get_state()
    assert state.status_reason == "Technician did not confirm the repair within 0.3 s"
    assert state.repair_done is False


def test_confirm_repair_rejected_outside_wait():
    with pytest.raises(RepairNotAwaitedError):
        orchestrator.confirm_repair()
    response = TestClient(app).post("/api/incidents/repair-done")
    assert response.status_code == 409
    assert "repair confirmation" in response.json()["detail"]


def test_repair_done_route_confirms_when_awaiting():
    blackboard.update_status("repairing", repair_done=False)
    response = TestClient(app).post("/api/incidents/repair-done")
    assert response.status_code == 200
    assert response.json()["state"]["status"] == "repairing"
