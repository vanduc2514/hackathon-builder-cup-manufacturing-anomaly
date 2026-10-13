"""Shared pytest fixtures: signs every API test in as a test user unless marked real_auth."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

import backend.api.main as main_module
from backend.core.auth import require_user
from backend.core.models import AuthRole, AuthUser

# Test modules bind `app` at collection; a test may reload backend.api.main and get a new one.
_COLLECTED_APP = main_module.app


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "real_auth: run without the require_user override")


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
