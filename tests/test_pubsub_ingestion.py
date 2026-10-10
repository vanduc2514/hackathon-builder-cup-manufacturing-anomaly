"""Unit and integration tests for Pub/Sub event ingestion, BigQuery streaming, and Orchestrator dispatch."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.models import (
    MachineTelemetryPayload,
    QualityEventPayload,
    TraceabilityEventPayload,
)
from backend.core.pubsub_manager import PubSubManager, pubsub_manager
from backend.edge.gateway.mqtt_bridge import MQTTBridge
from backend.tools.bigquery_tool import (
    clear_mock_sensor_telemetry,
    clear_mock_traceability_records,
    get_mock_sensor_telemetry,
    get_mock_traceability_records,
    stream_traceability_record,
)


@pytest.fixture(autouse=True)
def cleanup_buffers():
    """Cleans in-memory buffers before and after each test."""
    clear_mock_sensor_telemetry()
    clear_mock_traceability_records()
    orchestrator.stop_simulation()
    yield
    clear_mock_sensor_telemetry()
    clear_mock_traceability_records()
    orchestrator.stop_simulation()


def test_traceability_event_payload_schema():
    """Verifies TraceabilityEventPayload validation, defaults, and JSON serialization."""
    payload = TraceabilityEventPayload(
        product_id="PRD-8821",
        machine_id="CNC-02",
        tool_id="T07",
        lot_id="AL-5083-B4",
        operator_id="OP-15",
        status="DEFECT_SCRATCH",
    )
    assert payload.product_id == "PRD-8821"
    assert payload.machine_id == "CNC-02"
    assert payload.tool_id == "T07"
    assert payload.status == "DEFECT_SCRATCH"

    json_str = payload.model_dump_json()
    reconstructed = TraceabilityEventPayload.model_validate_json(json_str)
    assert reconstructed.product_id == payload.product_id
    assert reconstructed.status == payload.status


def test_quality_event_payload_schema():
    """Verifies QualityEventPayload schema, defaults, and conversion to DefectInjectionRequest."""
    payload = QualityEventPayload(
        scenario="cnc_tool_wear",
        mode="fast",
        machine_id="CNC-02",
        tool_id="T07",
        defect_type="scratch_vertical",
        defect_rate=0.08,
        severity="high",
    )
    assert payload.event_type == "defect_spc_breach"
    assert payload.machine_id == "CNC-02"

    trigger = payload.to_defect_injection_request()
    assert trigger.scenario == "cnc_tool_wear"
    assert trigger.mode == "fast"
    assert trigger.machine_id == "CNC-02"
    assert trigger.tool_id == "T07"
    assert trigger.defect_type == "scratch_vertical"
    assert trigger.defect_rate == 0.08
    assert trigger.severity == "high"


def test_stream_traceability_record():
    """Verifies streaming traceability record lands in BigQuery buffer / mock fallback."""
    record = TraceabilityEventPayload(
        product_id="PRD-9901",
        timestamp="2026-10-10T12:00:00Z",
        machine_id="CNC-02",
        tool_id="T07",
        lot_id="AL-5083-B4",
        operator_id="OP-12",
        status="PASS",
    )
    res = stream_traceability_record(record)
    assert res is True

    buffered = get_mock_traceability_records()
    assert len(buffered) >= 1
    latest = buffered[-1]
    assert latest["product_id"] == "PRD-9901"
    assert latest["machine_id"] == "CNC-02"
    assert latest["status"] == "PASS"


def test_pubsub_manager_direct_fallback():
    """Verifies PubSubManager falls back to direct execution when Pub/Sub is unavailable."""
    manager = PubSubManager()
    manager._cached_available = False

    telemetry = MachineTelemetryPayload(
        machine_id="CNC-01",
        spindle_vibration=1.5,
        operating_status="NORMAL",
    )
    res_tel = manager.publish_telemetry(telemetry)
    assert res_tel is True
    assert len(get_mock_sensor_telemetry()) >= 1

    trace = TraceabilityEventPayload(
        product_id="PRD-7701",
        machine_id="CNC-01",
        tool_id="T04",
    )
    res_trace = manager.publish_traceability(trace)
    assert res_trace is True
    assert len(get_mock_traceability_records()) >= 1

    quality_evt = QualityEventPayload(
        machine_id="CNC-02",
        tool_id="T07",
        mode="fast",
    )
    res_q = manager.publish_quality_event(quality_evt)
    assert res_q is False


def test_pubsub_telemetry_message_handler():
    """Verifies subscriber _handle_telemetry_message decodes payload, streams to BigQuery, and acks."""
    manager = PubSubManager()
    telemetry = MachineTelemetryPayload(
        machine_id="CNC-03",
        spindle_vibration=2.4,
        operating_status="WARNING",
    )
    mock_msg = MagicMock()
    mock_msg.data = telemetry.model_dump_json().encode("utf-8")

    manager._handle_telemetry_message(mock_msg)
    mock_msg.ack.assert_called_once()
    mock_msg.nack.assert_not_called()

    buffered = get_mock_sensor_telemetry()
    assert any(b["machine_id"] == "CNC-03" for b in buffered)


def test_pubsub_traceability_message_handler():
    """Verifies subscriber _handle_traceability_message decodes payload, streams to BigQuery, and acks."""
    manager = PubSubManager()
    trace = TraceabilityEventPayload(
        product_id="PRD-5501",
        machine_id="CNC-02",
        tool_id="T07",
        status="DEFECT_SCRATCH",
    )
    mock_msg = MagicMock()
    mock_msg.data = trace.model_dump_json().encode("utf-8")

    manager._handle_traceability_message(mock_msg)
    mock_msg.ack.assert_called_once()
    mock_msg.nack.assert_not_called()

    buffered = get_mock_traceability_records()
    assert any(b["product_id"] == "PRD-5501" for b in buffered)


def test_pubsub_quality_event_message_handler_dispatch():
    """Verifies subscriber _handle_quality_event_message dispatches to orchestrator when idle."""
    manager = PubSubManager()
    quality_evt = QualityEventPayload(
        scenario="cnc_tool_wear",
        mode="fast",
        machine_id="CNC-02",
        tool_id="T07",
    )
    mock_msg = MagicMock()
    mock_msg.data = quality_evt.model_dump_json().encode("utf-8")

    orchestrator.stop_simulation()
    with patch.object(orchestrator, "start_incident") as mock_start:
        manager._handle_quality_event_message(mock_msg)
        mock_start.assert_called_once()
        mock_msg.ack.assert_called_once()


def test_pubsub_quality_event_message_handler_duplicate_suppression():
    """Verifies single-flight: duplicate quality-events while orchestrator is running are ignored and acked."""
    manager = PubSubManager()
    quality_evt = QualityEventPayload(
        scenario="cnc_tool_wear",
        mode="fast",
        machine_id="CNC-02",
        tool_id="T07",
    )
    mock_msg = MagicMock()
    mock_msg.data = quality_evt.model_dump_json().encode("utf-8")

    orchestrator._task = MagicMock()
    orchestrator._task.done.return_value = False
    try:
        with patch.object(orchestrator, "start_incident") as mock_start:
            manager._handle_quality_event_message(mock_msg)
            mock_start.assert_not_called()
            mock_msg.ack.assert_called_once()
    finally:
        orchestrator.stop_simulation()


def test_mqtt_bridge_conveyor_and_telemetry_forwarding():
    """Verifies MQTTBridge publishes telemetry and conveyor inspection events to Pub/Sub."""
    bridge = MQTTBridge(dry_run=True)

    # 1. Telemetry anomaly forwarding
    telemetry_packet = json.dumps(
        {
            "machine_id": "CNC-02",
            "spindle_vibration": 3.8,
            "spindle_temp": 55.0,
            "motor_current": 14.5,
            "rpm": 12000,
            "operating_status": "ALARM",
            "anomaly_score": 0.95,
        }
    ).encode("utf-8")

    with (
        patch.object(pubsub_manager, "publish_telemetry") as mock_pub_tel,
        patch.object(pubsub_manager, "publish_quality_event") as mock_pub_q,
    ):
        bridge.process_message("aibuilder/factory01/line01/cnc02/telemetry", telemetry_packet)
        mock_pub_tel.assert_called_once()
        mock_pub_q.assert_called_once()

    # 2. Conveyor inspection forwarding
    conveyor_packet = json.dumps(
        {
            "product_id": "PRD-2026",
            "machine_id": "CNC-02",
            "tool_id": "T07",
            "lot_id": "AL-5083-B4",
            "status": "DEFECT_SCRATCH",
            "defect_type": "scratch_vertical",
        }
    ).encode("utf-8")

    with (
        patch.object(pubsub_manager, "publish_traceability") as mock_pub_trace,
        patch.object(pubsub_manager, "publish_quality_event") as mock_pub_q,
    ):
        bridge.process_conveyor_message(
            "aibuilder/factory01/line01/conveyor/inspection", conveyor_packet
        )
        mock_pub_trace.assert_called_once()
        mock_pub_q.assert_called_once()


def test_simulation_inject_pubsub_integration():
    """Verifies POST /api/simulation/inject publishes QualityEventPayload in end-to-end flow."""
    client = TestClient(app)

    with patch.object(pubsub_manager, "publish_quality_event", return_value=True) as mock_pub:
        with patch.object(orchestrator, "start_incident"):
            resp = client.post(
                "/api/simulation/inject",
                json={"scenario": "cnc_tool_wear", "mode": "fast"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "triggered"
            assert data["scenario"] == "cnc_tool_wear"
            mock_pub.assert_called_once()


@pytest.mark.asyncio
async def test_factory_simulator_pubsub_dispatch():
    """Verifies FactorySimulatorService publishes quality-events to Pub/Sub when pubsub=True."""
    from simulator.main import FactorySimulatorService

    service = FactorySimulatorService(
        speed=10.0,
        dry_run=True,
        inject_on_start=False,
        pubsub=True,
        seed=42,
    )

    with patch.object(pubsub_manager, "publish_quality_event") as mock_pub_q:
        service.trigger_anomaly(machine_id="CNC-02", scenario="cnc_tool_wear")
        mock_pub_q.assert_called_once()
        args, _ = mock_pub_q.call_args
        event = args[0]
        assert event.machine_id == "CNC-02"
        assert event.scenario == "cnc_tool_wear"
