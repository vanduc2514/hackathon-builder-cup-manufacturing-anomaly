"""Core Config: Application settings, read from env vars provided by mise."""

from __future__ import annotations

import os
from typing import Literal

from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Reads each field from the same-named env var (case-insensitive)."""

    app_name: str = "Kaizen Agent Platform"
    version: str = "0.1.0"
    log_level: str = "INFO"
    gcp_project_id: str = "kaizen-local"
    gcp_region: str = "asia-southeast1"

    # BigQuery / Emulator settings
    bigquery_emulator_host: str | None = None
    bigquery_dataset: str = "manufacturing"

    # Vertex AI Search / Discovery Engine settings
    vertex_search_datastore_id: str = "kaizen-knowledge-store"
    vertex_search_location: str = "global"
    vertex_search_collection: str = "default_collection"
    vertex_search_serving_config: str = "default_search"

    # Gemini Live settings
    gemini_live_model: str = "gemini-2.0-flash-exp"
    gemini_live_endpoint: str | None = None
    gemini_api_key: str | None = None
    gemini_live_voice: str = "Aoede"
    gemini_live_language: str = "vi-VN"
    gemini_live_simulation_mode: bool = True

    # EMQX MQTT Settings
    mqtt_broker_host: str = "broker.emqx.io"
    mqtt_broker_port: int = 1883
    mqtt_broker_ws_port: int = 8084
    mqtt_base_topic: str = "aibuilder/factory01/line01"
    mqtt_keepalive: int = 60
    mqtt_reconnect_min_delay: float = 1.0
    mqtt_reconnect_max_delay: float = 60.0
    mqtt_anomaly_threshold: float = 0.70

    # LLM provider switch (ollama for local tests, gemini for deploy).
    # Ollama endpoint: LiteLLM reads OLLAMA_API_BASE directly (default http://localhost:11434).
    ai_provider: Literal["ollama", "gemini"] = "ollama"
    ollama_model: str = "gemma2:2b"
    gemini_model: str = "gemini-flash-latest"

    # Pause between simulated conveyor verification batches (seconds)
    simulation_step_delay: float = 0.4

    @computed_field
    @property
    def llm_model(self) -> str:
        """ADK model string: ``ollama_chat/...`` resolves to LiteLlm, ``gemini-...`` to Gemini."""
        if self.ai_provider == "ollama":
            # `ollama_chat/` (not `ollama/`) avoids tool-call loops in LiteLLM.
            return f"ollama_chat/{self.ollama_model}"
        return self.gemini_model

    @model_validator(mode="after")
    def _require_gemini_key(self) -> Settings:
        if self.ai_provider == "gemini" and not (
            os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        ):
            raise ValueError("AI_PROVIDER=gemini requires GOOGLE_API_KEY")
        return self


settings = Settings()
