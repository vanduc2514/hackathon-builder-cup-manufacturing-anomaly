"""Unit tests for the EMQX MQTT Bridge and real-time telemetry ingestion."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import MachineTelemetryPayload
from backend.edge.gateway.mqtt_bridge import MQTTBridge
from backend.tools.bigquery_tool import (
    clear_mock_sensor_telemetry,
    get_mock_sensor_telemetry,
    stream_sensor_telemetry,
)


@pytest.fixture(autouse=True)
def cleanup():
    """Reset blackboard and mock telemetry buffer between tests."""
    blackboard.reset()
    clear_mock_sensor_telemetry()
    yield
    blackboard.reset()
    clear_mock_sensor_telemetry()


def test_telemetry_payload_validation_standard():
    """Validates telemetry payload using standard schema field names."""
    data = {
        "machine_id": "CNC-01",
        "timestamp": "2026-10-07T12:00:00Z",
        "tool_id": "T04",
        "spindle_vibration": 1.85,
        "spindle_temp": 42.5,
        "motor_current": 12.1,
        "rpm": 1480,
        "operating_status": "NORMAL",
        "anomaly_score": 0.05,
    }
    payload = MachineTelemetryPayload.model_validate(data)
    assert payload.machine_id == "CNC-01"
    assert payload.spindle_vibration == 1.85
    assert payload.spindle_temp == 42.5
    assert payload.motor_current == 12.1
    assert payload.rpm == 1480
    assert payload.operating_status == "NORMAL"
    assert payload.anomaly_score == 0.05


def test_telemetry_payload_validation_aliases():
    """Validates telemetry payload using alias industrial sensor field names."""
    data = {
        "machine_id": "CNC-02",
        "timestamp": "2026-10-07T12:00:02Z",
        "tool_id": "T07",
        "vibration_mm_s": 2.75,
        "temperature_c": 51.0,
        "current_a": 13.8,
        "spindle_speed_rpm": 1500,
        "operating_status": "WARNING",
        "anomaly_score": 0.88,
    }
    payload = MachineTelemetryPayload.model_validate(data)
    assert payload.machine_id == "CNC-02"
    assert payload.spindle_vibration == 2.75
    assert payload.spindle_temp == 51.0
    assert payload.motor_current == 13.8
    assert payload.rpm == 1500
    assert payload.operating_status == "WARNING"
    assert payload.anomaly_score == 0.88


def test_bigquery_sensor_telemetry_streaming():
    """Verifies sensor telemetry streaming to BigQuery buffer/mock fallback."""
    payload = MachineTelemetryPayload(
        machine_id="CNC-03",
        timestamp="2026-10-07T12:05:00Z",
        tool_id="T05",
        spindle_vibration=2.1,
        spindle_temp=43.0,
        motor_current=11.9,
        rpm=1485,
        operating_status="NORMAL",
        anomaly_score=0.1,
    )
    result = stream_sensor_telemetry(payload)
    assert result is True

    buffered = get_mock_sensor_telemetry()
    assert len(buffered) >= 1
    latest = buffered[-1]
    assert latest["machine_id"] == "CNC-03"
    assert latest["vibration_mm_s"] == 2.1
    assert latest["temperature_c"] == 43.0
    assert latest["current_a"] == 11.9
    assert latest["spindle_speed_rpm"] == 1485


def test_blackboard_telemetry_recording_normal():
    """Verifies normal telemetry updates latest_telemetry without creating alerts."""
    state_before = blackboard.get_state()
    assert state_before.status == "normal"
    assert len(state_before.telemetry_alerts) == 0

    payload = MachineTelemetryPayload(
        machine_id="CNC-01",
        spindle_vibration=1.8,
        motor_current=12.0,
        operating_status="NORMAL",
        anomaly_score=0.10,
    )
    updated = blackboard.record_telemetry(payload)
    assert updated.latest_telemetry is not None
    assert updated.latest_telemetry.machine_id == "CNC-01"
    assert len(updated.telemetry_alerts) == 0
    assert updated.status == "normal"


def test_blackboard_telemetry_recording_anomaly():
    """Verifies anomalous telemetry creates TelemetryAlert and transitions status."""
    payload = MachineTelemetryPayload(
        machine_id="CNC-02",
        tool_id="T07",
        spindle_vibration=2.85,
        motor_current=13.6,
        operating_status="WARNING",
        anomaly_score=0.85,
    )
    updated = blackboard.record_telemetry(payload)
    assert updated.status == "detecting"
    assert updated.suspect_machine == "CNC-02"
    assert updated.suspect_tool == "T07"
    assert len(updated.telemetry_alerts) == 1

    alert = updated.telemetry_alerts[0]
    assert alert.machine_id == "CNC-02"
    assert alert.anomaly_score == 0.85
    assert alert.metric_name == "spindle_vibration"
    assert alert.metric_value == 2.85


def test_mqtt_bridge_process_message_valid():
    """Verifies MQTTBridge processing of a valid telemetry message."""
    bridge = MQTTBridge(dry_run=True)
    topic = f"{settings.mqtt_base_topic}/motor01/telemetry"
    raw_json = json.dumps(
        {
            "machine_id": "motor01",
            "timestamp": "2026-10-07T12:10:00Z",
            "spindle_vibration": 1.9,
            "spindle_temp": 41.2,
            "motor_current": 12.0,
            "rpm": 1490,
            "operating_status": "NORMAL",
            "anomaly_score": 0.02,
        }
    ).encode("utf-8")

    result = bridge.process_message(topic, raw_json)
    assert result is not None
    assert result.machine_id == "motor01"
    assert bridge.message_count == 1
    assert bridge.anomaly_count == 0

    state = blackboard.get_state()
    assert state.latest_telemetry is not None
    assert state.latest_telemetry.machine_id == "motor01"


def test_mqtt_bridge_process_message_anomaly():
    """Verifies MQTTBridge increments anomaly_count on anomalous message."""
    bridge = MQTTBridge(dry_run=True)
    topic = f"{settings.mqtt_base_topic}/cnc-02/telemetry"
    raw_json = json.dumps(
        {
            "machine_id": "CNC-02",
            "timestamp": "2026-10-07T12:11:00Z",
            "tool_id": "T07",
            "vibration_mm_s": 2.9,
            "temperature_c": 52.0,
            "current_a": 13.9,
            "spindle_speed_rpm": 1500,
            "operating_status": "ALARM",
            "anomaly_score": 0.92,
        }
    ).encode("utf-8")

    result = bridge.process_message(topic, raw_json)
    assert result is not None
    assert bridge.message_count == 1
    assert bridge.anomaly_count == 1

    state = blackboard.get_state()
    assert state.status == "detecting"
    assert len(state.telemetry_alerts) == 1


def test_mqtt_bridge_process_message_invalid():
    """Verifies MQTTBridge safely drops corrupt payloads without throwing."""
    bridge = MQTTBridge(dry_run=True)
    topic = f"{settings.mqtt_base_topic}/motor01/telemetry"

    # Non-JSON payload
    result = bridge.process_message(topic, b"NOT_A_VALID_JSON")
    assert result is None
    assert bridge.message_count == 0

    # JSON missing required machine_id
    result = bridge.process_message(topic, b'{"vibration_mm_s": 2.0}')
    assert result is None
    assert bridge.message_count == 0


def test_mqtt_bridge_dry_run_lifecycle():
    """Verifies start and stop lifecycle in dry-run mode."""
    bridge = MQTTBridge(dry_run=True)
    bridge.start()
    assert bridge._running is True
    bridge.stop()
    assert bridge._running is False
    assert bridge.is_connected is False


def test_mqtt_bridge_on_connect_and_disconnect():
    """Verifies MQTT client connection callback behavior."""
    bridge = MQTTBridge(dry_run=True)
    mock_client = MagicMock()

    # Simulate successful connection
    bridge._on_connect(mock_client, None, None, 0)
    assert bridge.is_connected is True
    # Subscribed to default topics
    assert mock_client.subscribe.call_count == len(bridge.topics)

    # Simulate disconnect
    bridge._on_disconnect(mock_client, None, 1)
    assert bridge.is_connected is False
