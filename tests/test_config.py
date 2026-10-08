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
