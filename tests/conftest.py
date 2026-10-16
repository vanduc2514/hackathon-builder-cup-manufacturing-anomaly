"""Shared pytest fixtures: test sign-in (unless real_auth), rate limits off (unless rate_limit),
and emulator env isolation (unless emulator) so the suite never depends on local emulator state.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from google.adk.agents import LlmAgent

import backend.api.main as main_module
from backend.agents.mock_llm import MockLlm
from backend.core.auth import require_user
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.firestore_adapter import get_firestore_adapter, reset_firestore_adapter
from backend.core.models import AuthRole, AuthUser
from backend.core.pubsub_manager import pubsub_manager
from backend.core.rate_limit import rate_limiter

# Test modules bind `app` at collection; a test may reload backend.api.main and get a new one.
_COLLECTED_APP = main_module.app

# Env vars a local `mise.local.toml` / docker-compose may export to point at local emulators.
# Settings reads these once at import time into module-level singletons (`settings`, the global
# `blackboard`), so a test run must not depend on whether an emulator container happens to be
# running or seeded (Key Invariant 4) — every test gets the mock/in-memory fallback path unless
# explicitly marked `emulator`.
_EMULATOR_ENV_VARS = (
    "BIGQUERY_EMULATOR_HOST",
    "PUBSUB_EMULATOR_HOST",
    "FIRESTORE_EMULATOR_HOST",
    "VERTEX_SEARCH_EMULATOR_HOST",
)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "real_auth: run without the require_user override")
    config.addinivalue_line("markers", "rate_limit: run with rate limiting enabled")
    config.addinivalue_line(
        "markers", "emulator: requires a reachable local emulator; not isolated from it"
    )


@pytest.fixture(autouse=True)
def _emulator_env_isolation(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch
) -> None:
    if request.node.get_closest_marker("emulator"):
        return
    for var in _EMULATOR_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(settings, "bigquery_emulator_host", None)
    monkeypatch.setattr(settings, "pubsub_emulator_host", None)
    monkeypatch.setattr(settings, "firestore_emulator_host", None)
    monkeypatch.setattr(settings, "evidence_wait_seconds", 0.0)
    pubsub_manager.reset_availability_cache()
    reset_firestore_adapter()
    blackboard.set_storage(get_firestore_adapter())


@pytest.fixture(autouse=True)
def _mock_llm_default(request: pytest.FixtureRequest) -> Iterator[None]:
    """Forces the ADK default model back to MockLlm (unless `emulator`).

    `backend.agents.orchestrator` calls `LlmAgent.set_default_model(...)` once at import
    time based on `settings.ai_provider`. A local `AI_PROVIDER=ollama`/`gemini` override
    (e.g. via `mise.local.toml`) therefore survives every later `monkeypatch.setattr(settings,
    "ai_provider", ...)`, routing tests through a real, non-deterministic LLM instead of the
    mock — causing both slow (100s+) and flaky (content-assertion) failures. Tests that need a
    specific model call `LlmAgent.set_default_model(...)` themselves inside the test body/fixture,
    which runs after this one and takes precedence.
    """
    if request.node.get_closest_marker("emulator"):
        yield
        return
    saved = LlmAgent._default_model
    LlmAgent.set_default_model(MockLlm())
    yield
    LlmAgent._default_model = saved


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
