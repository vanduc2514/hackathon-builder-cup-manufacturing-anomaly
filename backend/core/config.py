"""Core Config: Application settings, read from env vars provided by mise."""

from __future__ import annotations

import os
from typing import Any, Literal

from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Reads each field from the same-named env var (case-insensitive)."""

    app_name: str = "Kaizen Agent Platform"
    version: str = "0.1.0"
    log_level: str = "INFO"
    app_env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    gcp_project_id: str = "kaizen-local"
    gcp_region: str = "asia-southeast1"

    # BigQuery / Emulator settings
    bigquery_emulator_host: str | None = None
    bigquery_dataset: str = "manufacturing"
    bigquery_fallback_to_mock: bool = True

    # Google Cloud Pub/Sub / Emulator settings
    pubsub_emulator_host: str | None = None
    pubsub_telemetry_topic: str = "telemetry"
    pubsub_traceability_topic: str = "traceability"
    pubsub_quality_events_topic: str = "quality-events"
    pubsub_telemetry_sub: str = "telemetry-sub"
    pubsub_traceability_sub: str = "traceability-sub"
    pubsub_quality_events_sub: str = "quality-events-sub"
    pubsub_fallback_to_direct: bool = True

    # Vertex AI Search / Discovery Engine settings
    vertex_search_datastore_id: str = "kaizen-knowledge-store"
    vertex_search_location: str = "global"
    vertex_search_collection: str = "default_collection"
    vertex_search_serving_config: str = "default_search"
    rag_fallback_to_local: bool = True

    # Google Drive API v3 settings
    gdrive_folder_id: str | None = None
    gdrive_base_folder: str = "💻 Competition | AI Builder Cup"
    gdrive_service_account_path: str | None = None
    gdrive_cache_dir: str = ".cache/gdrive"

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

    # LLM provider switch (mock for standalone local dev/ci, ollama for local LLM, gemini for deploy).
    # Ollama endpoint: LiteLLM reads OLLAMA_API_BASE directly (default http://localhost:11434).
    ai_provider: Literal["ollama", "gemini", "mock"] = "ollama"
    ollama_model: str = "gemma2:2b"
    gemini_model: str = "gemini-flash-latest"
    google_genai_use_vertexai: bool = False

    # Pause between simulated conveyor verification batches (seconds)
    simulation_step_delay: float = 0.4

    @model_validator(mode="before")
    @classmethod
    def _resolve_network_settings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Resolve port: PORT takes precedence (Cloud Run), followed by API_PORT
            if "port" not in data:
                port_env = os.environ.get("PORT") or os.environ.get("API_PORT")
                if port_env is not None:
                    try:
                        data["port"] = int(port_env)
                    except ValueError:
                        pass
            # Resolve host: HOST or API_HOST
            if "host" not in data:
                host_env = os.environ.get("HOST") or os.environ.get("API_HOST")
                if host_env is not None:
                    data["host"] = host_env
        return data

    @computed_field
    @property
    def is_production(self) -> bool:
        """Indicates whether running in a production deployment environment."""
        return self.app_env.lower() == "production"

    @computed_field
    @property
    def llm_model(self) -> str:
        """ADK model string: ``ollama_chat/...`` resolves to LiteLlm, ``gemini-...`` to Gemini, ``mock`` to MockLlm."""
        if self.ai_provider == "ollama":
            # `ollama_chat/` (not `ollama/`) avoids tool-call loops in LiteLLM.
            return f"ollama_chat/{self.ollama_model}"
        if self.ai_provider == "mock":
            return "mock"
        return self.gemini_model

    @model_validator(mode="after")
    def _require_gemini_key(self) -> Settings:
        if self.ai_provider == "gemini":
            use_vertex = (
                self.google_genai_use_vertexai
                or os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("true", "1")
                or self.is_production
            )
            if not use_vertex and not (
                os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
            ):
                raise ValueError("AI_PROVIDER=gemini requires GOOGLE_API_KEY")
        return self


settings = Settings()
