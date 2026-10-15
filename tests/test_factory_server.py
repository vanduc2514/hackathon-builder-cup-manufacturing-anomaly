"""Tests for Standalone Factory Client API Server and real-time SSE stream."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from simulator.edge.pubsub_dispatcher import EdgePubSubDispatcher
from simulator.models import (
    EdgeFilterStatistics,
    FactoryStatusResponse,
    FactoryTickPacket,
    MachineTelemetryPayload,
    QualityEventPayload,
    TraceabilityEventPayload,
)
from simulator.server import EdgeFilterTracker, app, service


@pytest.fixture(autouse=True)
def _reset_service_state():
    """Ensure clean service state before and after each test."""
    service.reset()
    yield
    service.reset()


def test_health_and_healthz():
    """Verify health endpoints return healthy status for Cloud Run probes."""
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "healthy"}

        res_z = client.get("/healthz")
        assert res_z.status_code == 200
        assert res_z.json() == {"status": "healthy"}


def test_factory_status_initial():
    """Verify GET /api/factory/status returns initial nominal status."""
    with TestClient(app) as client:
        res = client.get("/api/factory/status")
        assert res.status_code == 200

        data = res.json()
        status = FactoryStatusResponse.model_validate(data)
        assert status.machine_count == 4
        assert "CNC-01" in status.machines
        assert "CNC-02" in status.machines
        assert "CNC-03" in status.machines
        assert "IM-05" in status.machines
        assert status.active_scenario is None
        assert status.active_anomaly is None
        assert status.interval_sec == 1.0


@pytest.mark.asyncio
async def test_factory_stream_receives_sse_events():
    """Verify GET /api/factory/stream yields valid SSE JSON packets."""
    for path in ("/api/factory/stream", "/api/factory/events"):
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "headers": [(b"accept", b"text/event-stream")],
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 12345),
            "root_path": "",
        }

        received_messages = []
        disconnect_event = asyncio.Event()

        async def receive():
            await disconnect_event.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            received_messages.append(message)
            if message["type"] == "http.response.body" and message.get("body"):
                disconnect_event.set()

        app_task = asyncio.create_task(app(scope, receive, send))

        try:
            await asyncio.wait_for(disconnect_event.wait(), timeout=3.0)
        finally:
            disconnect_event.set()
            await asyncio.sleep(0.02)
            if not app_task.done():
                app_task.cancel()
                try:
                    await app_task
                except asyncio.CancelledError:
                    pass

        start_msg = next(m for m in received_messages if m["type"] == "http.response.start")
        assert start_msg["status"] == 200

        body_msgs = [
            m for m in received_messages if m["type"] == "http.response.body" and m.get("body")
        ]
        combined_body = b"".join(m["body"] for m in body_msgs).decode()
        assert "data:" in combined_body

        data_line = next(
            (line for line in combined_body.splitlines() if line.startswith("data:")), None
        )
        assert data_line is not None

        payload_raw = data_line.replace("data:", "").strip()
        payload = json.loads(payload_raw)

        # Validate against FactoryTickPacket
        packet = FactoryTickPacket.model_validate(payload)
        assert packet.tick_index >= 0
        assert len(packet.machines) == 4
        machine_ids = [m.machine_id for m in packet.machines]
        assert "CNC-01" in machine_ids
        assert "CNC-02" in machine_ids
        assert "CNC-03" in machine_ids
        assert "IM-05" in machine_ids
        assert isinstance(packet.edge_stats, EdgeFilterStatistics)


@pytest.mark.asyncio
async def test_inject_scenario_1_cnc_tool_wear():
    """Verify injecting Scenario 1 elevates CNC-02 vibration, sets active anomaly, and dispatches to Pub/Sub."""
    with TestClient(app) as client:
        inject_res = client.post(
            "/api/factory/inject",
            json={
                "scenario": "cnc_tool_wear",
                "machine_id": "CNC-02",
                "severity": 1.5,
                "mode": "fast",
            },
        )
        assert inject_res.status_code == 200
        res_data = inject_res.json()
        assert res_data["status"] == "ok"
        assert "pubsub_dispatch" in res_data
        assert res_data["pubsub_dispatch"]["quality_event"] is True
        assert res_data["pubsub_dispatch"]["telemetry"] is True
        assert res_data["pubsub_dispatch"]["traceability"] is True

        # Verify fallback buffer holds published events across topics
        published = service.pubsub_dispatcher.get_published_events()
        assert len(published) >= 3
        topics = [e["topic"] for e in published]
        assert "kaizen-quality-events" in topics
        assert "kaizen-telemetry" in topics
        assert "kaizen-traceability" in topics

        q_event = next(e for e in published if e["topic"] == "kaizen-quality-events")
        assert q_event["payload"]["machine_id"] == "CNC-02"
        assert q_event["payload"]["scenario"] == "cnc_tool_wear"
        assert q_event["payload"]["defect_type"] == "scratch_vertical"

        t_event = next(e for e in published if e["topic"] == "kaizen-telemetry")
        assert t_event["payload"]["machine_id"] == "CNC-02"
        assert t_event["payload"]["spindle_vibration"] > 2.5

        tr_event = next(e for e in published if e["topic"] == "kaizen-traceability")
        assert tr_event["payload"]["machine_id"] == "CNC-02"
        assert tr_event["payload"]["status"] == "DEFECT_SCRATCH"

        # Check status endpoint
        status_res = client.get("/api/factory/status")
        status = FactoryStatusResponse.model_validate(status_res.json())
        assert status.active_scenario == "cnc_tool_wear"
        assert status.active_anomaly is not None
        assert status.active_anomaly.machine_id == "CNC-02"
        assert status.active_anomaly.severity == 1.5
        assert status.speed == 5.0

        # Step simulation and verify anomalous CNC-02 telemetry
        packet = await service.step()
        cnc02 = next((m for m in packet.telemetry if m.machine_id == "CNC-02"), None)
        assert cnc02 is not None
        assert cnc02.spindle_vibration > 2.5
        assert cnc02.operating_status in ("WARNING", "ALARM")


@pytest.mark.asyncio
async def test_inject_scenario_2_im_damp_material():
    """Verify injecting Scenario 2 elevates IM-05 dew point, sets mold anomaly, and dispatches to Pub/Sub."""
    with TestClient(app) as client:
        inject_res = client.post(
            "/api/factory/inject",
            json={
                "scenario": "im_damp_material",
                "machine_id": "IM-05",
                "severity": 1.0,
                "mode": "demo",
            },
        )
        assert inject_res.status_code == 200
        res_data = inject_res.json()
        assert res_data["status"] == "ok"
        assert "pubsub_dispatch" in res_data
        assert res_data["pubsub_dispatch"]["quality_event"] is True
        assert res_data["pubsub_dispatch"]["telemetry"] is True
        assert res_data["pubsub_dispatch"]["traceability"] is True

        published = service.pubsub_dispatcher.get_published_events()
        assert len(published) >= 3
        q_event = next(e for e in published if e["topic"] == "kaizen-quality-events")
        assert q_event["payload"]["machine_id"] == "IM-05"
        assert q_event["payload"]["scenario"] == "im_damp_material"
        assert q_event["payload"]["defect_type"] == "short_fill"

        t_event = next(e for e in published if e["topic"] == "kaizen-telemetry")
        assert t_event["payload"]["machine_id"] == "IM-05"
        assert t_event["payload"]["dryer_dew_point"] == -18.0

        tr_event = next(e for e in published if e["topic"] == "kaizen-traceability")
        assert tr_event["payload"]["machine_id"] == "IM-05"
        assert tr_event["payload"]["status"] == "DEFECT_SHORT_FILL"

        # Check status endpoint
        status_res = client.get("/api/factory/status")
        status = FactoryStatusResponse.model_validate(status_res.json())
        assert status.active_scenario == "im_damp_material"
        assert status.active_anomaly is not None
        assert status.active_anomaly.machine_id == "IM-05"
        assert status.active_anomaly.tool_id == "MOLD-03"

        # Step simulation and verify IM-05 telemetry dew point rise
        packet = await service.step()
        im05 = next((m for m in packet.telemetry if m.machine_id == "IM-05"), None)
        assert im05 is not None
        assert im05.dryer_dew_point is not None
        assert im05.dryer_dew_point > -25.0  # Rises toward -18 C from nominal -40 C


@pytest.mark.asyncio
async def test_reset_factory_restores_nominal_baseline():
    """Verify POST /api/factory/reset restores nominal machinery baselines and clears buffer."""
    with TestClient(app) as client:
        # First inject anomaly
        client.post(
            "/api/factory/inject",
            json={"scenario": "cnc_tool_wear", "severity": 1.2, "mode": "fast"},
        )
        assert service.injection_engine.active_scenario is not None
        assert len(service.pubsub_dispatcher.get_published_events()) > 0

        # Reset
        reset_res = client.post("/api/factory/reset")
        assert reset_res.status_code == 200
        assert reset_res.json()["status"] == "ok"

        # Check status is cleared
        status_res = client.get("/api/factory/status")
        status = FactoryStatusResponse.model_validate(status_res.json())
        assert status.active_scenario is None
        assert status.active_anomaly is None
        assert status.speed == 1.0
        assert len(service.pubsub_dispatcher.get_published_events()) == 0

        # Step and verify nominal vibration
        packet = await service.step()
        cnc02 = next((m for m in packet.telemetry if m.machine_id == "CNC-02"), None)
        assert cnc02 is not None
        assert cnc02.spindle_vibration <= 2.2
        assert cnc02.operating_status == "NORMAL"


@pytest.mark.asyncio
async def test_inject_pubsub_dispatcher_custom_mock():
    """Verify custom EdgePubSubDispatcher receives all three payloads on injection."""
    from simulator.server import FactoryServerService

    mock_dispatcher = MagicMock(spec=EdgePubSubDispatcher)
    mock_dispatcher.publish_quality_event = AsyncMock(return_value=True)
    mock_dispatcher.publish_telemetry = AsyncMock(return_value=True)
    mock_dispatcher.publish_traceability = AsyncMock(return_value=True)

    custom_service = FactoryServerService(pubsub_dispatcher=mock_dispatcher)
    res = await custom_service.inject(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        severity=1.2,
        mode="fast",
    )
    assert res["status"] == "ok"
    assert res["pubsub_dispatch"] == {
        "quality_event": True,
        "telemetry": True,
        "traceability": True,
    }

    mock_dispatcher.publish_quality_event.assert_awaited_once()
    q_call = mock_dispatcher.publish_quality_event.await_args[0][0]
    assert isinstance(q_call, QualityEventPayload)
    assert q_call.machine_id == "CNC-02"
    assert q_call.scenario == "cnc_tool_wear"

    mock_dispatcher.publish_telemetry.assert_awaited_once()
    t_call = mock_dispatcher.publish_telemetry.await_args[0][0]
    assert isinstance(t_call, MachineTelemetryPayload)
    assert t_call.machine_id == "CNC-02"
    assert t_call.spindle_vibration > 2.5

    mock_dispatcher.publish_traceability.assert_awaited_once()
    tr_call = mock_dispatcher.publish_traceability.await_args[0][0]
    assert isinstance(tr_call, TraceabilityEventPayload)
    assert tr_call.machine_id == "CNC-02"
    assert tr_call.status == "DEFECT_SCRATCH"


@pytest.mark.asyncio
async def test_inject_pubsub_dispatcher_error_handling():
    """Verify inject still succeeds if Pub/Sub dispatcher raises an exception."""
    from simulator.server import FactoryServerService

    mock_dispatcher = MagicMock(spec=EdgePubSubDispatcher)
    mock_dispatcher.publish_quality_event = AsyncMock(side_effect=RuntimeError("Pub/Sub down"))

    custom_service = FactoryServerService(pubsub_dispatcher=mock_dispatcher)
    res = await custom_service.inject(scenario="cnc_tool_wear")
    assert res["status"] == "ok"
    assert res["pubsub_dispatch"] == {}


def test_edge_statistics_tracker():
    """Verify EdgeFilterTracker discards ~95% PASS frames and forwards 100% defects."""
    tracker = EdgeFilterTracker()

    # 100 PASS frames: 95 dropped, 5 audit sampled (every 20th frame)
    for _ in range(100):
        tracker.record_frame("PASS")

    # 5 DEFECT frames: 100% forwarded
    for _ in range(5):
        tracker.record_frame("DEFECT_SCRATCH")

    stats = tracker.get_statistics()
    assert stats.total_frames_evaluated == 105
    assert stats.pass_frames_dropped == 95
    assert stats.audit_sampled_forwarded == 5
    assert stats.defect_frames_forwarded == 5
    assert stats.total_frames_forwarded == 10  # 5 audit + 5 defects
    assert stats.drop_ratio == round(95 / 105, 4)
    assert stats.cloud_bandwidth_reduction_pct == round((95 / 105) * 100.0, 1)
    assert stats.estimated_bandwidth_saved_mb > 0.0

    # Reset
    tracker.reset()
    clean_stats = tracker.get_statistics()
    assert clean_stats.total_frames_evaluated == 0
    assert clean_stats.pass_frames_dropped == 0
    assert clean_stats.defect_frames_forwarded == 0


@pytest.mark.asyncio
async def test_recent_parts_rolling_window():
    """Verify recent_parts keeps a bounded rolling queue of latest inspection items."""
    for _ in range(40):
        await service.step()

    snapshot = service.get_current_snapshot()
    assert len(snapshot.recent_parts) <= 30
    assert len(snapshot.recent_parts) > 0


def test_cli_argument_parsing():
    """Verify CLI parser sets host, port, speed, and interval correctly."""
    from simulator.server import main

    test_args = ["simulator.server", "--port", "8015", "--speed", "2.0", "--interval", "0.5"]
    with patch("sys.argv", test_args):
        with patch("uvicorn.run") as mock_run:
            main()
            mock_run.assert_called_once()
            _, kwargs = mock_run.call_args
            assert kwargs["port"] == 8015
            assert service.speed == 2.0
            assert service.interval_sec == 0.5
