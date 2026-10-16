"""Factory Simulator Client: Asynchronous HTTP client communicating with Factory Floor Simulator."""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

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


class FactorySimulatorClient:
    """Asynchronous HTTP client for controlling and querying the factory simulator."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._explicit_base_url = base_url
        self._explicit_timeout = timeout
        self._transport = transport

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

    def is_configured(self) -> bool:
        """True if a non-empty factory service URL is configured."""
        return bool(self.base_url)

    async def _request(
        self,
        method: str,
        path: str,
        json_payload: Optional[dict[str, Any]] = None,
    ) -> FactorySyncResult:
        """Internal helper to dispatch requests gracefully without raising."""
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
        start_time = time.monotonic()
        try:
            client_kwargs: dict[str, Any] = {"timeout": self.timeout}
            if self._transport is not None:
                client_kwargs["transport"] = self._transport
            async with httpx.AsyncClient(**client_kwargs) as client:
                response = await client.request(method, endpoint, json=json_payload)
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
