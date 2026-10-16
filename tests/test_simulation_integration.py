"""Integration tests for factory simulator sync, simulation endpoints, and Pub/Sub dedup."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, PropertyMock, patch

import pytest
from starlette.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.config import settings
from backend.core.models import FactorySyncResult, QualityEventPayload
from backend.core.pubsub_manager import pubsub_manager


@pytest.fixture(autouse=True)
def clean_state():
    """Ensures orchestrator and pubsub dedup caches are reset before each test."""
    pubsub_manager.reset_availability_cache()
    yield
    pubsub_manager.reset_availability_cache()


def test_simulation_inject_calls_factory_with_dispatch_quality_event_false():
    """Verify POST /api/simulation/inject calls factory_client with dispatch_quality_event=False and starts incident."""
    client = TestClient(app)

    sync_result = FactorySyncResult(
        ok=True,
        latency_ms=12.5,
        endpoint="http://factory:8080/api/factory/inject",
        details={"injected": True},
    )

    with (
        patch("backend.api.routes_simulation.factory_client.inject_anomaly", return_value=sync_result) as mock_factory,
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "triggered"
        assert data["scenario"] == "cnc_tool_wear"
        assert data["factory_sync"]["ok"] is True
        assert data["factory_sync"]["details"] == {"injected": True}

        # Assert factory called with dispatch_quality_event=False
        mock_factory.assert_called_once_with(
            scenario="cnc_tool_wear",
            machine_id="CNC-02",
            severity="medium",
            mode="fast",
            dispatch_quality_event=False,
        )
        # Exactly one incident started directly
        mock_start.assert_called_once()


def test_simulation_inject_409_does_not_call_factory():
    """Verify 409 is raised BEFORE any factory call if orchestrator is already running (C1)."""
    client = TestClient(app)

    with (
        patch("backend.api.routes_simulation.factory_client.inject_anomaly") as mock_factory,
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=True),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear"},
        )
        assert resp.status_code == 409
        assert "already running" in resp.json()["detail"].lower()
        # Factory must NOT have been called
        mock_factory.assert_not_called()


def test_simulation_inject_resilient_when_factory_is_down():
    """Verify endpoint returns 200 with factory_sync.ok=False when factory is unreachable."""
    client = TestClient(app)

    sync_result = FactorySyncResult(
        ok=False,
        latency_ms=25.0,
        endpoint="http://factory:8080/api/factory/inject",
        error="HTTP 503: Service Unavailable",
    )

    with (
        patch("backend.api.routes_simulation.factory_client.inject_anomaly", return_value=sync_result) as mock_factory,
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "triggered"
        assert data["factory_sync"]["ok"] is False
        assert "503" in data["factory_sync"]["error"]
        mock_factory.assert_called_once()
        mock_start.assert_called_once()


def test_simulation_reset_calls_factory_reset():
    """Verify POST /api/simulation/reset invokes orchestrator.reset, reset_buffers, and factory_client.reset_factory."""
    client = TestClient(app)

    sync_result = FactorySyncResult(
        ok=True,
        latency_ms=8.0,
        endpoint="http://factory:8080/api/factory/reset",
        details={"message": "restored"},
    )

    with (
        patch("backend.api.routes_simulation.factory_client.reset_factory", return_value=sync_result) as mock_factory,
        patch("backend.api.routes_simulation.reset_buffers", return_value={"cleared": True}) as mock_buffers,
        patch.object(orchestrator, "reset", return_value={"status": "idle"}) as mock_reset,
    ):
        resp = client.post("/api/simulation/reset")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "reset"
        assert data["factory_sync"]["ok"] is True
        mock_reset.assert_called_once()
        mock_buffers.assert_called_once()
        mock_factory.assert_called_once()


def test_pubsub_quality_event_deduplication():
    """Verify duplicate quality event within TTL is dropped and acked without triggering orchestrator."""
    event_id = str(uuid.uuid4())
    event = QualityEventPayload(event_id=event_id)
    msg_data = event.model_dump_json().encode("utf-8")

    msg1 = MagicMock()
    msg1.data = msg_data

    msg2 = MagicMock()
    msg2.data = msg_data

    with (
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
    ):
        # First message: processed
        pubsub_manager._handle_quality_event_message(msg1)
        msg1.ack.assert_called_once()
        assert mock_start.call_count == 1

        # Second message with same event_id: dropped and acked
        pubsub_manager._handle_quality_event_message(msg2)
        msg2.ack.assert_called_once()
        assert mock_start.call_count == 1  # Not incremented


def test_pubsub_stale_quality_event_dropped():
    """Verify quality event older than quality_event_max_age_seconds is dropped and acked."""
    old_time = datetime.now(timezone.utc) - timedelta(seconds=settings.quality_event_max_age_seconds + 30)
    event = QualityEventPayload(timestamp=old_time.isoformat())
    msg = MagicMock()
    msg.data = event.model_dump_json().encode("utf-8")

    with (
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
    ):
        pubsub_manager._handle_quality_event_message(msg)
        msg.ack.assert_called_once()
        mock_start.assert_not_called()


def test_pubsub_unparsable_timestamp_logs_warning_and_processes():
    """Verify unparsable timestamp logs warning but still processes event."""
    event_dict = QualityEventPayload().model_dump()
    event_dict["timestamp"] = "invalid-non-iso-timestamp-format"
    import json
    msg_data = json.dumps(event_dict).encode("utf-8")

    msg = MagicMock()
    msg.data = msg_data

    with (
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
    ):
        pubsub_manager._handle_quality_event_message(msg)
        msg.ack.assert_called_once()
        mock_start.assert_called_once()
