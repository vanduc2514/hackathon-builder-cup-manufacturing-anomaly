"""Tests for the Cloud Run production container configuration and runtime settings."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from backend.core.config import Settings

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_dockerfile_multi_stage_structure():
    """Validates multi-stage build, non-root user, and dynamic port configuration in Dockerfile."""
    dockerfile_path = REPO_ROOT / "Dockerfile"
    assert dockerfile_path.exists(), "Dockerfile must exist at repository root"

    content = dockerfile_path.read_text()

    # Multi-stage validation
    assert "FROM python:3.11-slim AS builder" in content
    assert "FROM python:3.11-slim AS runner" in content
    assert "COPY --from=builder" in content

    # Least-privilege non-root user
    assert "useradd -r" in content
    assert "appuser" in content
    assert "USER 10001:10001" in content

    # Dynamic Cloud Run port and host binding
    assert "EXPOSE 8080" in content
    assert "--host 0.0.0.0" in content
    assert "${PORT:-8080}" in content

    # Health check definition
    assert "HEALTHCHECK" in content
    assert "/health" in content

    # Decoupled simulator and local ollama (not copied or bundled in production Cloud Run container)
    assert "simulator" not in content
    assert "ollama" not in content.lower()


def test_dockerignore_exclusions():
    """Validates that .dockerignore excludes source repositories, virtualenvs, and test artifacts."""
    dockerignore_path = REPO_ROOT / ".dockerignore"
    assert dockerignore_path.exists(), ".dockerignore must exist at repository root"

    content = dockerignore_path.read_text()
    ignored_patterns = [
        line.strip() for line in content.splitlines() if line.strip() and not line.startswith("#")
    ]

    expected_ignored = [".git", ".venv", "tests/", "apps/", ".cache/", "__pycache__/"]
    for pattern in expected_ignored:
        assert any(pattern in line for line in ignored_patterns), (
            f"{pattern} should be in .dockerignore"
        )


def test_config_cloud_run_environment_resolution(monkeypatch: pytest.MonkeyPatch):
    """Validates that Settings handles Cloud Run PORT injection, app_env, and Vertex AI ADC mode."""
    # 1. Cloud Run dynamic PORT injection
    monkeypatch.setenv("PORT", "8080")
    monkeypatch.delenv("API_PORT", raising=False)
    settings = Settings()
    assert settings.port == 8080

    # 2. Fallback to API_PORT if PORT not present
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("API_PORT", "9090")
    settings = Settings()
    assert settings.port == 9090

    # 3. Production environment flag
    monkeypatch.setenv("APP_ENV", "production")
    settings = Settings()
    assert settings.is_production is True

    # 4. ADC authentication with Vertex AI without API key in production
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "true")
    prod_settings = Settings(ai_provider="gemini")
    assert prod_settings.ai_provider == "gemini"


def test_cors_allows_only_configured_hosting_origins(monkeypatch: pytest.MonkeyPatch):
    """CORS_ORIGINS (comma-separated, blanks ignored) gates cross-origin reads; empty disables CORS."""
    import importlib

    from fastapi.testclient import TestClient

    import backend.api.main as main_module
    from backend.core.config import settings

    web, mobile = "https://kaizen-lab-web.web.app", "https://kaizen-lab-mobile.web.app"
    monkeypatch.setattr(settings, "cors_origins", f" {web} , ,{mobile}")
    try:
        client = TestClient(importlib.reload(main_module).app)
        for origin in (web, mobile):
            res = client.get("/health", headers={"Origin": origin})
            assert res.headers.get("access-control-allow-origin") == origin
        denied = client.get("/health", headers={"Origin": "https://evil.example"})
        assert "access-control-allow-origin" not in denied.headers

        monkeypatch.setattr(settings, "cors_origins", "")
        client = TestClient(importlib.reload(main_module).app)
        res = client.get("/health", headers={"Origin": web})
        assert "access-control-allow-origin" not in res.headers
    finally:
        monkeypatch.undo()
        importlib.reload(main_module)


def test_api_docs_are_served_only_outside_production(monkeypatch: pytest.MonkeyPatch):
    """/docs, /redoc and /openapi.json map every route, so production must not serve them."""
    import importlib

    from fastapi.testclient import TestClient

    import backend.api.main as main_module
    from backend.core.config import settings

    docs_paths = ("/docs", "/redoc", "/openapi.json")
    try:
        monkeypatch.setattr(settings, "app_env", "production")
        client = TestClient(importlib.reload(main_module).app)
        assert [client.get(path).status_code for path in docs_paths] == [404, 404, 404]
        assert client.get("/health").status_code == 200

        monkeypatch.setattr(settings, "app_env", "development")
        client = TestClient(importlib.reload(main_module).app)
        assert [client.get(path).status_code for path in docs_paths] == [200, 200, 200]
    finally:
        monkeypatch.undo()
        importlib.reload(main_module)


def test_backend_has_zero_import_dependencies_on_simulator():
    """Verifies that backend modules have zero import dependencies on simulator package."""
    code = (
        "import sys\n"
        "sys.modules['simulator'] = None\n"
        "sys.modules['simulator.injection_engine'] = None\n"
        "sys.modules['simulator.conveyor_simulator'] = None\n"
        "sys.modules['simulator.machine_simulator'] = None\n"
        "sys.modules['simulator.models'] = None\n"
        "import backend.agents.agent_quality_inspector\n"
        "import backend.agents.orchestrator\n"
        "import backend.agents.workflow_nodes\n"
        "import backend.api.main\n"
        "import backend.api.routes_simulation\n"
    )
    env = dict(os.environ)
    env["PYTHONPATH"] = "."
    res = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env)
    assert res.returncode == 0, f"Import failed without simulator:\n{res.stderr}"
