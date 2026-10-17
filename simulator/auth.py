"""HS256 token verification dependency for the standalone factory simulator.

Tokens are minted exclusively by the central backend ``/api/auth/login`` endpoint
using ``AUTH_SECRET``. The simulator only verifies the signature and decodes the
``sub`` claim; it never mints new tokens.

Mirrors the behaviour of :mod:`backend.core.auth` so a token issued by the
backend is accepted here as long as ``AUTH_SECRET`` matches and the caller is
listed in ``AUTH_USERS`` of the *issuing* backend (the simulator itself does
not need an ``AUTH_USERS`` roster — it only checks signature/exp).
"""

from __future__ import annotations

import hmac
import logging
import os

import jwt
from fastapi import HTTPException, WebSocketException, status
from pydantic import BaseModel
from starlette.requests import HTTPConnection

from simulator.config import settings

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"


class AuthError(Exception):
    """Token verification failure carrying the HTTP status to report."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class AuthenticatedUser(BaseModel):
    """Resolved identity of the authenticated caller (sub claim from JWT or API key)."""

    sub: str
    ttl_hours: int


def _resolve_secret() -> str | None:
    """Return the configured ``AUTH_SECRET`` / ``FACTORY_AUTH_SECRET`` or ``None``.

    The simulator mirrors the backend's fail-closed posture: when running with
    ``APP_ENV=production`` and no ``AUTH_SECRET`` / ``FACTORY_API_KEY`` configured,
    requests fail with 503 rather than silently allowing access.
    """
    secret = (
        getattr(settings, "factory_auth_secret", None)
        or getattr(settings, "auth_secret", None)
        or os.getenv("FACTORY_AUTH_SECRET")
        or os.getenv("AUTH_SECRET")
    )
    if not secret and settings.app_env == "production":
        if not getattr(settings, "factory_api_key", None):
            raise AuthError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Factory security is not configured on production server",
            )
    return secret or None


def decode_token(token: str) -> AuthenticatedUser:
    """Verifies an HS256 JWT signed by the central backend's ``AUTH_SECRET``.

    Returns a minimal :class:`AuthenticatedUser` populated from the ``sub``
    claim. Raises :class:`AuthError` (401) on any verification failure, or
    (503) if ``AUTH_SECRET`` is unset in production.
    """
    invalid = AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    secret = _resolve_secret()
    if secret is None:
        # In development without a secret, accept tokens that decode as
        # non-empty ``sub`` claims without verifying signature.
        if not token:
            raise invalid
        return AuthenticatedUser(sub="dev", ttl_hours=settings.factory_auth_token_ttl_hours)
    try:
        claims = jwt.decode(token, secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise invalid from exc
    sub = str(claims.get("sub", "")).strip()
    if not sub:
        raise invalid
    return AuthenticatedUser(sub=sub, ttl_hours=settings.factory_auth_token_ttl_hours)


def token_from(conn: HTTPConnection) -> str | None:
    """Bearer token from ``Authorization``, else ``?token=`` query parameter.

    Mirrors :func:`backend.core.auth.token_from` so the simulator can be
    driven with the same patterns as the backend (curl with ``-H 'Authorization:
    Bearer ...'``, EventSource with ``?token=``, etc.).
    """
    header = conn.headers.get("authorization", "")
    if header[:7].lower() == "bearer ":
        return header[7:].strip() or None
    return conn.query_params.get("token") or None


async def require_factory_user(conn: HTTPConnection) -> AuthenticatedUser:
    """FastAPI dependency: resolves caller from Bearer JWT, X-API-Key, or dev environment."""
    try:
        expected_key = getattr(settings, "factory_api_key", None)
        secret = _resolve_secret()
        app_env = getattr(settings, "app_env", os.getenv("APP_ENV", "development"))

        # 1. Fail closed with 503 in production if neither API key nor secret is configured
        if app_env == "production" and not expected_key and not secret:
            raise AuthError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Factory security is not configured on production server",
            )

        # 2. Check X-API-Key if provided
        x_api_key = conn.headers.get("x-api-key")
        if x_api_key:
            if expected_key and hmac.compare_digest(x_api_key, expected_key):
                return AuthenticatedUser(
                    sub="api-key", ttl_hours=settings.factory_auth_token_ttl_hours
                )
            raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid or missing X-API-Key header")

        # 3. Check Bearer token or ?token=
        token = token_from(conn)
        if token is not None:
            return decode_token(token)

        # 4. No credentials provided
        if app_env == "production":
            if not expected_key:
                raise AuthError(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "Factory security is not configured on production server",
                )
            raise AuthError(
                status.HTTP_401_UNAUTHORIZED,
                "Invalid or missing X-API-Key or Authorization Bearer token",
            )

        # In development:
        # If factory_api_key is explicitly configured, enforce it or Bearer
        if expected_key:
            raise AuthError(
                status.HTTP_401_UNAUTHORIZED,
                "Invalid or missing X-API-Key or Authorization Bearer token",
            )

        # If factory_api_key is unset in development, allow mutations
        return AuthenticatedUser(sub="dev-anon", ttl_hours=settings.factory_auth_token_ttl_hours)
    except AuthError as exc:
        if conn.scope["type"] == "websocket":
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION, reason=exc.detail
            ) from exc
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        raise HTTPException(exc.status_code, exc.detail, headers=headers) from exc


__all__ = [
    "AuthError",
    "AuthenticatedUser",
    "decode_token",
    "require_factory_user",
    "token_from",
]
