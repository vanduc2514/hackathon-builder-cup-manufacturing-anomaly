"""Unit tests for the standalone Factory and Conveyor Simulator."""

from __future__ import annotations

import asyncio

from simulator.conveyor_simulator import ConveyorSimulator
from simulator.machine_simulator import MachineSimulator
from simulator.main import FactorySimulatorService
from simulator.models import ConveyorPart, MachineTelemetry


def test_machine_simulator_baseline() -> None:
    """Verifies nominal operating parameters across CNC-01, CNC-02, and CNC-03."""
    sim = MachineSimulator()
    telemetry = sim.tick()

    assert len(telemetry) == 3
    machine_ids = {t.machine_id for t in telemetry}
    assert machine_ids == {"CNC-01", "CNC-02", "CNC-03"}

    for t in telemetry:
        assert isinstance(t, MachineTelemetry)
        assert t.operating_status == "NORMAL"
        assert 1.7 <= t.spindle_vibration <= 2.3
        assert 11.0 <= t.motor_current <= 13.0
        assert 40.0 <= t.spindle_temp <= 44.0
        assert 1460 <= t.rpm <= 1500


def test_machine_simulator_anomaly_injection() -> None:
    """Verifies that injecting an anomaly into CNC-02 increases vibration and triggers alarm."""
    sim = MachineSimulator()
    sim.inject_anomaly("CNC-02", severity=1.0)
    telemetry = sim.tick()

    by_id = {t.machine_id: t for t in telemetry}

    # CNC-02 should exhibit +35% vibration spike and ALARM state
    cnc02 = by_id["CNC-02"]
    assert cnc02.operating_status in ("WARNING", "ALARM")
    assert cnc02.spindle_vibration >= 2.5
    assert cnc02.motor_current >= 13.0
    assert cnc02.anomaly_score >= 0.65

    # CNC-01 and CNC-03 should remain normal
    assert by_id["CNC-01"].operating_status == "NORMAL"
    assert by_id["CNC-03"].operating_status == "NORMAL"


def test_machine_simulator_reset() -> None:
    """Verifies that reset returns machines to baseline."""
    sim = MachineSimulator()
    sim.inject_anomaly("CNC-02")
    sim.reset()
    telemetry = sim.tick()

    by_id = {t.machine_id: t for t in telemetry}
    assert by_id["CNC-02"].operating_status == "NORMAL"
    assert by_id["CNC-02"].spindle_vibration < 2.4


def test_conveyor_simulator_serialization() -> None:
    """Verifies serialization sequence and field formatting of conveyor items."""
    conv = ConveyorSimulator(initial_sequence=2000)
    parts = conv.tick()

    assert len(parts) >= 1
    for p in parts:
        assert isinstance(p, ConveyorPart)
        assert p.product_id.startswith("PRD-")
        assert p.machine_id in ["CNC-01", "CNC-02", "CNC-03"]
        assert p.lot_id == "AL-5083-B4"
        assert p.status in ["PASS", "DEFECT_SCRATCH", "DEFECT_OTHER"]


def test_conveyor_simulator_anomaly() -> None:
    """Verifies that enabling defect generation produces scratch defects for CNC-02."""
    conv = ConveyorSimulator(initial_sequence=3000, seed=42)
    conv.set_anomaly("CNC-02", active=True)

    defects_seen = 0
    # Simulate enough parts to observe defects
    for _ in range(50):
        parts = conv.tick()
        for p in parts:
            if p.machine_id == "CNC-02" and p.status == "DEFECT_SCRATCH":
                defects_seen += 1
                assert p.defect_type == "scratch_vertical"

    assert defects_seen > 0, "Expected at least one scratch defect under anomaly condition"


def test_factory_service_step() -> None:
    """Verifies that the factory service executes single steps correctly."""
    service = FactorySimulatorService(speed=10.0, dry_run=True, inject_on_start=False)
    summary = asyncio.run(service.step())

    assert summary.tick_index == 1
    assert len(summary.telemetry) == 3
    assert len(summary.parts) >= 1
    service.stop()
