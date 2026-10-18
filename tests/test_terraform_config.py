"""Tests verifying Terraform configuration and production environment variables."""

from __future__ import annotations

from pathlib import Path

from backend.core.config import Settings


def test_terraform_copilot_uses_gemini_model_without_live_settings() -> None:
    """The Copilot streams from GEMINI_MODEL; the retired Gemini Live variables are gone."""
    tf_dir = Path(__file__).resolve().parent.parent / "infra" / "terraform"
    variables_tf = (tf_dir / "variables.tf").read_text(encoding="utf-8")
    cloud_run_tf = (tf_dir / "cloud_run.tf").read_text(encoding="utf-8")
    tfvars_example = (tf_dir / "terraform.tfvars.example").read_text(encoding="utf-8")

    assert 'variable "gemini_model"' in variables_tf
    assert "GEMINI_MODEL                = var.gemini_model" in cloud_run_tf

    for text in (variables_tf, cloud_run_tf, tfvars_example):
        assert "gemini_live" not in text
        assert "GEMINI_LIVE" not in text


def test_gemini_live_settings_are_retired() -> None:
    """Settings no longer carries Gemini Live / simulation fields."""
    s = Settings()
    for name in (
        "gemini_live_model",
        "gemini_live_endpoint",
        "gemini_live_voice",
        "gemini_live_language",
        "gemini_live_simulation_mode",
    ):
        assert not hasattr(s, name)
