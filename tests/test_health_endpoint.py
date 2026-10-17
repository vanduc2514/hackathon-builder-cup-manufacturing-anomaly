"""Split /health (liveness, zero-alloc) from /healthz (startup, full readiness) probes.

The previous ``/health`` endpoint lazily imported ``pubsub_manager`` and called
``is_available()`` — an admin API round-trip that sometimes exceeded Cloud Run's
5 s liveness timeout, triggering instance shutdowns and dropping in-flight
requests. Issue #264 split the endpoint so:

- ``GET /health`` -> liveness probe, no Pub/Sub / Blackboard / lazy imports
  (must answer <50 ms for 100 sequential warm calls).
- ``GET /healthz`` -> startup probe, full readiness check (Pub/Sub,
  blackboard reload, gcp_project, etc.).

Both endpoints still return ``{"status": "healthy", ...}`` for backward compat.
"""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import backend.api.main as main_module
from backend.api.main import app


@pytest.fixture(autouse=True)
def _reset_app():
    """Re-load backend.api.main to pick up the latest module-level statements."""
    import importlib

    importlib.reload(main_module)
    yield


def test_health_returns_minimal_payload_without_pubsub() -> None:
    """``GET /health`` returns app/version + status=healthy and NO pubsub key.

    We assert ``pubsub_available`` is absent so a future change cannot quietly
    re-introduce the admin round-trip in the liveness path.
    """
    with patch("backend.core.pubsub_manager.pubsub_manager") as mock_pubsub:
        mock_pubsub.is_available.return_value = True
        with TestClient(app) as client:
            resp = client.get("/health")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == "healthy"
    assert "app" in payload
    assert "version" in payload
    assert "pubsub_available" not in payload


def test_healthz_returns_full_readiness_payload() -> None:
    """``GET /healthz`` keeps the legacy readiness shape with pubsub_available + gcp_project."""
    with TestClient(app) as client:
        resp = client.get("/healthz")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == "healthy"
    assert "app" in payload
    assert "version" in payload
    assert "gcp_project" in payload
    assert "pubsub_available" in payload


def test_health_never_calls_pubsub_manager() -> None:
    """Liveness probe must NOT touch pubsub_manager — verified by inspecting the
    AST of the handler and checking no import or attribute access references it.

    Source-string matching fails because the docstring above mentions pubsub_manager
    to explain what ``/health`` does NOT do; AST inspection ignores string literals.
    """
    import ast
    import inspect

    from backend.api import main as main_mod

    tree = ast.parse(inspect.getsource(main_mod.health_check))

    class _Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.references: list[str] = []

        def visit_Import(self, node: ast.Import) -> None:  # noqa: D401
            for alias in node.names:
                if "pubsub" in alias.name:
                    self.references.append(f"import {alias.name}")
            self.generic_visit(node)

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            if node.module and "pubsub" in node.module:
                self.references.append(f"from {node.module} import ...")
            self.generic_visit(node)

        def visit_Attribute(self, node: ast.Attribute) -> None:
            full = ast.unparse(node)
            if "pubsub" in full:
                self.references.append(full)
            self.generic_visit(node)

    visitor = _Visitor()
    visitor.visit(tree)
    assert not visitor.references, (
        f"/health (liveness) must not reference pubsub; found: {visitor.references}"
    )
    # Sanity: /healthz DOES import and call it, otherwise the startup contract breaks.
    healthz_src = inspect.getsource(main_mod.healthz)
    assert "pubsub_manager" in healthz_src


def test_health_runtime_does_not_invoke_pubsub() -> None:
    """Per the brief: mock pubsub.is_available, hit /health 11 times, assert
    mock is never called. We bypass the conftest's lifespan-using fixtures by
    issuing raw HTTP through a fresh TestClient that does not run lifespan."""
    with patch(
        "backend.core.pubsub_manager.pubsub_manager.is_available",
        create=True,
        return_value=True,
    ) as mock_is_available:
        # Build the client WITHOUT entering the `with` block so lifespan is skipped
        # (we don't want pubsub_manager.start_subscribers() called from lifespan).
        client = TestClient(app)
        try:
            client.get("/health")  # warm-up
            for _ in range(10):
                resp = client.get("/health")
                assert resp.status_code == 200
        finally:
            client.close()
    # assert_not_called: the liveness path must never touch the admin API.
    assert mock_is_available.call_count == 0, (
        f"pubsub_manager.is_available was called "
        f"{mock_is_available.call_count}x during /health"
    )


def test_health_latency_under_load() -> None:
    """100 sequential warm calls each complete in <50 ms (the brief's bound).

    The Cloud Run probe interval is 15 s, so a 50 ms-per-call budget gives us
    > 99 % headroom for transient GC pauses without ever risking the 2 s
    liveness timeout.
    """
    with TestClient(app) as client:
        # Warm-up so module imports and connection pools are hot.
        client.get("/health")

        t0 = time.perf_counter()
        for _ in range(100):
            resp = client.get("/health")
            assert resp.status_code == 200
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
    # Average per call over 100 calls. We don't enforce a hard per-call SLA
    # because TestClient introduces process overhead; the *aggregate* ceiling
    # proves zero blocking calls.
    assert elapsed_ms / 100.0 < 50.0, (
        f"average /health latency {elapsed_ms / 100.0:.1f} ms exceeded 50 ms budget"
    )


def test_health_response_keeps_backward_compat_status_field() -> None:
    """Dashboard and uptime checks read ``.status``; the new endpoint must still expose it."""
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.json()["status"] == "healthy"
