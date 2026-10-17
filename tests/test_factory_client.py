"""Unit tests for FactorySimulatorClient and severity mapping.

TKT-073 / #288: backend -> factory auth switched from shared X-API-Key to
central JWT minted by ``/api/auth/login``. These tests cover the new Bearer
contract: every request to the factory service must carry ``Authorization:
Bearer <jwt>`` and never an ``X-API-Key`` header. Cached tokens are reused
across calls; a 401 from the factory refreshes the token once and retries.
"""

from __future__ import annotations

import httpx
import pytest

from backend.core.config import settings
from backend.tools.factory_client import (
    FactorySimulatorClient,
    _bearer_cache,
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
async def test_client_url_unset_skips_network(monkeypatch):
    """Verify URL unset returns skipped=True, ok=False with zero network requests (Invariant #4)."""
    monkeypatch.setattr(settings, "factory_service_account_username", None)
    monkeypatch.setattr(settings, "factory_service_account_password", None)
    monkeypatch.setattr(settings, "factory_backend_base_url", None)
    _bearer_cache.invalidate()
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
async def test_client_200_ok_responses(monkeypatch):
    """Verify successful 200 responses for inject, reset, and status endpoints under Bearer auth."""

    async def fake_bearer() -> str | None:
        return "test-jwt-abc123"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer test-jwt-abc123"
        assert "x-api-key" not in request.headers
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
        bearer_provider=fake_bearer,
    )

    inject_res = await client.inject_anomaly(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        severity="high",
        mode="fast",
        dispatch_quality_event=False,
    )
    assert inject_res.ok is True
    assert inject_res.details == {"status": "ok", "injected": True}

    reset_res = await client.reset_factory()
    assert reset_res.ok is True
    assert reset_res.details == {"status": "ok", "message": "reset done"}

    status_res = await client.get_status()
    assert status_res.ok is True
    assert status_res.details == {"running": True, "machine_count": 4}


@pytest.mark.asyncio
async def test_client_bearer_mint_failure_surfaces_typed_auth_error(monkeypatch):
    """When login credentials are missing, factory_client surfaces a FactoryAuthError result.

    Per the brief-locked TKT-073 / #288 contract (no backwards-compat shim, "Raise typed
    exception on persistent 401"), missing service-account credentials or an absent
    factory_backend_base_url now produce a FactorySyncResult with
    ``ok=False, skipped=False, error="FactoryAuthError: ..."`` instead of the legacy
    ``bearer_unavailable`` silent-skip. The outer API can branch on the prefix to map
    to a 502 Bad Gateway upstream.
    """
    monkeypatch.setattr(settings, "factory_service_account_username", None)
    monkeypatch.setattr(settings, "factory_service_account_password", None)
    monkeypatch.setattr(settings, "factory_backend_base_url", None)
    _bearer_cache.invalidate()

    client = FactorySimulatorClient(base_url="http://mock-factory:8080")

    res = await client.inject_anomaly()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert res.error.startswith("FactoryAuthError:")


@pytest.mark.asyncio
async def test_client_500_error_handled_gracefully():
    """Verify 500 error response returns ok=False, error message, and never raises."""

    async def fake_bearer() -> str | None:
        return "test-jwt-abc123"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error on Factory Simulator")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        bearer_provider=fake_bearer,
    )

    res = await client.inject_anomaly()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "500" in res.error


@pytest.mark.asyncio
async def test_client_connect_timeout_handled_gracefully():
    """Verify connection timeout returns ok=False, error message, and never raises."""

    async def fake_bearer() -> str | None:
        return "test-jwt-abc123"

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("Connection to factory simulator timed out")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        timeout=0.1,
        bearer_provider=fake_bearer,
    )

    res = await client.reset_factory()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "timed out" in res.error.lower()


@pytest.mark.asyncio
async def test_client_read_timeout_handled_gracefully():
    """Verify read timeout returns ok=False, error message, and never raises."""

    async def fake_bearer() -> str | None:
        return "test-jwt-abc123"

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Read timed out from factory server")

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        timeout=0.1,
        bearer_provider=fake_bearer,
    )

    res = await client.get_status()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "read timed out" in res.error.lower()


@pytest.mark.real_auth
@pytest.mark.asyncio
async def test_client_sends_bearer_header_no_api_key():
    """Bearer contract: every factory request carries Authorization: Bearer <jwt> and never X-API-Key.

    Records all observed headers so we can assert the absence of X-API-Key and
    the presence of the JWT (whatever token the upstream mint function returns).
    Invalidates the module-scoped bearer cache so earlier tests' cached tokens
    cannot leak into this assertion.
    """
    _bearer_cache.invalidate()
    recorded_headers: dict[str, str] = {}

    async def fake_bearer() -> str | None:
        return "freshly-minted-jwt-token"

    def handler(request: httpx.Request) -> httpx.Response:
        recorded_headers.update(dict(request.headers))
        return httpx.Response(200, json={"status": "ok"})

    mock_transport = httpx.MockTransport(handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        bearer_provider=fake_bearer,
    )

    res = await client.inject_anomaly()
    assert res.ok is True
    assert recorded_headers.get("authorization") == "Bearer freshly-minted-jwt-token"
    assert "x-api-key" not in {k.lower() for k in recorded_headers}


@pytest.mark.real_auth
@pytest.mark.asyncio
async def test_client_cached_token_reuse_single_login(monkeypatch):
    """Cached token reuse: a single login() call services multiple factory requests.

    Forces the module-scoped Bearer cache to start empty; counts how many times
    the bearer provider is invoked across three factory calls. Expectation: the
    provider is invoked exactly once (mint), then the cache serves the next two.
    """
    _bearer_cache.invalidate()
    monkeypatch.setattr(settings, "factory_service_account_username", "op-1")
    monkeypatch.setattr(settings, "factory_service_account_password", "pw-1")
    monkeypatch.setattr(settings, "factory_backend_base_url", "http://mock-backend:8080")

    provider_calls = {"count": 0}

    async def bearer_provider() -> str | None:
        provider_calls["count"] += 1
        return "cached-jwt-xyz"

    def factory_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer cached-jwt-xyz"
        return httpx.Response(200, json={"status": "ok"})

    factory_transport = httpx.MockTransport(factory_handler)

    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=factory_transport,
        bearer_provider=bearer_provider,
    )

    # 3 successive factory calls; the cache should serve the next two from cache.
    for _ in range(3):
        res = await client.inject_anomaly()
        assert res.ok is True

    # Provider was invoked exactly once (first call mints, next two hit cache).
    assert provider_calls["count"] == 1


@pytest.mark.real_auth
@pytest.mark.asyncio
async def test_client_401_triggers_token_refresh_and_retry():
    """401 from factory refreshes the Bearer token and retries the request exactly once.

    First factory call: returns 401, the bearer cache is invalidated and the
    token is re-minted. Second factory call (retry): returns 200 with the new
    token. Total login invocations: 2 (initial + after refresh).
    """
    _bearer_cache.invalidate()

    minted_tokens = iter(["first-jwt", "second-jwt-after-refresh"])

    async def provider() -> str | None:
        return next(minted_tokens)

    state = {"factory_calls": 0}

    def factory_handler(request: httpx.Request) -> httpx.Response:
        state["factory_calls"] += 1
        token = request.headers.get("authorization", "")
        if token == "Bearer first-jwt":
            return httpx.Response(401, text="token expired")
        if token == "Bearer second-jwt-after-refresh":
            return httpx.Response(200, json={"status": "ok"})
        return httpx.Response(400, text="unexpected token")

    mock_transport = httpx.MockTransport(factory_handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        bearer_provider=provider,
    )

    res = await client.inject_anomaly()
    assert res.ok is True
    # Exactly two factory calls: one 401 + one 200 after refresh.
    assert state["factory_calls"] == 2


@pytest.mark.real_auth
@pytest.mark.asyncio
async def test_client_401_persistent_returns_error_after_one_retry():
    """Persistent 401 (refresh did not help) returns ok=False with HTTP 401 in error."""

    async def provider() -> str | None:
        return "stale-jwt"

    state = {"factory_calls": 0}

    def factory_handler(request: httpx.Request) -> httpx.Response:
        state["factory_calls"] += 1
        return httpx.Response(401, text="still unauthorized")

    mock_transport = httpx.MockTransport(factory_handler)
    client = FactorySimulatorClient(
        base_url="http://mock-factory:8080",
        transport=mock_transport,
        bearer_provider=provider,
    )

    res = await client.inject_anomaly()
    assert res.ok is False
    assert res.skipped is False
    assert res.error is not None
    assert "401" in res.error
    # Initial 401 + one refresh + one retry 401 = 2 factory calls, then give up.
    assert state["factory_calls"] == 2
