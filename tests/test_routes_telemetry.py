"""Tests for multi-machine sensor telemetry endpoints and correlation series."""

from __future__ import annotations

from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import MultiMachineTelemetryResponse, TelemetryPoint

client = TestClient(app)


def test_get_telemetry_history_contains_three_machines():
    """Verify telemetry history returns series for CNC-01, CNC-02, and CNC-03."""
    response = client.get("/api/telemetry/history")
    assert response.status_code == 200

    data = response.json()
    assert "series" in data
    assert "CNC-01" in data["series"]
    assert "CNC-02" in data["series"]
    assert "CNC-03" in data["series"]

    # Verify model validation works
    parsed = MultiMachineTelemetryResponse.model_validate(data)
    assert len(parsed.series["CNC-01"]) > 0
    assert len(parsed.series["CNC-02"]) > 0
    assert len(parsed.series["CNC-03"]) > 0


def test_cnc02_vibration_spike_at_0930():
    """Verify CNC-02 reflects +35% vibration spike onset at 09:30 while baselines remain normal."""
    response = client.get("/api/telemetry/history")
    assert response.status_code == 200
    data = response.json()

    cnc02_points = data["series"]["CNC-02"]
    cnc01_points = data["series"]["CNC-01"]
    cnc03_points = data["series"]["CNC-03"]

    # Find the 09:30 point for CNC-02
    p0930_cnc02 = next((p for p in cnc02_points if "09:30" in p["timestamp"]), None)
    assert p0930_cnc02 is not None
    assert p0930_cnc02["vibration_mm_s"] >= 2.00  # Baseline is 1.50 -> 2.15 is +35%
    assert p0930_cnc02["is_anomalous"] is True

    # Check baseline machines at 09:30
    p0930_cnc01 = next((p for p in cnc01_points if "09:30" in p["timestamp"]), None)
    p0930_cnc03 = next((p for p in cnc03_points if "09:30" in p["timestamp"]), None)

    assert p0930_cnc01 is not None
    assert p0930_cnc01["vibration_mm_s"] <= 1.55
    assert p0930_cnc01["is_anomalous"] is False

    assert p0930_cnc03 is not None
    assert p0930_cnc03["vibration_mm_s"] <= 1.55
    assert p0930_cnc03["is_anomalous"] is False


def test_get_telemetry_history_filter_machine():
    """Verify machine_id filter returns only the requested machine series."""
    response = client.get("/api/telemetry/history?machine_id=CNC-02")
    assert response.status_code == 200
    data = response.json()

    assert "CNC-02" in data["series"]
    assert "CNC-01" not in data["series"]
    assert "CNC-03" not in data["series"]


def test_get_telemetry_baseline():
    """Verify baseline endpoint returns proper nominal thresholds."""
    response = client.get("/api/telemetry/baseline")
    assert response.status_code == 200
    data = response.json()

    assert "baseline" in data
    assert data["baseline"]["vibration"] == 1.50
    assert data["vibration_warning_threshold"] == 1.95
    assert data["current_warning_threshold"] == 13.0
    assert data["anomaly_onset_time"] == "2026-10-05T09:30:00Z"


def test_telemetry_point_model_dict_access():
    """Verify TelemetryPoint Pydantic model dict access and get methods."""
    pt = TelemetryPoint(
        timestamp="2026-10-05T09:30:00Z",
        machine_id="CNC-02",
        vibration_mm_s=2.15,
        temperature_c=41.5,
        current_a=13.1,
        spindle_speed_rpm=11980,
        is_anomalous=True,
        anomaly_score=0.78,
    )
    assert pt["vibration_mm_s"] == 2.15
    assert pt.get("temperature_c") == 41.5
    assert pt.get("nonexistent", "default") == "default"
