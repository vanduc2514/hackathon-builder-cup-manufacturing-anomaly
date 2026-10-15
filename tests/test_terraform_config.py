"""Tests verifying Terraform configuration and production environment variables."""

from __future__ import annotations

from pathlib import Path

from backend.core.config import Settings


def test_terraform_gemini_live_variables_and_backend_env() -> None:
    """Verifies that Terraform defines gemini_live_simulation_mode (default false) and injects into Cloud Run."""
    root_dir = Path(__file__).resolve().parent.parent
    variables_tf = (root_dir / "infra" / "terraform" / "variables.tf").read_text(encoding="utf-8")
    cloud_run_tf = (root_dir / "infra" / "terraform" / "cloud_run.tf").read_text(encoding="utf-8")
    tfvars_example = (root_dir / "infra" / "terraform" / "terraform.tfvars.example").read_text(
        encoding="utf-8"
    )

    # 1. variables.tf must define gemini_live_simulation_mode defaulted to false
    assert 'variable "gemini_live_simulation_mode"' in variables_tf
    assert "default     = false" in variables_tf

    # 2. variables.tf must define gemini_live_model
    assert 'variable "gemini_live_model"' in variables_tf
    assert 'default     = "gemini-2.0-flash-exp"' in variables_tf

    # 3. cloud_run.tf must inject both into locals.backend_env
    assert "GEMINI_LIVE_MODEL           = var.gemini_live_model" in cloud_run_tf
    assert (
        "GEMINI_LIVE_SIMULATION_MODE = tostring(var.gemini_live_simulation_mode)" in cloud_run_tf
    )

    # 4. terraform.tfvars.example documents both variables
    assert "gemini_live_model" in tfvars_example
    assert "gemini_live_simulation_mode = false" in tfvars_example


def test_gemini_live_settings_env_parsing(monkeypatch) -> None:
    """Verifies that Settings parses GEMINI_LIVE_SIMULATION_MODE and GEMINI_LIVE_MODEL from env."""
    monkeypatch.setenv("GEMINI_LIVE_SIMULATION_MODE", "false")
    monkeypatch.setenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash")

    s = Settings()
    assert s.gemini_live_simulation_mode is False
    assert s.gemini_live_model == "gemini-2.0-flash"


def test_gemini_live_settings_local_default() -> None:
    """Verifies that in local environment without overrides, simulation mode defaults to True."""
    s = Settings()
    assert s.gemini_live_simulation_mode is True
    assert s.gemini_live_model == "gemini-2.0-flash-exp"
