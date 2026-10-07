"""Unit and integration tests for Defect Injection Engine & Fast-Forward Demo Triggers (Issue #26)."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest
from simulator.conveyor_simulator import ConveyorSimulator
from simulator.injection_engine import DefectInjectionEngine, injection_engine


@pytest.fixture(autouse=True)
def clean_state():
    """Restores pristine state before and after each test."""
    blackboard.reset()
    injection_engine.reset()
    orchestrator.stop_simulation()
    yield
    blackboard.reset()
    injection_engine.reset()
    orchestrator.stop_simulation()


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


def test_orchestrator_fast_forward_scenario_1() -> None:
    """Tests complete 4-phase incident lifecycle for Scenario 1 in fast-forward mode."""
    blackboard.reset()
    req = DefectInjectionRequest(scenario="cnc_tool_wear", mode="fast", duration_seconds=0.5)
    asyncio.run(orchestrator.run_incident_simulation(req=req))

    state = blackboard.get_state()
    assert state.status == "closed"
    assert state.verification_count == 50
    assert len(state.findings) == 8
    assert state.impact is not None
    assert state.impact.scrap_avoided == 240


def test_orchestrator_fast_forward_scenario_2() -> None:
    """Tests complete 4-phase incident lifecycle for Scenario 2 in fast-forward mode."""
    blackboard.reset()
    req = DefectInjectionRequest(scenario="im_damp_material", mode="fast", duration_seconds=0.5)
    asyncio.run(orchestrator.run_incident_simulation(req=req))

    state = blackboard.get_state()
    assert state.status == "closed"
    assert state.verification_count == 50
    assert len(state.findings) == 8
    assert state.impact is not None
    assert state.impact.scrap_avoided == 320
    # Findings should cite IM-05, mold cavity #3, or dew point
    citations = " ".join(f.finding + " " + f.evidence for f in state.findings)
    assert "IM-05" in citations or "cavity #3" in citations
