"""Username/password login and signed-token auth dependency for the API."""

from __future__ import annotations

import hmac
import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, WebSocketException, status
from starlette.requests import HTTPConnection

from backend.core.config import settings
from backend.core.models import AuthAccount, AuthUser, LoginResponse

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"


class AuthError(Exception):
    """Login or token failure carrying the HTTP status to report."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _find_account(username: str) -> AuthAccount | None:
    """Case-insensitive AUTH_USERS lookup."""
    wanted = username.strip().lower()
    return next((a for a in settings.auth_users if a.username.lower() == wanted), None)


def _to_user(account: AuthAccount) -> AuthUser:
    return AuthUser(username=account.username, display_name=account.display_name, role=account.role)


def authenticate(username: str, password: str) -> AuthUser | None:
    """Returns the account identity when the password matches, else None."""
    account = _find_account(username)
    if account is None:
        return None
    if not hmac.compare_digest(account.password.encode(), password.encode()):
        return None
    return _to_user(account)


def issue_token(user: AuthUser) -> LoginResponse:
    """Signs an HS256 token for the user, valid for AUTH_TOKEN_TTL_HOURS."""
    if not settings.auth_secret:
        raise AuthError(status.HTTP_503_SERVICE_UNAVAILABLE, "Login is not configured")
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=settings.auth_token_ttl_hours)
    token = jwt.encode(
        {"sub": user.username, "iat": now, "exp": expires},
        settings.auth_secret,
        algorithm=_ALGORITHM,
    )
    return LoginResponse(token=token, expires_at=expires, user=user)


def decode_token(token: str) -> AuthUser:
    """Verifies the token and resolves its subject against the current AUTH_USERS."""
    invalid = AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    if not settings.auth_secret:
        raise invalid
    try:
        claims = jwt.decode(token, settings.auth_secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise invalid from exc
    account = _find_account(str(claims.get("sub", "")))
    if account is None:
        raise invalid
    return _to_user(account)


def token_from(conn: HTTPConnection) -> str | None:
    """Bearer token from the Authorization header, else the ?token= query parameter."""
    header = conn.headers.get("authorization", "")
    if header[:7].lower() == "bearer ":
        return header[7:].strip() or None
    # EventSource and WebSocket cannot send headers, so streams pass ?token=.
    return conn.query_params.get("token") or None


async def require_user(conn: HTTPConnection) -> AuthUser:
    """FastAPI dependency: resolves the caller from a Bearer header or ?token= query."""
    try:
        token = token_from(conn)
        if token is None:
            raise AuthError(status.HTTP_401_UNAUTHORIZED, "Missing token")
        return decode_token(token)
    except AuthError as exc:
        if conn.scope["type"] == "websocket":
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION, reason=exc.detail
            ) from exc
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        raise HTTPException(exc.status_code, exc.detail, headers=headers) from exc
