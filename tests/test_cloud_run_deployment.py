"""Tests for Cloud Run production container configuration, service spec, and deployment scripts."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
import yaml

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


def test_dockerignore_exclusions():
    """Validates that .dockerignore excludes source repositories, virtualenvs, and test artifacts."""
    dockerignore_path = REPO_ROOT / ".dockerignore"
    assert dockerignore_path.exists(), ".dockerignore must exist at repository root"

    content = dockerignore_path.read_text()
    ignored_patterns = [
        line.strip() for line in content.splitlines() if line.strip() and not line.startswith("#")
    ]

    expected_ignored = [".git", ".venv", "tests/", "frontend/", ".cache/", "__pycache__/"]
    for pattern in expected_ignored:
        assert any(pattern in line for line in ignored_patterns), (
            f"{pattern} should be in .dockerignore"
        )


def test_cloudrun_service_yaml_spec():
    """Validates Knative / Cloud Run v2 service specification and resource limits."""
    service_yaml_path = REPO_ROOT / "deploy" / "cloudrun-service.yaml"
    assert service_yaml_path.exists(), "deploy/cloudrun-service.yaml must exist"

    with open(service_yaml_path, "r") as f:
        doc = yaml.safe_load(f)

    assert doc["apiVersion"] == "serving.knative.dev/v1"
    assert doc["kind"] == "Service"
    assert doc["metadata"]["name"] == "kaizen-backend"

    spec = doc["spec"]["template"]["spec"]
    # Session concurrency & timeout for streaming
    assert spec["containerConcurrency"] == 80
    assert spec["timeoutSeconds"] == 3600

    annotations = doc["spec"]["template"]["metadata"]["annotations"]
    assert annotations["run.googleapis.com/execution-environment"] == "gen2"
    assert annotations["run.googleapis.com/startup-cpu-boost"] == "true"
    assert annotations["autoscaling.knative.dev/maxScale"] == "10"

    container = spec["containers"][0]
    assert container["name"] == "kaizen-backend"
    assert container["resources"]["limits"]["cpu"] == "2000m"
    assert container["resources"]["limits"]["memory"] == "2Gi"

    # Environment variables
    env_map = {env["name"]: env["value"] for env in container["env"]}
    assert env_map["APP_ENV"] == "production"
    assert env_map["GOOGLE_GENAI_USE_VERTEXAI"] == "true"
    assert env_map["AI_PROVIDER"] == "gemini"

    # Health probes
    assert container["startupProbe"]["httpGet"]["path"] == "/healthz"
    assert container["livenessProbe"]["httpGet"]["path"] == "/health"


def test_setup_workload_identity_script():
    """Validates execution and least-privilege IAM bindings in setup_workload_identity.sh."""
    script_path = REPO_ROOT / "scripts" / "setup_workload_identity.sh"
    assert script_path.exists(), "scripts/setup_workload_identity.sh must exist"
    assert os.access(script_path, os.X_OK), "Script must be executable"

    result = subprocess.run(
        [
            str(script_path),
            "--dry-run",
            "--project",
            "test-project-123",
            "--service-account",
            "test-sa",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    stdout = result.stdout
    assert "test-project-123" in stdout
    assert "test-sa@test-project-123.iam.gserviceaccount.com" in stdout

    # Least-privileged IAM roles verified
    required_roles = [
        "roles/aiplatform.user",
        "roles/bigquery.dataViewer",
        "roles/bigquery.jobUser",
        "roles/datastore.user",
        "roles/storage.objectViewer",
        "roles/logging.logWriter",
        "roles/run.invoker",
    ]
    for role in required_roles:
        assert role in stdout, f"Missing required IAM role: {role}"


def test_deploy_cloud_run_script_dry_run():
    """Validates scripts/deploy_cloud_run.sh execution with dry-run, yaml templating, and iam flags."""
    script_path = REPO_ROOT / "scripts" / "deploy_cloud_run.sh"
    assert script_path.exists(), "scripts/deploy_cloud_run.sh must exist"
    assert os.access(script_path, os.X_OK), "Script must be executable"

    result = subprocess.run(
        [
            str(script_path),
            "--dry-run",
            "--setup-iam",
            "--apply-yaml",
            "--project",
            "test-deploy-proj",
            "--image-tag",
            "v1.0.0",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    stdout = result.stdout
    assert "test-deploy-proj" in stdout
    assert (
        "asia-southeast1-docker.pkg.dev/test-deploy-proj/kaizen-agent/kaizen-backend:v1.0.0"
        in stdout
    )
    assert "docker build" in stdout
    assert "gcloud run services replace" in stdout
    assert "Cloud Run Deployment Succeeded!" in stdout


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


def test_mise_tasks_defined():
    """Validates that mise.toml defines deploy:iam and deploy:backend tasks."""
    mise_toml_path = REPO_ROOT / "mise.toml"
    assert mise_toml_path.exists(), "mise.toml must exist"

    content = mise_toml_path.read_text()
    assert '[tasks."deploy:iam"]' in content
    assert '[tasks."deploy:backend"]' in content
    assert '[tasks."deploy:backend:dry"]' in content
