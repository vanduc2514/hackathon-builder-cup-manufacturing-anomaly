"""Unit and integration tests for Defect Injection Engine & Fast-Forward Demo Triggers (Issue #26)."""

from __future__ import annotations

import asyncio
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest, SimulationStatusResponse
from simulator.conveyor_simulator import ConveyorSimulator
from simulator.injection_engine import DefectInjectionEngine, injection_engine


@pytest.fixture(autouse=True)
def clean_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[DefectInjectionRequest]]:
    """Restores pristine state; captures workflow triggers instead of running the LLM workflow."""
    started: list[DefectInjectionRequest] = []

    def fake_start(trigger: DefectInjectionRequest) -> bool:
        started.append(trigger)
        return True

    monkeypatch.setattr(orchestrator, "start_incident", fake_start)
    blackboard.reset()
    injection_engine.reset()
    yield started
    blackboard.reset()
    injection_engine.reset()


def test_scenario_1_cnc_tool_wear_injection() -> None:
    """Verifies Scenario 1 triggers CNC-02 mechanical onset (+35% vib, +12% current) and vertical scratches."""
    engine = DefectInjectionEngine()
    result = engine.inject_scenario_1_cnc_tool_wear(
        machine_id="CNC-02", tool_id="T07", severity=1.0
    )

    assert result["scenario"] == "cnc_tool_wear"
    assert result["machine_id"] == "CNC-02"
    assert result["defect_type"] == "scratch_vertical"

    # Verify machine telemetry anomaly
    telemetry = engine.machine_sim.tick()
    by_id = {t.machine_id: t for t in telemetry}
    cnc02 = by_id["CNC-02"]

    assert cnc02.operating_status in ("WARNING", "ALARM")
    assert cnc02.spindle_vibration >= 2.5  # +35% over nominal 2.0
    assert cnc02.motor_current >= 13.0  # +12% over nominal 12.0
    assert cnc02.anomaly_score >= 0.65

    # CNC-01 and CNC-03 should remain normal
    assert by_id["CNC-01"].operating_status == "NORMAL"
    assert by_id["CNC-03"].operating_status == "NORMAL"


def test_scenario_2_im_damp_material_injection() -> None:
    """Verifies Scenario 2 triggers IM-05 dryer dew point rise (-40 C -> -18 C) while machine parameters stay normal."""
    engine = DefectInjectionEngine()
    result = engine.inject_scenario_2_im_damp_material(
        machine_id="IM-05", tool_id="MOLD-03", severity=1.0
    )

    assert result["scenario"] == "im_damp_material"
    assert result["machine_id"] == "IM-05"
    assert result["cavity_id"] == 3

    # Verify machine telemetry
    telemetry = engine.machine_sim.tick()
    by_id = {t.machine_id: t for t in telemetry}
    assert "IM-05" in by_id
    im05 = by_id["IM-05"]

    # Mechanical vibration and current remain normal
    assert im05.spindle_vibration <= 1.0
    assert 15.0 <= im05.motor_current <= 18.0
    # Dryer dew point rises from -40 C to around -18 C
    assert im05.dryer_dew_point is not None
    assert im05.dryer_dew_point >= -22.0
    assert im05.operating_status in ("WARNING", "ALARM")


def test_conveyor_scenario_2_cavity_defects() -> None:
    """Verifies that enabling Scenario 2 on conveyor generates short fill / sink marks on cavity 3."""
    conv = ConveyorSimulator(initial_sequence=5000, include_im=True)
    conv.set_anomaly("IM-05", active=True, scenario="im_damp_material")

    defects_seen = 0
    cavity_3_defects = 0
    for _ in range(80):
        parts = conv.tick()
        for p in parts:
            if p.machine_id == "IM-05" and p.status in ("DEFECT_SHORT_FILL", "DEFECT_SINK_MARK"):
                defects_seen += 1
                if p.cavity_id == 3:
                    cavity_3_defects += 1

    assert defects_seen > 0, "Expected short fill or sink mark defects for IM-05"
    assert cavity_3_defects > 0, "Expected defects on cavity #3"


def test_verification_recovery_mode() -> None:
    """Verifies that gatekeeper recovery mode produces 100% PASS parts and increases pass count."""
    engine = DefectInjectionEngine()
    engine.inject_scenario_1_cnc_tool_wear()
    engine.set_verification_recovery()

    status = engine.get_status()
    assert status["recovery_mode"] is True

    # In recovery mode, zero defects are produced
    for _ in range(25):
        parts = engine.conveyor_sim.tick()
        for p in parts:
            assert p.status == "PASS"

    assert engine.conveyor_sim.consecutive_pass_count >= 25


def test_injection_engine_reset() -> None:
    """Verifies that reset restores pristine state across machines and conveyor."""
    engine = DefectInjectionEngine()
    engine.inject_scenario_1_cnc_tool_wear()
    engine.reset()

    status = engine.get_status()
    assert status["active_scenario"] is None
    assert status["active_machine"] is None
    assert status["recovery_mode"] is False

    telemetry = engine.machine_sim.tick()
    for t in telemetry:
        assert t.operating_status == "NORMAL"


def test_api_simulation_inject_scenario_1() -> None:
    """Verifies POST /api/simulation/inject for Scenario 1."""
    client = TestClient(app)
    response = client.post(
        "/api/simulation/inject",
        json={"scenario": "cnc_tool_wear", "mode": "fast", "machine_id": "CNC-02"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "triggered"
    assert data["scenario"] == "cnc_tool_wear"
    assert data["target_machine"] == "CNC-02"
    assert data["target_tool"] == "T07"


def test_api_simulation_inject_scenario_2() -> None:
    """Verifies POST /api/simulation/inject for Scenario 2."""
    client = TestClient(app)
    response = client.post(
        "/api/simulation/inject",
        json={"scenario": "im_damp_material", "mode": "fast"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "triggered"
    assert data["scenario"] == "im_damp_material"
    assert data["target_machine"] == "IM-05"
    assert data["target_tool"] == "MOLD-03"


def test_api_simulation_reset() -> None:
    """Verifies POST /api/simulation/reset restores Blackboard and buffers."""
    client = TestClient(app)

    # First inject to dirty the state
    client.post("/api/simulation/inject", json={"scenario": "cnc_tool_wear", "mode": "fast"})

    # Reset
    response = client.post("/api/simulation/reset")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "reset"
    assert data["state"]["status"] == "normal"
    assert data["state"]["verification_count"] == 0
    assert len(data["state"]["findings"]) == 0


def test_api_simulation_status() -> None:
    """Verifies GET /api/simulation/status endpoint."""
    client = TestClient(app)
    response = client.get("/api/simulation/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data


def test_api_inject_scenario_2_opens_incident_with_im05_trigger(
    clean_state: list[DefectInjectionRequest],
) -> None:
    """Scenario 2 fills IM-05 defaults the caller left unset, but keeps explicit overrides."""
    client = TestClient(app)
    client.post("/api/simulation/inject", json={"scenario": "im_damp_material", "mode": "fast"})
    client.post(
        "/api/simulation/inject",
        json={"scenario": "im_damp_material", "machine_id": "IM-07", "defect_rate": 0.05},
    )

    default, override = clean_state
    assert (default.machine_id, default.tool_id) == ("IM-05", "MOLD-03")
    assert (default.defect_type, default.defect_rate) == ("short_fill", 0.081)
    assert (override.machine_id, override.defect_rate) == ("IM-07", 0.05)


def test_api_inject_rejected_while_workflow_running(monkeypatch: pytest.MonkeyPatch) -> None:
    """A second inject must not disturb the simulator while an incident is in flight."""
    monkeypatch.setattr(type(orchestrator), "is_running", property(lambda self: True))
    client = TestClient(app)
    response = client.post("/api/simulation/inject", json={"scenario": "cnc_tool_wear"})
    assert response.status_code == 409
    assert injection_engine.get_status()["active_scenario"] is None


def test_orchestrator_status_reports_running_trigger() -> None:
    """Status exposes the started trigger while running and goes idle after cancel."""

    async def scenario() -> tuple[SimulationStatusResponse, SimulationStatusResponse]:
        orch = type(orchestrator)()
        never_done = asyncio.Event()
        orch._abort = asyncio.Event()
        orch._task = asyncio.create_task(never_done.wait())
        orch._trigger = DefectInjectionRequest(scenario="im_damp_material", machine_id="IM-05")
        orch._started_at = 0.0
        running = orch.status()
        orch._task.cancel()
        await asyncio.gather(orch._task, return_exceptions=True)
        await orch.cancel()
        return running, orch.status()

    running, idle = asyncio.run(scenario())
    assert running.status == "running"
    assert running.active_scenario == "im_damp_material"
    assert running.target_machine == "IM-05"
    assert running.elapsed_seconds is not None
    assert idle.status == "idle"
    assert idle.active_scenario is None
