"""Core LLM: maps AI_PROVIDER to the ADK default model used by every model-less agent."""

from __future__ import annotations

import logging
import os

from google.adk.agents import LlmAgent

from backend.core.config import settings

logger = logging.getLogger(__name__)


def configure_default_model() -> str:
    """Sets the ADK default model from settings and returns the model string.

    ADK's LLMRegistry resolves the string: ``ollama_chat/...`` -> LiteLlm, ``gemini-...`` -> Gemini.
    """
    if settings.ai_provider == "ollama":
        os.environ.setdefault("OLLAMA_API_BASE", settings.ollama_host)
        # `ollama_chat/` (not `ollama/`) avoids tool-call loops in LiteLLM.
        name = f"ollama_chat/{settings.ollama_model}"
    else:
        if not (os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")):
            raise ValueError("AI_PROVIDER=gemini requires GOOGLE_API_KEY")
        name = settings.gemini_model
    LlmAgent.set_default_model(name)
    logger.info("LLM provider=%s model=%s", settings.ai_provider, name)
    return name
