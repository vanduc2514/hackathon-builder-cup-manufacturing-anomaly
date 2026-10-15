"""Tests for the per-caller rate limits, anonymous pass-through and stream cap (backend/core/rate_limit.py)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.api.main import app
from backend.core.config import settings
from backend.core.models import AuthAccount, AuthRole
from backend.core.rate_limit import RateLimiter, Rule

pytestmark = [pytest.mark.rate_limit, pytest.mark.real_auth]

SECRET = "test-auth-secret-0123456789-abcdefghijkl"
TECH = AuthAccount(
    username="technician", password="pw-tech", role=AuthRole.TECHNICIAN, display_name="Red Panda"
)
LEAD = AuthAccount(
    username="shiftleader", password="pw-lead", role=AuthRole.SHIFT_LEADER, display_name="Sea Otter"
)


@pytest.fixture(autouse=True)
def _settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_secret", SECRET)
    monkeypatch.setattr(settings, "auth_users", [TECH, LEAD])
    monkeypatch.setattr(settings, "rate_limit_per_minute", 3)
    monkeypatch.setattr(settings, "rate_limit_write_per_minute", 2)
    monkeypatch.setattr(settings, "rate_limit_max_streams", 1)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _token(client: TestClient, username: str, password: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def test_bucket_refills_at_the_configured_rate() -> None:
    now = [0.0]
    limiter = RateLimiter(clock=lambda: now[0])
    rule = Rule("r", capacity=2, period=60.0)
    assert limiter.hit(rule, "k") is None
    assert limiter.hit(rule, "k") is None
    assert limiter.hit(rule, "k") == pytest.approx(30.0)
    assert limiter.hit(rule, "other") is None
    now[0] = 30.0
    assert limiter.hit(rule, "k") is None
    assert limiter.hit(rule, "k") is not None


def test_signed_in_users_have_separate_buckets(client: TestClient) -> None:
    tech = {"Authorization": f"Bearer {_token(client, 'technician', 'pw-tech')}"}
    lead = {"Authorization": f"Bearer {_token(client, 'shiftleader', 'pw-lead')}"}
    codes = [client.get("/api/simulation/status", headers=tech).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    res = client.get("/api/simulation/status", headers=tech)
    assert res.json() == {"detail": "Too many requests"}
    assert int(res.headers["retry-after"]) >= 1
    assert client.get("/api/simulation/status", headers=lead).status_code == 200


def test_writes_have_a_tighter_limit_than_reads(client: TestClient) -> None:
    auth = {"Authorization": f"Bearer {_token(client, 'technician', 'pw-tech')}"}
    body = {"downtime_minutes": 10}
    codes = [
        client.post("/api/impact/calculate", json=body, headers=auth).status_code for _ in range(3)
    ]
    assert codes[-1] == 429
    assert 429 not in codes[:2]
    assert client.get("/api/simulation/status", headers=auth).status_code == 200


def test_open_streams_are_capped_per_caller(client: TestClient) -> None:
    token = _token(client, "technician", "pw-tech")
    url = f"/api/gemini-live/ws?mode=simulation&token={token}"
    with client.websocket_connect(url) as first:
        assert first.receive_json()["type"] == "setup_complete"
        with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect(url):
            pass
        assert exc.value.code == 1008
    with client.websocket_connect(url) as again:
        assert again.receive_json()["type"] == "setup_complete"


def test_anonymous_calls_are_not_limited(client: TestClient) -> None:
    assert {client.get("/health").status_code for _ in range(10)} == {200}
    codes = {
        client.post("/api/auth/login", json={"username": "technician", "password": "x"}).status_code
        for _ in range(10)
    }
    assert codes == {401}
    assert _token(client, "technician", "pw-tech")
