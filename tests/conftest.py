"""Shared pytest fixtures: test sign-in (unless real_auth) and rate limits off (unless rate_limit)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

import backend.api.main as main_module
from backend.core.auth import require_user
from backend.core.config import settings
from backend.core.models import AuthRole, AuthUser
from backend.core.rate_limit import rate_limiter

# Test modules bind `app` at collection; a test may reload backend.api.main and get a new one.
_COLLECTED_APP = main_module.app


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "real_auth: run without the require_user override")
    config.addinivalue_line("markers", "rate_limit: run with rate limiting enabled")


@pytest.fixture(autouse=True)
def _rate_limits(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    # The suite fires far more requests per minute from one client than any real caller.
    enabled = request.node.get_closest_marker("rate_limit") is not None
    monkeypatch.setattr(settings, "rate_limit_enabled", enabled)
    rate_limiter.reset()


@pytest.fixture(autouse=True)
def _signed_in_user(request: pytest.FixtureRequest) -> Iterator[None]:
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    apps = {id(a): a for a in (_COLLECTED_APP, main_module.app)}.values()
    user = AuthUser(username="test", display_name="Test", role=AuthRole.TECHNICIAN)
    for app in apps:
        app.dependency_overrides[require_user] = lambda: user
    yield
    for app in apps:
        app.dependency_overrides.pop(require_user, None)
