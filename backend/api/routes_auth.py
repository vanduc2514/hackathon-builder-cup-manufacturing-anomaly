"""Auth Routes: public login and demo-account listing endpoints."""

from __future__ import annotations

import logging
import math

from fastapi import APIRouter, HTTPException, status

from backend.core.auth import AuthError, authenticate, issue_token
from backend.core.config import settings
from backend.core.models import DemoAccount, LoginRequest, LoginResponse
from backend.core.rate_limit import rate_limiter, rules

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    """Exchanges a username/password for a signed API token."""
    if not settings.auth_users or not settings.auth_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Login is not configured")
    # Keyed by username, not IP: rotating source addresses does not buy more guesses.
    username = body.username.strip().lower()
    failure_rule = rules()["login_failure"]
    retry_after = (
        rate_limiter.blocked(failure_rule, username) if settings.rate_limit_enabled else None
    )
    if retry_after is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed logins; try again later",
            headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
        )
    user = authenticate(body.username, body.password)
    if user is None:
        if settings.rate_limit_enabled:
            rate_limiter.hit(failure_rule, username)
        logger.warning("Failed login for username %r", body.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    try:
        return issue_token(user)
    except AuthError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc


@router.get("/accounts", response_model=list[DemoAccount])
async def list_accounts() -> list[DemoAccount]:
    """Accounts the login screens can offer (no passwords)."""
    return [
        DemoAccount(username=account.username, display_name=account.display_name, role=account.role)
        for account in settings.auth_users
    ]
