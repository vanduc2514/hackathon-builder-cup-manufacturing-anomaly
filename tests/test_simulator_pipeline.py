"""Integration and verification tests for the Factory & Conveyor Simulator Telemetry Pipeline.

Validates offline dry-run mode, MQTT broker absence resilience, discrete part
serialization, optical inspection generation, and anomaly injection triggers.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from unittest.mock import MagicMock

from simulator.conveyor_simulator import ConveyorSimulator
from simulator.injection_engine import DefectInjectionEngine
from simulator.main import FactorySimulatorService
from simulator.models import ConveyorPart, MachineTelemetry
from simulator.mqtt_publisher import MqttPublisher


def test_dry_run_mode_offline() -> None:
    """Verifies that simulator runs offline without network broker dependencies."""
    service = FactorySimulatorService(speed=10.0, dry_run=True, inject_on_start=False, seed=123)
    assert service.publisher.dry_run is True
    assert not service.publisher.is_connected

    # Step simulation
    summary = asyncio.run(service.step())
    assert summary.tick_index == 1
    assert len(summary.telemetry) == 3
    assert len(summary.parts) >= 1

    # Verify no network socket was opened and service stops cleanly
    service.stop()
    assert service._stopped is True


def test_mqtt_publisher_broker_absent_fallback() -> None:
    """Verifies MQTT publisher handles missing broker gracefully without crashing."""
    pub = MqttPublisher(dry_run=False)

    # When broker is absent, publisher should report not connected
    assert not pub.is_connected

    # Publishing while disconnected should not raise exceptions
    telemetry = [
        MachineTelemetry(
            machine_id="CNC-01",
            tool_id="T04",
            spindle_vibration=2.01,
            motor_current=12.05,
            spindle_temp=42.1,
            rpm=1480,
            operating_status="NORMAL",
            anomaly_score=0.03,
        )
    ]
    parts = [
        ConveyorPart(
            product_id="PRD-1001",
            machine_id="CNC-01",
            tool_id="T04",
            lot_id="AL-5083-B4",
            status="PASS",
        )
    ]

    # Verify safe execution
    pub.publish_telemetry(telemetry)
    pub.publish_parts(parts)

    # Idempotent teardown
    pub.close()
    assert pub._closed is True
    pub.close()  # Repeated call must not error


def test_mqtt_publisher_connected_publish() -> None:
    """Verifies MQTT publisher invokes paho client when connected."""
    pub = MqttPublisher(dry_run=True)  # Avoid connecting real socket
    mock_client = MagicMock()
    pub.client = mock_client
    pub.connected = True
    pub.dry_run = False  # Switch to test connected branch

    telemetry = [
        MachineTelemetry(
            machine_id="CNC-02",
            tool_id="T07",
            spindle_vibration=2.75,
            motor_current=13.5,
            spindle_temp=44.5,
            rpm=1465,
            operating_status="ALARM",
            anomaly_score=0.92,
        )
    ]
    pub.publish_telemetry(telemetry)
    assert mock_client.publish.called

    parts = [
        ConveyorPart(
            product_id="PRD-1002",
            machine_id="CNC-02",
            tool_id="T07",
            lot_id="AL-5083-B4",
            status="DEFECT_SCRATCH",
            defect_type="scratch_vertical",
        )
    ]
    pub.publish_parts(parts)
    assert mock_client.publish.call_count >= 2

    pub.close()
    assert mock_client.disconnect.called


def test_discrete_part_serialization_sequence() -> None:
    """Verifies part serialization sequencing, lot numbers, tooling, and image tokens."""
    conv = ConveyorSimulator(initial_sequence=5000, seed=10)

    emitted_ids: list[str] = []
    for _ in range(10):
        parts = conv.tick()
        for p in parts:
            assert p.product_id.startswith("PRD-")
            assert int(p.product_id.split("-")[1]) >= 5000
            assert p.lot_id in ("AL-5083-B4", "PA66-GF30-L12")
            assert p.status in (
                "PASS",
                "DEFECT_SCRATCH",
                "DEFECT_SHORT_FILL",
                "DEFECT_SINK_MARK",
                "DEFECT_OTHER",
            )
            assert 0.0 <= p.confidence <= 1.0
            if p.status == "PASS":
                assert "good" in (p.image_token or "")
            emitted_ids.append(p.product_id)

    # Ensure strictly increasing unique sequences
    seq_nums = [int(pid.split("-")[1]) for pid in emitted_ids]
    assert seq_nums == sorted(seq_nums)
    assert len(set(seq_nums)) == len(seq_nums)


def test_optical_inspection_scenario_1_cnc_tool_wear() -> None:
    """Verifies Scenario 1 defect burst injection for CNC-02 tool wear."""
    engine = DefectInjectionEngine(seed=42)
    burst = engine.inject_scenario_1_cnc_tool_wear(machine_id="CNC-02", severity=1.0)

    assert burst["scenario"] == "cnc_tool_wear"
    assert burst["machine_id"] == "CNC-02"
    assert burst["vibration_delta"] == "+35%"

    # Verify machine telemetry anomaly
    telemetry = engine.machine_sim.tick()
    cnc02 = next(t for t in telemetry if t.machine_id == "CNC-02")
    cnc01 = next(t for t in telemetry if t.machine_id == "CNC-01")

    assert cnc02.operating_status in ("WARNING", "ALARM")
    assert cnc02.spindle_vibration >= 2.5
    assert cnc02.motor_current >= 13.0
    assert cnc02.anomaly_score >= 0.65

    # CNC-01 remains baseline
    assert cnc01.operating_status == "NORMAL"
    assert cnc01.spindle_vibration < 2.3

    # Verify optical inspection defect emission
    defects = []
    for _ in range(50):
        parts = engine.conveyor_sim.tick()
        for p in parts:
            if p.machine_id == "CNC-02" and p.status == "DEFECT_SCRATCH":
                assert p.defect_type == "scratch_vertical"
                assert "scratch" in (p.image_token or "")
                defects.append(p)

    assert len(defects) > 0, "Scenario 1 must emit scratch defects on CNC-02"


def test_optical_inspection_scenario_2_im_damp_material() -> None:
    """Verifies Scenario 2 defect burst injection for IM-05 mold damp material."""
    engine = DefectInjectionEngine(seed=42)
    burst = engine.inject_scenario_2_im_damp_material(machine_id="IM-05", severity=1.0)

    assert burst["scenario"] == "im_damp_material"
    assert burst["machine_id"] == "IM-05"
    assert burst["dew_point_delta"] == "-40°C -> -18°C"

    # Verify machine telemetry
    telemetry = engine.machine_sim.tick()
    im05 = next(t for t in telemetry if t.machine_id == "IM-05")

    # Mechanical params normal, dew point spiked
    assert im05.spindle_vibration < 1.0  # IM has base vibration ~0.8 mm/s
    assert im05.dryer_dew_point is not None
    assert im05.dryer_dew_point >= -20.0  # Spiked from -40 C towards -18 C
    assert im05.operating_status in ("WARNING", "ALARM")

    # Verify optical inspection defect emission (cavity 3 short fill / sink mark)
    defects = []
    for _ in range(50):
        parts = engine.conveyor_sim.tick()
        for p in parts:
            if p.machine_id == "IM-05" and p.status in ("DEFECT_SHORT_FILL", "DEFECT_SINK_MARK"):
                assert p.cavity_id == 3
                assert p.defect_type in ("short_fill", "sink_mark")
                defects.append(p)

    assert len(defects) > 0, "Scenario 2 must emit cavity #3 short fill or sink mark defects"


def test_injection_engine_reset_baseline() -> None:
    """Verifies resetting injected defects restores nominal telemetry baselines."""
    engine = DefectInjectionEngine(seed=100)
    engine.inject_scenario_1_cnc_tool_wear(machine_id="CNC-02")
    engine.reset()

    telemetry = engine.machine_sim.tick()
    for t in telemetry:
        assert t.operating_status == "NORMAL"
        assert t.spindle_vibration < 2.3
        assert t.anomaly_score < 0.20


def test_gatekeeper_recovery_mode() -> None:
    """Verifies that gatekeeper recovery mode produces 100% consecutive passing parts."""
    conv = ConveyorSimulator(seed=99)
    conv.set_anomaly("CNC-02", active=True)
    conv.set_recovery_mode(True)

    for _ in range(50):
        parts = conv.tick()
        for p in parts:
            assert p.status == "PASS"
            assert p.defect_type is None

    assert conv.consecutive_pass_count >= 50


def test_factory_service_bounded_ticks() -> None:
    """Verifies that max_ticks terminates the loop automatically without leaking tasks."""
    service = FactorySimulatorService(speed=50.0, dry_run=True, seed=1)
    asyncio.run(service.run(max_ticks=4))

    assert service.tick_count == 4
    assert service._stopped is True


def test_cli_execution_with_arguments() -> None:
    """Verifies simulator execution via CLI with flags completes cleanly."""
    cmd = [
        sys.executable,
        "-m",
        "simulator.main",
        "--dry-run",
        "--speed",
        "20",
        "--ticks",
        "3",
        "--seed",
        "42",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

    assert res.returncode == 0
    assert "Starting Factory Simulator" in res.stderr or "Starting Factory Simulator" in res.stdout
    assert "Tick #1" in res.stderr or "Tick #1" in res.stdout
    assert (
        "Reached maximum requested ticks (3)" in res.stderr
        or "Reached maximum requested ticks (3)" in res.stdout
    )
