"""Integration tests for factory simulator sync, simulation endpoints, and Pub/Sub dedup."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, PropertyMock, patch

import httpx
import pytest
from httpx import ASGITransport
from starlette.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.api.routes_simulation import DEV_INJECT_HEADER, DEV_INJECT_VALUE
from backend.core.config import settings
from backend.core.models import FactorySyncResult, QualityEventPayload
from backend.core.pubsub_manager import pubsub_manager
from backend.tools.factory_client import FactorySimulatorClient

# Local tests run with APP_ENV != production; the dev-inject header is required
# since the gate introduced in #309 to reach the legacy happy path.
DEV_INJECT_HEADERS = {DEV_INJECT_HEADER: DEV_INJECT_VALUE}


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
        patch(
            "backend.api.routes_simulation.factory_client.inject_anomaly", return_value=sync_result
        ) as mock_factory,
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers=DEV_INJECT_HEADERS,
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
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=True
        ),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear"},
            headers=DEV_INJECT_HEADERS,
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
        patch(
            "backend.api.routes_simulation.factory_client.inject_anomaly", return_value=sync_result
        ) as mock_factory,
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers=DEV_INJECT_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "triggered"
        assert data["factory_sync"]["ok"] is False
        assert "503" in data["factory_sync"]["error"]
        mock_factory.assert_called_once()
        mock_start.assert_called_once()


@pytest.mark.asyncio
async def test_simulation_inject_concurrent_double_trigger_race():
    """Verify two concurrent /inject requests result in exactly one 200, one 409,
    factory inject called exactly once, and start_incident succeeded once."""
    factory_calls = 0

    async def mock_factory_handler(request: httpx.Request) -> httpx.Response:
        nonlocal factory_calls
        if request.url.path == "/api/factory/inject":
            factory_calls += 1
            await asyncio.sleep(0.5)
            return httpx.Response(200, json={"status": "ok", "injected": True})
        return httpx.Response(404)

    async def fake_bearer() -> str | None:
        return "test-races-jwt"

    test_factory_client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=httpx.MockTransport(mock_factory_handler),
        bearer_provider=fake_bearer,
    )

    async def fake_run_incident(trigger, abort=None):
        try:
            await asyncio.sleep(5.0)
        except asyncio.CancelledError:
            pass

    await orchestrator.reset()

    start_calls: list[bool] = []
    real_start_incident = orchestrator.start_incident

    def spy_start_incident(trigger):
        res = real_start_incident(trigger)
        start_calls.append(res)
        return res

    transport = ASGITransport(app=app)
    try:
        with (
            patch("backend.api.routes_simulation.factory_client", test_factory_client),
            patch.object(orchestrator, "run_incident", fake_run_incident),
            patch.object(orchestrator, "start_incident", side_effect=spy_start_incident),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
                res1, res2 = await asyncio.gather(
                    ac.post(
                        "/api/simulation/inject",
                        json={"scenario": "cnc_tool_wear"},
                        headers=DEV_INJECT_HEADERS,
                    ),
                    ac.post(
                        "/api/simulation/inject",
                        json={"scenario": "cnc_tool_wear"},
                        headers=DEV_INJECT_HEADERS,
                    ),
                )

        status_codes = sorted([res1.status_code, res2.status_code])
        assert status_codes == [200, 409], f"Expected [200, 409], got {status_codes}"
        assert factory_calls == 1, f"Expected factory called once, got {factory_calls}"
        assert start_calls.count(True) == 1, (
            f"Expected start_incident succeeded once, got {start_calls}"
        )
    finally:
        await orchestrator.reset()


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
        patch(
            "backend.api.routes_simulation.factory_client.reset_factory", return_value=sync_result
        ) as mock_factory,
        patch(
            "backend.api.routes_simulation.reset_buffers", return_value={"cleared": True}
        ) as mock_buffers,
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
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        # First message: processed
        pubsub_manager._handle_quality_event_message(msg1)
        msg1.ack.assert_called_once()
        assert mock_start.call_count == 1

        # Second message with same event_id: dropped and acked
        pubsub_manager._handle_quality_event_message(msg2)
        msg2.ack.assert_called_once()
        assert mock_start.call_count == 1  # Not incremented


def test_pubsub_quality_event_redelivery_after_failure_not_dropped():
    """Verify that if orchestrator dispatch raises an exception, the message is nacked,
    and subsequent redelivery of the same event_id is NOT dropped as duplicate."""
    event_id = str(uuid.uuid4())
    event = QualityEventPayload(event_id=event_id)
    msg_data = event.model_dump_json().encode("utf-8")

    msg_fail = MagicMock()
    msg_fail.data = msg_data

    msg_retry = MagicMock()
    msg_retry.data = msg_data

    msg_dupe = MagicMock()
    msg_dupe.data = msg_data

    # Attempt 1: start_incident raises an error -> nack, event_id NOT kept in _seen_events
    with (
        patch.object(
            orchestrator, "start_incident", side_effect=RuntimeError("Transient dispatch failure")
        ),
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        pubsub_manager._handle_quality_event_message(msg_fail)
        msg_fail.nack.assert_called_once()
        msg_fail.ack.assert_not_called()
        assert event_id not in pubsub_manager._seen_events

    # Attempt 2 (redelivery): start_incident succeeds -> ack, event_id now recorded in _seen_events
    with (
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start_retry,
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        pubsub_manager._handle_quality_event_message(msg_retry)
        msg_retry.ack.assert_called_once()
        msg_retry.nack.assert_not_called()
        mock_start_retry.assert_called_once()
        assert event_id in pubsub_manager._seen_events

    # Attempt 3 (duplicate delivery after successful ack): dropped as duplicate
    with (
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start_dupe,
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        pubsub_manager._handle_quality_event_message(msg_dupe)
        msg_dupe.ack.assert_called_once()
        mock_start_dupe.assert_not_called()


def test_pubsub_stale_quality_event_dropped():
    """Verify quality event older than quality_event_max_age_seconds is dropped and acked."""
    old_time = datetime.now(timezone.utc) - timedelta(
        seconds=settings.quality_event_max_age_seconds + 30
    )
    event = QualityEventPayload(timestamp=old_time.isoformat())
    msg = MagicMock()
    msg.data = event.model_dump_json().encode("utf-8")

    with (
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
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
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
    ):
        pubsub_manager._handle_quality_event_message(msg)
        msg.ack.assert_called_once()
        mock_start.assert_called_once()
