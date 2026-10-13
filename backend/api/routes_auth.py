"""Auth Routes: public login and demo-account listing endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.core.auth import AuthError, authenticate, issue_token
from backend.core.config import settings
from backend.core.models import DemoAccount, LoginRequest, LoginResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    """Exchanges a username/password for a signed API token."""
    if not settings.auth_users or not settings.auth_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Login is not configured")
    user = authenticate(body.username, body.password)
    if user is None:
        logger.warning("Failed login for username %r", body.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    try:
        return issue_token(user)
    except AuthError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc


@router.get("/accounts", response_model=list[DemoAccount])
async def list_accounts() -> list[DemoAccount]:
    """Login quick-pick accounts; passwords are only exposed outside production."""
    return [
        DemoAccount(
            username=account.username,
            display_name=account.display_name,
            role=account.role,
            password=None if settings.is_production else account.password,
        )
        for account in settings.auth_users
    ]
