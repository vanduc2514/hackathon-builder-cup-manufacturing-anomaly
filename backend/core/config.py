"""Core Config: Application configuration and settings."""

from __future__ import annotations

import os
from typing import Literal, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Kaizen Agent Platform"
    version: str = "0.1.0"
    debug: bool = True
    port: int = 8000
    host: str = "0.0.0.0"
    log_level: str = "INFO"
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "kaizen-local")
    gcp_region: str = os.getenv("GCP_REGION", "asia-southeast1")

    # BigQuery / Emulator settings
    bigquery_emulator_host: Optional[str] = os.getenv("BIGQUERY_EMULATOR_HOST", None)
    bigquery_dataset: str = os.getenv("BIGQUERY_DATASET", "manufacturing")

    # LLM provider switch (ollama for local tests, gemini for deploy)
    ai_provider: Literal["ollama", "gemini"] = "ollama"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma2:2b"
    gemini_model: str = "gemini-flash-latest"

    # Pause between simulated conveyor verification batches (seconds)
    simulation_step_delay: float = 0.4

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
