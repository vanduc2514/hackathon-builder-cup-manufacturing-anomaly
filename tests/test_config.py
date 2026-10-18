"""Unit tests for backend.core.config Settings: AI_PROVIDER -> ADK model string switch."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.core.config import Settings


@pytest.fixture(autouse=True)
def no_api_keys(monkeypatch: pytest.MonkeyPatch):
    for var in ("GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(var, raising=False)


def test_ollama_uses_litellm_chat_model():
    assert Settings(ai_provider="ollama", ollama_model="gemma2:2b").llm_model == (
        "ollama_chat/gemma2:2b"
    )


def test_gemini_without_key_fails_fast():
    with pytest.raises(ValidationError, match="GOOGLE_API_KEY"):
        Settings(ai_provider="gemini")


@pytest.mark.parametrize("key_var", ["GOOGLE_API_KEY", "GEMINI_API_KEY"])
def test_gemini_with_key_uses_gemini_model(monkeypatch: pytest.MonkeyPatch, key_var: str):
    monkeypatch.setenv(key_var, "k")
    settings = Settings(ai_provider="gemini", gemini_model="gemini-flash-latest")
    assert settings.llm_model == "gemini-flash-latest"


def test_mock_ai_provider():
    settings = Settings(ai_provider="mock")
    assert settings.llm_model == "mock"


def test_fallback_settings_default_true():
    settings = Settings()
    assert settings.bigquery_fallback_to_mock is True
    assert settings.rag_fallback_to_local is True


def test_rate_limit_max_streams_default():
    settings = Settings()
    assert settings.rate_limit_max_streams == 100


MOCK_FALLBACK_FLAGS = (
    "bigquery_fallback_to_mock",
    "rag_fallback_to_local",
    "gemini_vision_fallback_to_mock",
    "firestore_fallback_to_memory",
)


def test_production_disables_mock_fallbacks_by_default():
    settings = Settings(app_env="production")
    assert all(getattr(settings, flag) is False for flag in MOCK_FALLBACK_FLAGS)


def test_development_keeps_mock_fallbacks_enabled():
    settings = Settings(app_env="development")
    assert all(getattr(settings, flag) is True for flag in MOCK_FALLBACK_FLAGS)


def test_production_fallback_can_be_enabled_explicitly(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RAG_FALLBACK_TO_LOCAL", "true")
    settings = Settings(app_env="production")
    assert settings.rag_fallback_to_local is True
    assert settings.bigquery_fallback_to_mock is False
