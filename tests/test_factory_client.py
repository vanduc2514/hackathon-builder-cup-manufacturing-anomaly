"""Unit tests for FactorySimulatorClient and severity mapping."""

from __future__ import annotations

import httpx
import pytest

from backend.tools.factory_client import (
    FactorySimulatorClient,
    map_severity_to_float,
)


def test_severity_mapping_values():
    """Verify severity mapping matches C5 specification: low 0.5, medium 1.0, high 1.5, critical 2.0, unknown 1.0."""
    assert map_severity_to_float("low") == 0.5
    assert map_severity_to_float("medium") == 1.0
    assert map_severity_to_float("high") == 1.5
    assert map_severity_to_float("critical") == 2.0
    assert map_severity_to_float("unknown") == 1.0
    assert map_severity_to_float("") == 1.0
    assert map_severity_to_float(None) == 1.0
    assert map_severity_to_float("LOW") == 0.5
    assert map_severity_to_float(" High ") == 1.5
    assert map_severity_to_float(1.75) == 1.75
    assert map_severity_to_float(2) == 2.0


@pytest.mark.asyncio
async def test_client_url_unset_skips_network():
    """Verify URL unset returns skipped=True, ok=False with zero network requests (Invariant #4)."""
    client = FactorySimulatorClient(base_url="")
    assert not client.is_configured()

    res_inject = await client.inject_anomaly()
    assert res_inject.skipped is True
    assert res_inject.ok is False
    assert res_inject.latency_ms == 0.0

    res_reset = await client.reset_factory()
    assert res_reset.skipped is True
    assert res_reset.ok is False

    res_status = await client.get_status()
    assert res_status.skipped is True
    assert res_status.ok is False


@pytest.mark.asyncio
async def test_client_200_ok_responses():
    """Verify successful 200 responses for inject, reset, and status endpoints."""
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/factory/inject":
            return httpx.Response(200, json={"status": "ok", "injected": True})
        if request.url.path == "/api/factory/reset":
            return httpx.Response(200, json={"status": "ok", "message": "reset done"})
        if request.url.path == "/api/factory/status":
            return httpx.Response(200, json={"running": True, "machine_count": 4})
        return httpx.Response(404)

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
    )

    # 1. Inject
    inject_res = await client.inject_anomaly(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        severity="high",
        mode="fast",
        dispatch_quality_event=False,
    )
    assert inject_res.ok is True
    assert inject_res.skipped is False
    assert inject_res.error is None
    assert inject_res.details == {"status": "ok", "injected": True}
    assert inject_res.latency_ms >= 0.0

    # 2. Reset
    reset_res = await client.reset_factory()
    assert reset_res.ok is True
    assert reset_res.skipped is False
    assert reset_res.details == {"status": "ok", "message": "reset done"}

    # 3. Status
    status_res = await client.get_status()
    assert status_res.ok is True
    assert status_res.skipped is False
    assert status_res.details == {"running": True, "machine_count": 4}


@pytest.mark.asyncio
async def test_client_500_error_handled_gracefully():
    """Verify 500 error response returns ok=False, error message, and never raises."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error on Factory Simulator")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
    )

    res = await client.inject_anomaly()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "500" in res.error
    assert "Internal Server Error" in res.error


@pytest.mark.asyncio
async def test_client_connect_timeout_handled_gracefully():
    """Verify connection timeout returns ok=False, error message, and never raises."""
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("Connection to factory simulator timed out")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        timeout=0.1,
        transport=mock_transport,
    )

    res = await client.reset_factory()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "timed out" in res.error.lower()


@pytest.mark.asyncio
async def test_client_read_timeout_handled_gracefully():
    """Verify read timeout returns ok=False, error message, and never raises."""
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Read timed out from factory server")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        timeout=0.1,
        transport=mock_transport,
    )

    res = await client.get_status()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "read timed out" in res.error.lower()


@pytest.mark.asyncio
async def test_client_sends_api_key_header():
    """Verify FactorySimulatorClient sends X-API-Key header when configured."""
    recorded_headers = {}

    def handler(request: httpx.Request) -> httpx.Response:
        recorded_headers.update(dict(request.headers))
        return httpx.Response(200, json={"status": "ok"})

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        api_key="test-secret-key-123",
    )

    res = await client.inject_anomaly()
    assert res.ok is True
    assert recorded_headers.get("x-api-key") == "test-secret-key-123"


@pytest.mark.asyncio
async def test_client_401_unauthorized_maps_to_ok_false():
    """Verify 401 Unauthorized maps to ok=False with clear error message without raising."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="Invalid or missing X-API-Key header")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        api_key="wrong-key",
    )

    res = await client.reset_factory()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "401" in res.error
    assert "Invalid or missing X-API-Key" in res.error
