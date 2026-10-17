"""Factory Simulator Client: Asynchronous HTTP client communicating with Factory Floor Simulator."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

import httpx

from backend.core.config import settings
from backend.core.models import FactorySyncResult

logger = logging.getLogger(__name__)

SEVERITY_MAP: dict[str, float] = {
    "low": 0.5,
    "medium": 1.0,
    "high": 1.5,
    "critical": 2.0,
}


def map_severity_to_float(severity: str | float | None) -> float:
    """Maps backend string severity to simulator float multiplier.

    low: 0.5, medium: 1.0, high: 1.5, critical: 2.0, unknown: 1.0.
    """
    if severity is None:
        return 1.0
    if isinstance(severity, (int, float)):
        return float(severity)
    return SEVERITY_MAP.get(str(severity).lower().strip(), 1.0)


# Module-scoped Bearer token cache: the backend reuses a single JWT across all
# factory calls until it expires, then refreshes transparently on the next call.
class _BearerCache:
    """Thread-/asyncio-safe cache for a single Bearer token and its expiry."""

    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._expires_at: float = 0.0
        # Serialise concurrent refresh attempts so we never log in twice in parallel.
        self._lock = asyncio.Lock()

    async def get_or_refresh(
        self, refresh: Callable[[], Awaitable[Optional[tuple[str, float]]]]
    ) -> Optional[str]:
        """Return a usable token. Calls `refresh()` to mint a new one when needed.

        `refresh()` returns a `(token, expires_at_epoch_seconds)` tuple on success,
        or `None` if credentials are not configured / login fails.
        """
        if self._token and self._expires_at > time.time() + 30.0:
            return self._token
        async with self._lock:
            if self._token and self._expires_at > time.time() + 30.0:
                return self._token
            result = await refresh()
            if result is None:
                return None
            token, expires_at = result
            self._token = token
            self._expires_at = expires_at
            return token

    def invalidate(self) -> None:
        self._token = None
        self._expires_at = 0.0


_bearer_cache = _BearerCache()


def _parse_expires_at(value: object) -> Optional[float]:
    """Converts an ISO-8601 ``expires_at`` into epoch seconds, or None on parse failure.

    Accepts strings with or without a trailing ``Z`` (treated as UTC) since
    Pydantic's ``LoginResponse.expires_at`` serialises as ``2026-10-18T07:30:00+00:00``.
    """
    if not isinstance(value, str) or not value:
        return None
    candidate = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


async def _refresh_factory_bearer() -> Optional[tuple[str, float]]:
    """Mint a new factory-operator JWT via the central backend login endpoint.

    Returns (token, expires_at_epoch_seconds), or None when operator creds are
    not configured / the login request fails. Failures are logged at WARNING
    and the caller is expected to skip the factory call (graceful degradation).
    """
    base = (settings.backend_public_url or settings.backend_url or "").rstrip("/")
    account = settings.factory_operator_account
    password = settings.factory_operator_password
    if not base or not account or not password:
        logger.debug(
            "Factory operator credentials not configured (backend_public_url=%s, account_set=%s); "
            "skipping Bearer refresh",
            bool(base),
            bool(account),
        )
        return None
    try:
        async with httpx.AsyncClient(timeout=settings.factory_timeout_seconds) as client:
            resp = await client.post(
                f"{base}/api/auth/login",
                json={"username": account, "password": password},
            )
        if not resp.is_success:
            logger.warning(
                "Factory operator login to %s failed: HTTP %d %s",
                f"{base}/api/auth/login",
                resp.status_code,
                resp.text[:200],
            )
            return None
        data = resp.json()
        token = data.get("token")
        if not token:
            logger.warning("Factory operator login response missing 'token' field")
            return None
        # ``LoginResponse`` carries an ISO-8601 ``expires_at``; fall back to the
        # configured TTL (seconds) when the field is absent or malformed so the
        # caller still gets a usable cache window.
        expires_at_epoch = _parse_expires_at(data.get("expires_at"))
        if expires_at_epoch is None:
            expires_at_epoch = time.time() + float(settings.auth_token_ttl_hours) * 3600.0
        return token, expires_at_epoch
    except Exception as exc:  # pragma: no cover - network failures are expected in dev
        logger.warning("Factory operator login request raised: %s", exc)
        return None


class FactorySimulatorClient:
    """Asynchronous HTTP client for controlling and querying the factory simulator."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        bearer_provider: Optional[Callable[[], Awaitable[Optional[str]]]] = None,
    ) -> None:
        self._explicit_base_url = base_url
        self._explicit_timeout = timeout
        self._transport = transport
        self._explicit_bearer_provider = bearer_provider

    @property
    def base_url(self) -> Optional[str]:
        """Resolves base URL from explicit parameter or settings."""
        url = (
            self._explicit_base_url
            if self._explicit_base_url is not None
            else settings.factory_service_url
        )
        return url.rstrip("/") if url else None

    @property
    def timeout(self) -> float:
        """Resolves timeout from explicit parameter or settings."""
        if self._explicit_timeout is not None:
            return self._explicit_timeout
        return settings.factory_timeout_seconds

    async def _bearer(self) -> Optional[str]:
        """Returns a cached Bearer token, minting one if missing/expired."""
        if self._explicit_bearer_provider is not None:
            return await self._explicit_bearer_provider()
        return await _bearer_cache.get_or_refresh(_refresh_factory_bearer)

    def is_configured(self) -> bool:
        """True if a non-empty factory service URL is configured."""
        return bool(self.base_url)

    async def _request(
        self,
        method: str,
        path: str,
        json_payload: Optional[dict[str, Any]] = None,
    ) -> FactorySyncResult:
        """Internal helper to dispatch requests gracefully without raising.

        Uses a Bearer token for auth; refreshes once on 401 and retries before
        giving up. All non-success paths return a structured FactorySyncResult
        rather than raising, so callers can degrade gracefully.
        """
        base = self.base_url
        if not base:
            logger.debug("Factory simulator URL not configured; skipping call to %s", path)
            return FactorySyncResult(
                ok=False,
                latency_ms=0.0,
                endpoint=path,
                error=None,
                skipped=True,
            )

        endpoint = f"{base}{path}"
        client_kwargs: dict[str, Any] = {"timeout": self.timeout}
        if self._transport is not None:
            client_kwargs["transport"] = self._transport

        # One attempt plus at most one retry after a forced Bearer refresh.
        for attempt in (1, 2):
            start_time = time.monotonic()
            bearer = await self._bearer()
            if not bearer:
                logger.debug(
                    "Factory simulator Bearer token unavailable; skipping call to %s", path
                )
                return FactorySyncResult(
                    ok=False,
                    latency_ms=0.0,
                    endpoint=path,
                    error="bearer_unavailable",
                    skipped=True,
                )
            headers = {"Authorization": f"Bearer {bearer}"}
            try:
                async with httpx.AsyncClient(**client_kwargs) as client:
                    response = await client.request(
                        method, endpoint, json=json_payload, headers=headers
                    )
                latency_ms = round((time.monotonic() - start_time) * 1000.0, 2)

                if response.is_success:
                    try:
                        data = response.json()
                    except Exception:
                        data = None
                    return FactorySyncResult(
                        ok=True,
                        latency_ms=latency_ms,
                        endpoint=endpoint,
                        error=None,
                        skipped=False,
                        details=data if isinstance(data, dict) else None,
                    )

                if response.status_code == 401 and attempt == 1:
                    logger.warning(
                        "Factory simulator returned 401 for %s; refreshing Bearer and retrying once",
                        endpoint,
                    )
                    _bearer_cache.invalidate()
                    continue

                body_preview = response.text[:200]
                logger.warning(
                    "Factory simulator request to %s returned HTTP %d: %s",
                    endpoint,
                    response.status_code,
                    body_preview,
                )
                return FactorySyncResult(
                    ok=False,
                    latency_ms=latency_ms,
                    endpoint=endpoint,
                    error=f"HTTP {response.status_code}: {body_preview}",
                    skipped=False,
                )
            except Exception as exc:
                latency_ms = round((time.monotonic() - start_time) * 1000.0, 2)
                logger.warning("Factory simulator request to %s failed: %s", endpoint, exc)
                return FactorySyncResult(
                    ok=False,
                    latency_ms=latency_ms,
                    endpoint=endpoint,
                    error=str(exc),
                    skipped=False,
                )

        # Defensive: loop always returns inside, but keep type-checkers happy.
        return FactorySyncResult(
            ok=False,
            latency_ms=0.0,
            endpoint=path,
            error="bearer_retry_exhausted",
            skipped=False,
        )

    async def inject_anomaly(
        self,
        scenario: str = "cnc_tool_wear",
        machine_id: Optional[str] = None,
        severity: float | str = 1.0,
        mode: str = "demo",
        dispatch_quality_event: bool = False,
    ) -> FactorySyncResult:
        """Triggers an anomaly injection on the factory simulator."""
        severity_float = map_severity_to_float(severity)
        payload: dict[str, Any] = {
            "scenario": scenario,
            "severity": severity_float,
            "mode": mode,
            "dispatch_quality_event": dispatch_quality_event,
        }
        if machine_id:
            payload["machine_id"] = machine_id

        return await self._request("POST", "/api/factory/inject", json_payload=payload)

    async def reset_factory(self) -> FactorySyncResult:
        """Restores factory machinery and conveyor systems to nominal baseline."""
        return await self._request("POST", "/api/factory/reset")

    async def get_status(self) -> FactorySyncResult:
        """Retrieves operating status and machine fleet from factory simulator."""
        return await self._request("GET", "/api/factory/status")


factory_client = FactorySimulatorClient()
