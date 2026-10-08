"""Tests for Demo Simulation Controller & Physical Streak Counter (Issue #37).

Validates:
1. Scenario Injection Triggers (Scenario 1 CNC-02 & Scenario 2 IM-05).
2. Timing mode configuration ('demo' 90s vs 'fast' ~8s).
3. Physical Streak Counter progress and completion at target (50/50).
4. Streak reset on defect recurrence proving closed-loop gatekeeper integrity.
5. Pristine simulation environment reset.
6. SimulationStatusResponse API contract.
"""

from __future__ import annotations

import asyncio
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from google.adk.agents import LlmAgent

from backend.agents.orchestrator import Orchestrator, orchestrator
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest, SimulationStatusResponse
from backend.tools.spc_calculator import StreakGatekeeper
from simulator.injection_engine import injection_engine
from tests.test_orchestrator import FakeLlm


@pytest.fixture(autouse=True)
def clean_test_environment() -> Generator[None, None, None]:
    """Ensures clean blackboard and simulator state before and after each test."""
    blackboard.reset()
    injection_engine.reset()
    orchestrator.stop_simulation()
    yield
    blackboard.reset()
    injection_engine.reset()
    orchestrator.stop_simulation()


def test_simulation_status_contract_idle() -> None:
    """Verifies GET /api/simulation/status contract when idle."""
    client = TestClient(app)
    response = client.get("/api/simulation/status")
    assert response.status_code == 200

    data = response.json()
    status_obj = SimulationStatusResponse(**data)
    assert status_obj.status == "idle"
    assert status_obj.active_scenario is None
    assert status_obj.elapsed_seconds is None


def test_scenario_1_cnc_injection_fast_mode() -> None:
    """Verifies POST /api/simulation/inject for CNC-02 tool wear in fast mode."""
    client = TestClient(app)
    payload = {
        "scenario": "cnc_tool_wear",
        "mode": "fast",
        "machine_id": "CNC-02",
        "tool_id": "T07",
    }
    response = client.post("/api/simulation/inject", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "triggered"
    assert data["scenario"] == "cnc_tool_wear"
    assert data["mode"] == "fast"
    assert data["target_machine"] == "CNC-02"
    assert data["target_tool"] == "T07"
    assert "burst_telemetry" in data
    assert "UCL" in data["message"]


def test_scenario_2_im_injection_demo_mode() -> None:
    """Verifies POST /api/simulation/inject for IM-05 damp material in demo mode."""
    client = TestClient(app)
    payload = {
        "scenario": "im_damp_material",
        "mode": "demo",
        "machine_id": "IM-05",
        "tool_id": "MOLD-03",
    }
    response = client.post("/api/simulation/inject", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "triggered"
    assert data["scenario"] == "im_damp_material"
    assert data["mode"] == "demo"
    assert data["target_machine"] == "IM-05"
    assert data["target_tool"] == "MOLD-03"
    assert data["duration_seconds"] == 90.0
    assert (
        "dryer dew point" in data["message"].lower() or "mold cavity #3" in data["message"].lower()
    )


def test_simulation_reset_restores_baseline() -> None:
    """Verifies POST /api/simulation/reset restores all components to pristine baseline."""
    client = TestClient(app)

    # First inject to put simulation in active state
    client.post(
        "/api/simulation/inject",
        json={"scenario": "cnc_tool_wear", "mode": "fast"},
    )

    # Now reset
    response = client.post("/api/simulation/reset")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "reset"
    assert data["state"]["status"] == "normal"
    assert data["state"]["verification_count"] == 0
    assert data["state"]["suspect_machine"] is None
    assert len(data["state"]["findings"]) == 0

    # Status endpoint should now report idle
    status_res = client.get("/api/simulation/status")
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "idle"


def test_physical_streak_progression_and_completion() -> None:
    """Verifies physical streak counter accumulates to target (50/50) and closes incident."""
    blackboard.reset()
    blackboard.update_status(
        "verifying",
        verification_count=0,
        verification_target=50,
    )
    gk = StreakGatekeeper(target=50)

    # Increment streak in batches
    for _ in range(1, 51):
        res = gk.record_sample(is_defect=False)
        blackboard.update_status("verifying", verification_count=res.good_streak)

    state = blackboard.get_state()
    assert state.verification_count == 50
    assert gk.is_verified is True


def test_physical_streak_reset_on_defect_recurrence() -> None:
    """Verifies that an injected defect during verification immediately resets the streak to 0."""
    blackboard.reset()
    gk = StreakGatekeeper(target=50)

    # Accumulate 28 verified defect-free parts
    for _ in range(28):
        gk.record_sample(is_defect=False)
    blackboard.update_status("verifying", verification_count=gk.current_streak)

    state_before = blackboard.get_state()
    assert state_before.verification_count == 28

    # A defect occurs!
    res = gk.record_sample(is_defect=True)
    assert res.verified is False
    assert res.good_streak == 0
    assert gk.current_streak == 0

    # Blackboard reflects streak reset
    blackboard.update_status("investigating", verification_count=0)
    state_after = blackboard.get_state()
    assert state_after.verification_count == 0
    assert state_after.status == "investigating"


def test_e2e_fast_forward_verifies_streak_and_closure() -> None:
    """Tests that fast-forward orchestration achieves 50/50 physical streak and closed state."""
    blackboard.reset()
    saved_model = LlmAgent._default_model
    try:
        LlmAgent.set_default_model(FakeLlm())
        req = DefectInjectionRequest(scenario="cnc_tool_wear", mode="fast", duration_seconds=0.2)
        asyncio.run(Orchestrator(step_delay=0).run_incident(req))

        state = blackboard.get_state()
        assert state.status == "closed"
        assert state.verification_count == 50
        assert state.verification_target == 50
        assert len(state.findings) >= 7
        assert state.repair_done is True
    finally:
        LlmAgent._default_model = saved_model
