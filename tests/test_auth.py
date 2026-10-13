"""Tests for username/password login and the token gate on /api routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.api.main import app
from backend.core.config import settings
from backend.core.models import AuthAccount, AuthRole

pytestmark = pytest.mark.real_auth

SECRET = "test-auth-secret-0123456789-abcdefghijkl"
TECH = AuthAccount(
    username="technician", password="pw-tech", role=AuthRole.TECHNICIAN, display_name="Minh Tran"
)
LEAD = AuthAccount(
    username="shiftleader",
    password="pw-lead",
    role=AuthRole.SHIFT_LEADER,
    display_name="John Tran",
)


@pytest.fixture(autouse=True)
def _accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_secret", SECRET)
    monkeypatch.setattr(settings, "auth_users", [TECH, LEAD])


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, username: str = "technician", password: str = "pw-tech") -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def test_login_matches_username_case_insensitively(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"username": " Technician ", "password": "pw-tech"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"] == {
        "username": "technician",
        "display_name": "Minh Tran",
        "role": "technician",
    }
    assert body["token"]


@pytest.mark.parametrize(
    ("username", "password"), [("technician", "pw-lead"), ("nobody", "pw-tech")]
)
def test_login_rejects_bad_credentials(client: TestClient, username: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid username or password"


def test_login_unavailable_without_accounts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "auth_users", [])
    res = client.post("/api/auth/login", json={"username": "technician", "password": "pw-tech"})
    assert res.status_code == 503


def test_accounts_expose_passwords_only_outside_production(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    res = client.get("/api/auth/accounts")
    assert res.status_code == 200
    assert {a["username"]: a["password"] for a in res.json()} == {
        "technician": "pw-tech",
        "shiftleader": "pw-lead",
    }

    monkeypatch.setattr(settings, "app_env", "production")
    accounts = client.get("/api/auth/accounts").json()
    assert len(accounts) == 2
    assert all(a["password"] is None for a in accounts)


def test_api_requires_token(client: TestClient) -> None:
    res = client.get("/api/simulation/status")
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


def test_bearer_header_and_query_token_are_accepted(client: TestClient) -> None:
    token = _login(client, "shiftleader", "pw-lead")
    res = client.get("/api/simulation/status", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert client.get(f"/api/incidents/current?token={token}").status_code == 200


def _expired_token() -> str:
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    return jwt.encode({"sub": "technician", "iat": past, "exp": past}, SECRET, algorithm="HS256")


def _foreign_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode({"sub": "technician", "exp": exp}, "x" * 40, algorithm="HS256")


@pytest.mark.parametrize("make_token", [lambda: "garbage", _expired_token, _foreign_token])
def test_invalid_tokens_are_rejected(client: TestClient, make_token) -> None:
    res = client.get("/api/simulation/status", headers={"Authorization": f"Bearer {make_token()}"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid or expired token"


def test_token_of_removed_account_is_rejected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = _login(client)
    monkeypatch.setattr(settings, "auth_users", [LEAD])
    res = client.get("/api/simulation/status", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_websocket_without_token_is_closed_with_policy_violation(client: TestClient) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        client.websocket_connect("/api/gemini-live/ws?mode=simulation"),
    ):
        pass
    assert exc.value.code == 1008


def test_health_stays_public(client: TestClient) -> None:
    assert client.get("/health").status_code == 200
