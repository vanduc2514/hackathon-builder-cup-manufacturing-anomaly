"""Unit tests for the standalone Factory and Conveyor Simulator."""

from __future__ import annotations

import asyncio
import math
from pathlib import Path

from simulator.conveyor_simulator import ConveyorSimulator
from simulator.csv_replay import CSVTelemetrySource, parse_competition_timestamp
from simulator.machine_simulator import MachineSimulator
from simulator.main import FactorySimulatorService
from simulator.models import ConveyorPart, MachineTelemetry
from simulator.server import FactoryServerService


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
    sim = MachineSimulator(seed=42)
    sim.inject_anomaly("CNC-02", severity=1.0)
    telemetry = sim.tick()

    by_id = {t.machine_id: t for t in telemetry}

    # CNC-02 should exhibit +35% vibration spike and ALARM state
    cnc02 = by_id["CNC-02"]
    assert cnc02.operating_status in ("WARNING", "ALARM")
    assert cnc02.spindle_vibration >= 2.5
    assert cnc02.motor_current >= 12.8
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


# ---------------------------------------------------------------------------
# TKT-071 / issue #269 — CSV telemetry replay (5 tests)
# ---------------------------------------------------------------------------

_COMP_DIR = Path(__file__).resolve().parents[1] / "data" / "datasets" / "competition"
_NORMAL_CSV = _COMP_DIR / "normal_machine_operating_data_1000_with_timestamp.csv"
_ABNORMAL_CSV = _COMP_DIR / "abnormal_machine_operating_data_1000.csv"


def test_csv_replay_determinism():
    """Two iterators over the same source produce identical rows in identical order."""
    src_a = CSVTelemetrySource(_NORMAL_CSV)
    src_b = CSVTelemetrySource(_NORMAL_CSV)

    rows_a = [src_a.next() for _ in range(10)]
    rows_b = [src_b.next() for _ in range(10)]

    for ra, rb in zip(rows_a, rows_b):
        assert ra.timestamp == rb.timestamp
        assert math.isclose(ra.speed, rb.speed, rel_tol=1e-9)
        assert math.isclose(ra.temperature, rb.temperature, rel_tol=1e-9)
        assert math.isclose(ra.vibration, rb.vibration, rel_tol=1e-9)
        assert math.isclose(ra.current_percent, rb.current_percent, rel_tol=1e-9)


def test_csv_replay_timestamp_formats():
    """Both competition timestamp formats parse without raising."""
    # Short format from the normal CSV
    short = _NORMAL_CSV.read_text(encoding="utf-8-sig").splitlines()[1].split(",")[0]
    parsed_short = parse_competition_timestamp(short)
    assert parsed_short.year == 2026
    assert parsed_short.month == 10
    assert parsed_short.day == 1
    assert parsed_short.hour == 8

    # Long format from the abnormal CSV
    long_fmt = _ABNORMAL_CSV.read_text(encoding="utf-8-sig").splitlines()[1].split(",")[0]
    parsed_long = parse_competition_timestamp(long_fmt)
    assert parsed_long.year == 2026
    assert parsed_long.month == 10
    assert parsed_long.day == 1
    assert parsed_long.hour == 9
    assert parsed_long.minute == 0
    assert parsed_long.second == 0


def test_csv_replay_to_competition_payload():
    """CSV row maps to the canonical nested competition JSON envelope."""
    src = CSVTelemetrySource(_ABNORMAL_CSV)
    # Abnormal CSV rows all have alarm_code populated and operating_status=FAULT
    row = src.peek()
    assert row is not None
    # Force a known cursor position so runtime_hours is deterministic.
    src._cursor = 120
    row = src.next()
    assert row is not None

    payload = src.to_competition_payload(row, row_index=119)

    # Structural assertions per AI-sensor-spec.md
    assert set(payload.keys()) == {"timestamp", "asset", "operating", "sensor", "health"}
    assert payload["asset"]["machine_id"] == "MOTOR_01"
    assert payload["asset"]["factory_id"] == "FACTORY_01"
    assert payload["asset"]["line_id"] == "LINE_01"

    sensor = payload["sensor"]
    assert math.isclose(sensor["rpm"]["value"], int(round(row.speed)))
    assert math.isclose(sensor["temperature"]["value"], float(row.temperature))
    assert math.isclose(sensor["current"]["value"], round(row.current_percent * 0.123, 3))
    assert math.isclose(sensor["vibration"]["value"], float(row.vibration))

    assert math.isclose(payload["operating"]["load_percent"], float(row.load_percent))
    assert payload["operating"]["status"] == "FAULT"  # the row came from abnormal CSV
    # runtime_hours = 1200 + row_index // 60 = 1200 + 119 // 60 = 1200 + 1 = 1201
    assert payload["operating"]["runtime_hours"] == 1201

    health = payload["health"]
    assert health["status"] == "ANOMALY"
    # alarm_code populated → 0.65 + min(alarm_code/100, 0.33)
    if row.alarm_code is not None:
        expected_score = round(0.65 + min(row.alarm_code / 100.0, 0.33), 3)
        assert math.isclose(health["anomaly_score"], expected_score)


def test_machine_simulator_replay_mode():
    """MachineSimulator in replay mode emits one CSV-derived record per tick."""
    sim = MachineSimulator()
    sim.set_replay_source(CSVTelemetrySource(_ABNORMAL_CSV))
    assert sim.is_replay_mode is True

    first_tick = sim.tick()
    assert len(first_tick) >= 1, "Replay tick must yield at least one MachineTelemetry"
    by_id = {t.machine_id: t for t in first_tick}

    assert "CNC-01" in by_id, "CNC-01 must be present in replay mode"
    cnc01 = by_id["CNC-01"]
    assert isinstance(cnc01, MachineTelemetry)
    # Abnormal CSV rows have FAULT operating_status → health.status=ANOMALY → ALARM
    assert cnc01.operating_status == "ALARM"
    # speed (rpm) is a positive integer; vibration is positive mm/s
    assert cnc01.rpm > 0
    assert cnc01.spindle_vibration > 0
    assert cnc01.motor_current > 0

    # Clear replay and verify synthetic mode resumes unchanged.
    sim.clear_replay_source()
    assert sim.is_replay_mode is False
    baseline = sim.tick()
    cnc01_synth = next(t for t in baseline if t.machine_id == "CNC-01")
    assert cnc01_synth.operating_status == "NORMAL"


def test_server_replay_mode_integration():
    """FactoryServerService with csv_replay_path exposes CSV-derived telemetry through step()."""
    service = FactoryServerService(
        interval_sec=0.05,
        speed=10.0,
        csv_replay_path=_NORMAL_CSV,
    )
    try:
        assert service.csv_replay_path == _NORMAL_CSV
        assert service.injection_engine.machine_sim.is_replay_mode

        packet = asyncio.run(service.step())
        by_id = {t.machine_id: t for t in packet.telemetry}
        assert "CNC-01" in by_id
        cnc01 = by_id["CNC-01"]
        # Normal CSV rows have operating_status=RUNNING → health.status=NORMAL
        assert cnc01.operating_status == "NORMAL"
        assert cnc01.rpm > 0
    finally:
        service.stop()


# ---------------------------------------------------------------------------
# Factory Server Auth & require_api_key tests
# ---------------------------------------------------------------------------


def test_require_api_key_valid_key(monkeypatch):
    """X-API-Key matching settings.factory_api_key passes require_api_key."""
    from simulator.config import settings
    from simulator.server import require_api_key

    monkeypatch.setattr(settings, "factory_api_key", "test-secret-key-123")
    monkeypatch.setattr(settings, "app_env", "production")

    # Should not raise
    require_api_key(x_api_key="test-secret-key-123")


def test_require_api_key_valid_jwt(monkeypatch):
    """Valid Bearer JWT token passes require_api_key."""
    from datetime import datetime, timedelta, timezone

    import jwt

    from simulator.config import settings
    from simulator.server import require_api_key

    monkeypatch.setattr(settings, "factory_api_key", "test-secret-key-123")
    monkeypatch.setattr(settings, "auth_secret", "jwt-secret-456")
    monkeypatch.setattr(settings, "app_env", "production")

    token = jwt.encode(
        {"sub": "technician", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "jwt-secret-456",
        algorithm="HS256",
    )

    # Should not raise with valid Bearer token even without X-API-Key
    require_api_key(authorization=f"Bearer {token}")


def test_require_api_key_unauthorized(monkeypatch):
    """Missing or invalid credentials raise 401."""
    import pytest
    from fastapi import HTTPException

    from simulator.config import settings
    from simulator.server import require_api_key

    monkeypatch.setattr(settings, "factory_api_key", "test-secret-key-123")
    monkeypatch.setattr(settings, "auth_secret", "jwt-secret-456")
    monkeypatch.setattr(settings, "app_env", "production")

    with pytest.raises(HTTPException) as exc_info:
        require_api_key(x_api_key="wrong-key")
    assert exc_info.value.status_code == 401


def test_simulator_auth_endpoints_fallback():
    """Simulator app exposes /api/auth/accounts and /api/auth/login."""
    from fastapi.testclient import TestClient

    from simulator.server import app

    client = TestClient(app)

    # 1. Accounts list
    acc_res = client.get("/api/auth/accounts")
    assert acc_res.status_code == 200
    accounts = acc_res.json()
    assert isinstance(accounts, list)
    assert any(a["username"] == "technician" for a in accounts)

    # 2. Login with valid dev credentials
    login_res = client.post(
        "/api/auth/login",
        json={"username": "technician", "password": "4NpqbcqiOB4v9Ry6"},
    )
    assert login_res.status_code == 200
    data = login_res.json()
    assert "token" in data
    assert data["user"]["username"] == "technician"

    # 3. Login with wrong password
    bad_res = client.post(
        "/api/auth/login",
        json={"username": "technician", "password": "wrong-password"},
    )
    assert bad_res.status_code == 401
