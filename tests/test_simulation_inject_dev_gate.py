"""Regression tests for issue #309 — HTTP-only incident inject back door gating.

The ``POST /api/simulation/inject`` route used to call
``orchestrator.start_incident()`` directly, bypassing the Pub/Sub data plane that
production traffic follows. After #309 the route is gated behind a debug header
(``X-Kaizen-Dev-Inject: 1``) AND a non-production ``APP_ENV``; production deploys
get ``410 Gone`` regardless of any valid user token.
"""

from __future__ import annotations

import logging
from unittest.mock import PropertyMock, patch

from fastapi.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.api.routes_simulation import DEV_INJECT_HEADER, DEV_INJECT_VALUE
from backend.core.config import settings
from backend.core.models import FactorySyncResult

DEV_HEADER = {DEV_INJECT_HEADER: DEV_INJECT_VALUE}


def test_dev_inject_header_constant_is_stable():
    """Pin the gate header value so accidental renames are caught at CI time."""
    assert DEV_INJECT_HEADER == "X-Kaizen-Dev-Inject"
    assert DEV_INJECT_VALUE == "1"


def test_simulation_inject_without_dev_header_returns_410():
    """Anonymous (header-less) callers must be rejected with 410 Gone, even in dev."""
    client = TestClient(app)
    with patch.object(orchestrator, "start_incident") as mock_start:
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
        )
    assert resp.status_code == 410
    body = resp.json()
    assert DEV_INJECT_HEADER in body["detail"]
    assert "issue #309" in body["detail"]
    # Orchestrator must never be reached
    mock_start.assert_not_called()


def test_simulation_inject_with_wrong_header_value_returns_410():
    """A wrong header value is treated the same as a missing header."""
    client = TestClient(app)
    with patch.object(orchestrator, "start_incident") as mock_start:
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers={DEV_INJECT_HEADER: "yes"},
        )
    assert resp.status_code == 410
    mock_start.assert_not_called()


def test_simulation_inject_in_production_returns_410_even_with_valid_header():
    """Even with a valid debug header, APP_ENV=production must reject the call."""
    client = TestClient(app)
    with (
        patch.object(orchestrator, "start_incident") as mock_start,
        patch.object(settings, "app_env", "production"),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers=DEV_HEADER,
        )
    assert resp.status_code == 410, (
        f"Production must reject the dev-only inject even with the debug header; got {resp.status_code}"
    )
    body = resp.json()
    assert DEV_INJECT_HEADER in body["detail"]
    mock_start.assert_not_called()


def test_simulation_inject_with_dev_header_in_dev_env_triggers_normal_flow():
    """In a non-prod environment with the debug header, the legacy flow runs unchanged."""
    client = TestClient(app)

    sync_result = FactorySyncResult(success=True, mode="direct")

    with (
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
        patch.object(orchestrator, "start_incident", return_value=True) as mock_start,
        patch(
            "backend.tools.factory_client.factory_client.inject_anomaly",
            return_value=sync_result,
        ),
        patch.object(settings, "app_env", "development"),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers=DEV_HEADER,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "triggered"
    assert data["scenario"] == "cnc_tool_wear"
    mock_start.assert_called_once()


def test_simulation_inject_blocked_call_logs_warning(caplog):
    """Blocked dev-inject attempts emit a structured warning for ops visibility."""
    client = TestClient(app)
    with caplog.at_level(logging.WARNING):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
        )
    assert resp.status_code == 410
    assert any("BLOCKED dev-inject attempt" in record.message for record in caplog.records), (
        "Expected structured warning log for blocked dev-inject attempt"
    )


def test_simulation_inject_openapi_documents_deprecation():
    """The OpenAPI schema must still mark the route as deprecated (issue #222)."""
    openapi = app.openapi()
    inject_path = openapi.get("paths", {}).get("/api/simulation/inject", {})
    post_op = inject_path.get("post", {})
    assert post_op.get("deprecated") is True


def test_simulation_inject_does_not_publish_quality_event():
    """The dev gate keeps the legacy behavior: Pub/Sub publish is intentionally skipped."""
    client = TestClient(app)

    with (
        patch.object(
            type(orchestrator), "is_running", new_callable=PropertyMock, return_value=False
        ),
        patch.object(orchestrator, "start_incident", return_value=True),
        patch(
            "backend.tools.factory_client.factory_client.inject_anomaly",
            return_value=FactorySyncResult(success=True, mode="direct"),
        ),
        patch("backend.core.pubsub_manager.pubsub_manager.publish_quality_event") as mock_pub,
        patch.object(settings, "app_env", "development"),
    ):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers=DEV_HEADER,
        )
    assert resp.status_code == 200
    mock_pub.assert_not_called()
