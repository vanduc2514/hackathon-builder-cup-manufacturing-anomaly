"""Unit tests for the AI_PROVIDER -> ADK default model switch."""

from __future__ import annotations

import os

import pytest
from google.adk.agents import LlmAgent

from backend.core.config import settings
from backend.core.llm import configure_default_model


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch: pytest.MonkeyPatch):
    for var in ("OLLAMA_API_BASE", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(settings, "ollama_host", "http://localhost:11434")
    monkeypatch.setattr(settings, "ollama_model", "gemma2:2b")
    monkeypatch.setattr(settings, "gemini_model", "gemini-flash-latest")
    saved = LlmAgent._default_model
    yield
    LlmAgent._default_model = saved


def test_ollama_sets_litellm_model_and_api_base(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    name = configure_default_model()
    assert name == "ollama_chat/gemma2:2b"
    assert LlmAgent._default_model == name
    assert os.environ["OLLAMA_API_BASE"] == "http://localhost:11434"


def test_gemini_without_key_fails_fast(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    with pytest.raises(ValueError, match="GOOGLE_API_KEY"):
        configure_default_model()


def test_gemini_with_key_uses_gemini_model(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "k")
    assert configure_default_model() == "gemini-flash-latest"
    assert LlmAgent._default_model == "gemini-flash-latest"
