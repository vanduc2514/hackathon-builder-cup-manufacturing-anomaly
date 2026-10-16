"""Unit and integration tests for Pub/Sub quality event exclusivity, debounce cooldown, and endpoint deprecation.

Validates Issue #222:
- /api/simulation/inject is marked deprecated in OpenAPI and returns standard deprecation headers + warning logs.
- Pub/Sub quality event subscriber enforces a 10s cooldown debounce per machine_id.
- Errors during dispatch clean up cooldown for redelivery.
- Different machines can trigger concurrently within the debounce window.
- Single-flight suppression when orchestrator is active.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock, PropertyMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.models import FactorySyncResult, QualityEventPayload
from backend.core.pubsub_manager import pubsub_manager


@pytest.fixture(autouse=True)
def clean_pubsub_state():
    pubsub_manager.reset_availability_cache()
    yield
    pubsub_manager.reset_availability_cache()


def test_simulation_inject_openapi_deprecated():
    """Verify OpenAPI schema marks /api/simulation/inject as deprecated."""
    openapi = app.openapi()
    inject_path = openapi.get("paths", {}).get("/api/simulation/inject", {})
    post_op = inject_path.get("post", {})
    assert post_op.get("deprecated") is True, "POST /api/simulation/inject must be marked deprecated in OpenAPI"


def test_simulation_inject_response_headers_and_warning_log(caplog):
    """Verify calling /api/simulation/inject sets Deprecation headers and emits structured warning log."""
    client = TestClient(app)

    with (
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
        patch("backend.agents.orchestrator.orchestrator.start_incident", return_value=True),
        patch(
            "backend.tools.factory_client.factory_client.inject_anomaly",
            return_value=FactorySyncResult(success=True, mode="direct"),
        ),
        caplog.at_level(logging.WARNING),
    ):
        response = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "machine_id": "CNC-01", "mode": "fast"},
        )

        assert response.status_code == 200
        assert response.headers.get("deprecation") == "true" or response.headers.get("Deprecation") == "true"
        assert 'rel="successor-version"' in response.headers.get("link", "") or 'rel="successor-version"' in response.headers.get("Link", "")

        # Verify structured warning log was emitted
        assert any(
            "DEPRECATED ENDPOINT ACCESSED: POST /api/simulation/inject" in record.message
            for record in caplog.records
        ), "Expected warning log about deprecated endpoint"


def test_pubsub_quality_event_debounce_same_machine():
    """Verify that multiple quality events for the same machine within debounce window are dropped and acked."""
    msg1 = MagicMock()
    msg1.data = QualityEventPayload(
        event_id="evt-m1-01",
        machine_id="CNC-01",
        scenario="cnc_tool_wear",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    msg2 = MagicMock()
    msg2.data = QualityEventPayload(
        event_id="evt-m1-02",
        machine_id="CNC-01",
        scenario="cnc_tool_wear",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    with (
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
        patch("backend.agents.orchestrator.orchestrator.start_incident", return_value=True) as mock_start,
    ):
        # First event triggers orchestrator
        pubsub_manager._handle_quality_event_message(msg1)
        assert mock_start.call_count == 1
        msg1.ack.assert_called_once()

        # Second event for SAME machine arrives immediately (<10s) -> debounced, acked, not dispatched
        pubsub_manager._handle_quality_event_message(msg2)
        assert mock_start.call_count == 1, "Debounced event must not trigger orchestrator"
        msg2.ack.assert_called_once()


def test_pubsub_quality_event_debounce_different_machines():
    """Verify that quality events for different machines within debounce window are both processed."""
    msg_cnc = MagicMock()
    msg_cnc.data = QualityEventPayload(
        event_id="evt-cnc-01",
        machine_id="CNC-01",
        scenario="cnc_tool_wear",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    msg_im = MagicMock()
    msg_im.data = QualityEventPayload(
        event_id="evt-im-01",
        machine_id="IM-05",
        scenario="im_damp_material",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    with (
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
        patch("backend.agents.orchestrator.orchestrator.start_incident", return_value=True) as mock_start,
    ):
        pubsub_manager._handle_quality_event_message(msg_cnc)
        assert mock_start.call_count == 1
        msg_cnc.ack.assert_called_once()

        pubsub_manager._handle_quality_event_message(msg_im)
        assert mock_start.call_count == 2, "Event for different machine must be processed"
        msg_im.ack.assert_called_once()


def test_pubsub_quality_event_debounce_cooldown_expiration():
    """Verify that after the debounce cooldown expires, subsequent event for same machine is dispatched."""
    msg1 = MagicMock()
    msg1.data = QualityEventPayload(
        event_id="evt-exp-01",
        machine_id="CNC-02",
        scenario="cnc_tool_wear",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    msg2 = MagicMock()
    msg2.data = QualityEventPayload(
        event_id="evt-exp-02",
        machine_id="CNC-02",
        scenario="cnc_tool_wear",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    current_time = [100.0]

    with (
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
        patch("backend.agents.orchestrator.orchestrator.start_incident", return_value=True) as mock_start,
        patch("time.monotonic", side_effect=lambda: current_time[0]),
    ):
        pubsub_manager._handle_quality_event_message(msg1)
        assert mock_start.call_count == 1

        # Advance time 15 seconds later (> 10s cooldown)
        current_time[0] = 115.0
        pubsub_manager._handle_quality_event_message(msg2)
        assert mock_start.call_count == 2
        msg2.ack.assert_called_once()


def test_pubsub_quality_event_dispatch_failure_cleans_up_cooldown():
    """Verify that dispatch failure cleans up cooldown and dedup tracking so redelivery can succeed."""
    msg = MagicMock()
    msg.data = QualityEventPayload(
        event_id="evt-fail-01",
        machine_id="CNC-03",
        scenario="cnc_tool_wear",
        severity="high",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    with (
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False),
        patch("backend.agents.orchestrator.orchestrator.start_incident", side_effect=RuntimeError("Transient error")),
    ):
        pubsub_manager._handle_quality_event_message(msg)
        msg.nack.assert_called_once()
        assert "evt-fail-01" not in pubsub_manager._seen_events
        assert "CNC-03" not in pubsub_manager._machine_cooldowns


def test_pubsub_quality_event_single_flight_suppression():
    """Verify that when orchestrator is active, quality events are ignored and acknowledged."""
    msg = MagicMock()
    msg.data = QualityEventPayload(
        event_id="evt-active-01",
        machine_id="CNC-01",
        scenario="cnc_tool_wear",
        severity="medium",
        mode="fast",
    ).model_dump_json().encode("utf-8")

    with (
        patch.object(type(orchestrator), "is_running", new_callable=PropertyMock, return_value=True),
        patch("backend.agents.orchestrator.orchestrator.start_incident") as mock_start,
    ):
        pubsub_manager._handle_quality_event_message(msg)
        mock_start.assert_not_called()
        msg.ack.assert_called_once()
        assert "evt-active-01" in pubsub_manager._seen_events
        assert "CNC-01" in pubsub_manager._machine_cooldowns
