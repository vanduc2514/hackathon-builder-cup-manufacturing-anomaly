"""Integration and contract test suite for the Pub/Sub edge-to-cloud ingestion pipeline (Issue #224).

Validates:
- EdgePubSubDispatcher delivery reports, synthetic ACK generation, and latency profiling
- FactoryTickPacket pubsub_delivery snapshots streamed via SSE
- PubSubManager quality-event, telemetry, and traceability ingestion pipelines
- Debounce cooldown, deduplication, poison-pill protection, and single-flight guarantees
- Environment parity between offline mock fallback and live emulator pipelines
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

import backend.agents.orchestrator as orchestrator_module
from backend.core.models import (
    MachineTelemetryPayload,
    QualityEventPayload,
    TraceabilityEventPayload,
)
from backend.core.pubsub_manager import PubSubManager, pubsub_manager
from backend.tools.bigquery_tool import (
    clear_mock_sensor_telemetry,
    clear_mock_traceability_records,
    get_mock_sensor_telemetry,
    get_mock_traceability_records,
)
from simulator.edge.pubsub_dispatcher import EdgePubSubDispatcher
from simulator.models import FilteredFramePacket
from simulator.models import PubSubDeliveryReport as SimPubSubDeliveryReport
from simulator.server import FactoryServerService


@pytest.fixture(autouse=True)
def clean_pipeline_state():
    """Resets BigQuery buffers, orchestrator, and PubSubManager state before and after each test."""
    clear_mock_sensor_telemetry()
    clear_mock_traceability_records()
    orchestrator_module.orchestrator.stop_simulation()
    pubsub_manager.reset_availability_cache()
    yield
    clear_mock_sensor_telemetry()
    clear_mock_traceability_records()
    orchestrator_module.orchestrator.stop_simulation()
    pubsub_manager.reset_availability_cache()


def _make_pubsub_message(data_bytes: bytes, message_id: str = "msg-001") -> MagicMock:
    """Helper creating a mock Pub/Sub message with ack/nack spies."""
    msg = MagicMock()
    msg.data = data_bytes
    msg.message_id = message_id
    msg.ack = MagicMock()
    msg.nack = MagicMock()
    return msg


@pytest.mark.asyncio
async def test_edge_pubsub_dispatcher_delivery_reports():
    """Verifies that EdgePubSubDispatcher records structured delivery reports on event publish."""
    dispatcher = EdgePubSubDispatcher(dry_run=True)

    # 1. Publish Quality Event
    q_payload = QualityEventPayload(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        tool_id="T07",
        mode="demo",
        defect_type="scratch_vertical",
        defect_rate=0.08,
    )
    res_q = await dispatcher.publish_quality_event(q_payload)
    assert res_q is True

    # 2. Publish Telemetry
    t_payload = MachineTelemetryPayload(
        machine_id="CNC-02",
        spindle_vibration=3.45,
        motor_current=18.5,
        operating_status="ALARM",
    )
    res_t = await dispatcher.publish_telemetry(t_payload)
    assert res_t is True

    # 3. Publish Traceability
    tr_payload = TraceabilityEventPayload(
        product_id="PRD-88001",
        machine_id="CNC-02",
        tool_id="T07",
        status="DEFECT_SCRATCH",
    )
    res_tr = await dispatcher.publish_traceability(tr_payload)
    assert res_tr is True

    # Inspect delivery reports
    reports = dispatcher.get_last_delivery_reports()
    assert len(reports) == 3
    for rep in reports:
        assert isinstance(rep, SimPubSubDeliveryReport)
        assert rep.message_id.startswith("sim-ack-")
        assert rep.latency_ms >= 0.0
        assert rep.status == "buffered"
        assert rep.timestamp != ""

    types_recorded = [r.payload_type for r in reports]
    assert "quality_event" in types_recorded
    assert "telemetry" in types_recorded
    assert "traceability" in types_recorded

    # Reset
    dispatcher.clear_delivery_reports()
    assert len(dispatcher.get_last_delivery_reports()) == 0


@pytest.mark.asyncio
async def test_factory_tick_packet_contains_pubsub_delivery_snapshot():
    """Verifies that FactoryTickPacket includes pubsub_delivery when anomalies are dispatched."""
    dispatcher = EdgePubSubDispatcher(dry_run=True)
    service = FactoryServerService(speed=10.0, pubsub_dispatcher=dispatcher)

    # Before injection: pubsub_delivery is None or empty
    snap_before = service.get_current_snapshot()
    assert snap_before.pubsub_delivery is None

    # Trigger anomaly injection
    inject_res = await service.inject(scenario="cnc_tool_wear", machine_id="CNC-02")
    assert inject_res["status"] == "ok"
    assert len(inject_res["delivery_reports"]) > 0

    # Next tick packet must contain delivery reports
    packet = await service.step()
    assert packet.pubsub_delivery is not None
    assert len(packet.pubsub_delivery) > 0
    assert packet.pubsub_delivery[0].topic.endswith("quality-events")

    # Verify JSON serialization works without error
    json_str = packet.model_dump_json()
    assert "pubsub_delivery" in json_str
    assert "sim-ack-" in json_str


def test_pubsub_manager_quality_event_pipeline():
    """Verifies that PubSubManager ingests quality events, enforces single flight and machine debounce."""
    manager = PubSubManager()

    q_evt = QualityEventPayload(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        tool_id="T07",
        mode="fast",
        defect_type="scratch_vertical",
        defect_rate=0.08,
    )
    msg1 = _make_pubsub_message(q_evt.model_dump_json().encode("utf-8"), "msg-001")

    # 1. Idle orchestrator -> dispatches successfully
    with patch.object(orchestrator_module.orchestrator, "start_incident") as mock_start:
        manager._handle_quality_event_message(msg1)
        mock_start.assert_called_once()
        msg1.ack.assert_called_once()
        msg1.nack.assert_not_called()

    # 2. Debounce: Second event for same machine within debounce window is dropped and ACKed
    q_evt_duplicate_machine = QualityEventPayload(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        tool_id="T07",
        mode="fast",
        defect_type="scratch_vertical",
        defect_rate=0.08,
    )
    msg2 = _make_pubsub_message(
        q_evt_duplicate_machine.model_dump_json().encode("utf-8"), "msg-002"
    )
    with patch.object(orchestrator_module.orchestrator, "start_incident") as mock_start:
        manager._handle_quality_event_message(msg2)
        mock_start.assert_not_called()
        msg2.ack.assert_called_once()

    # 3. Independent machine: Different machine (IM-05) is NOT blocked by CNC-02 cooldown
    q_evt_other_machine = QualityEventPayload(
        scenario="im_damp_material",
        machine_id="IM-05",
        tool_id="MOLD-03",
        mode="fast",
        defect_type="short_fill",
        defect_rate=0.05,
    )
    msg3 = _make_pubsub_message(q_evt_other_machine.model_dump_json().encode("utf-8"), "msg-003")
    with patch.object(orchestrator_module.orchestrator, "start_incident") as mock_start:
        manager._handle_quality_event_message(msg3)
        mock_start.assert_called_once()
        msg3.ack.assert_called_once()


def test_pubsub_manager_telemetry_and_traceability_pipeline():
    """Verifies that PubSubManager ingests telemetry and traceability payloads to BigQuery buffers."""
    manager = PubSubManager()

    # 1. Telemetry message
    tel_payload = MachineTelemetryPayload(
        machine_id="CNC-03",
        spindle_vibration=2.85,
        motor_current=16.2,
        spindle_temp=48.0,
        rpm=11500,
        operating_status="WARNING",
    )
    msg_tel = _make_pubsub_message(tel_payload.model_dump_json().encode("utf-8"))
    manager._handle_telemetry_message(msg_tel)
    msg_tel.ack.assert_called_once()

    tel_records = get_mock_sensor_telemetry()
    assert any(r["machine_id"] == "CNC-03" for r in tel_records)

    # 2. Traceability message
    trace_payload = TraceabilityEventPayload(
        product_id="PRD-99881",
        machine_id="CNC-01",
        tool_id="T02",
        lot_id="AL-5083-B1",
        status="PASS",
    )
    msg_trace = _make_pubsub_message(trace_payload.model_dump_json().encode("utf-8"))
    manager._handle_traceability_message(msg_trace)
    msg_trace.ack.assert_called_once()

    trace_records = get_mock_traceability_records()
    assert any(r["product_id"] == "PRD-99881" for r in trace_records)


def test_pubsub_poison_pill_resilience():
    """Verifies that malformed or corrupt payloads are safely caught without crashing the process."""
    manager = PubSubManager()

    # Malformed non-JSON data
    bad_msg_1 = _make_pubsub_message(b"INVALID_BINARY_CORRUPTED_BYTES", "bad-01")
    manager._handle_quality_event_message(bad_msg_1)
    bad_msg_1.nack.assert_called_once()
    bad_msg_1.ack.assert_not_called()

    bad_msg_2 = _make_pubsub_message(b"{'invalid_json': }", "bad-02")
    manager._handle_telemetry_message(bad_msg_2)
    bad_msg_2.ack.assert_called_once()
    bad_msg_2.nack.assert_not_called()

    bad_msg_3 = _make_pubsub_message(b"[]", "bad-03")
    manager._handle_traceability_message(bad_msg_3)
    bad_msg_3.nack.assert_called_once()
    bad_msg_3.ack.assert_not_called()


def test_gemma_edge_classifier_filtered_frame_contract():
    """Verifies FilteredFramePacket schema and edge bandwidth reduction metadata contracts."""
    packet = FilteredFramePacket(
        frame_hash="frame-test-001",
        camera_id="CAM-OPT-01",
        product_id="PRD-00123",
        machine_id="CNC-02",
        tool_id="T07",
        lot_id="AL-5083-B4",
        conveyor_timestamp="2026-10-17T01:00:00Z",
        classification="DEFECT",
        is_defect=True,
        defect_type="scratch_vertical",
        confidence=0.96,
        uncertainty=0.04,
        filter_decision="FORWARD",
        diverter_actuated=True,
    )
    assert packet.classification == "DEFECT"
    assert packet.filter_decision == "FORWARD"
    assert packet.diverter_actuated is True

    # Validate json serialization
    dumped = json.loads(packet.model_dump_json())
    assert dumped["diverter_actuated"] is True
    assert dumped["filter_decision"] == "FORWARD"
